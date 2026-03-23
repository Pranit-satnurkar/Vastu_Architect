import os
import json
from dotenv import load_dotenv
import google.generativeai as genai
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PDF_DIR = "PDF"
DB_DIR = "db_vastu_rules"

genai.configure(api_key=GEMINI_API_KEY)


def get_embeddings():
    return GoogleGenerativeAIEmbeddings(
        model="models/embedding-001",
        google_api_key=GEMINI_API_KEY
    )


def ingest_vastu_knowledge(pdf_dir=PDF_DIR, db_dir=DB_DIR):
    if not os.path.exists(pdf_dir):
        print(f"[ERROR] PDF directory '{pdf_dir}' not found.")
        return None

    print(f"[INFO] Loading PDFs from {pdf_dir}...")
    loader = DirectoryLoader(
        pdf_dir, glob="*.pdf", loader_cls=PyPDFLoader)
    documents = loader.load()

    if not documents:
        print("[WARN] No PDFs found.")
        return None

    print(f"[INFO] Found {len(documents)} pages. Splitting...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, chunk_overlap=200)
    texts = splitter.split_documents(documents)

    print(f"[INFO] Creating embeddings with Gemini...")
    embeddings = get_embeddings()

    vectordb = Chroma.from_documents(
        documents=texts,
        embedding=embeddings,
        persist_directory=db_dir
    )
    vectordb.persist()
    print(f"[SUCCESS] Knowledge Base saved to '{db_dir}'.")
    return vectordb


def get_vastu_retriever(db_dir=DB_DIR):
    if not os.path.exists(db_dir):
        print("[INFO] Building knowledge base...")
        db = ingest_vastu_knowledge(db_dir=db_dir)
        if db is None:
            return None
        return db.as_retriever(search_kwargs={"k": 3})

    embeddings = get_embeddings()
    vectordb = Chroma(
        persist_directory=db_dir,
        embedding_function=embeddings
    )
    return vectordb.as_retriever(search_kwargs={"k": 3})


def query_vastu_rules(room_name, retriever):
    if retriever is None:
        return ""
    print(f"[INFO] Querying rules for: {room_name}")
    try:
        docs = retriever.invoke(
            f"Vastu rules for {room_name} location direction zone")
        return "\n\n".join([d.page_content for d in docs])
    except Exception as e:
        print(f"[ERROR] Retrieval failed: {e}")
        return ""


def extract_vastu_constraints(room_name, context_text):
    if not context_text:
        return get_fallback_constraints(room_name)
    
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0
        )
        
        prompt = ChatPromptTemplate.from_template("""
You are a Vastu Shastra expert.
Based on this context, extract Vastu zones for {room}.
Valid zones: NE, E, SE, S, SW, W, NW, N, C

Context: {context}

Reply ONLY with valid JSON, no markdown:
{{"room": "{room}", "allowed_quadrants": ["zone1"], "forbidden": ["zone2"], "reason": "brief reason"}}
        """)
        
        chain = prompt | llm
        result = chain.invoke({
            "room": room_name, 
            "context": context_text
        })
        
        text = result.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
        
    except Exception as e:
        print(f"[ERROR] Gemini extraction failed: {e}")
        return get_fallback_constraints(room_name)


def get_fallback_constraints(room_name):
    fallbacks = {
        "Kitchen":        {"allowed_quadrants": ["SE"], "forbidden": ["NE", "SW"]},
        "Master Bedroom": {"allowed_quadrants": ["SW"], "forbidden": ["NE"]},
        "Bedroom":        {"allowed_quadrants": ["S", "SW", "W"], "forbidden": ["NE"]},
        "Living Room":    {"allowed_quadrants": ["NE", "N", "E"], "forbidden": ["SW"]},
        "Toilet":         {"allowed_quadrants": ["NW", "W"], "forbidden": ["NE", "SW"]},
        "Pooja":          {"allowed_quadrants": ["NE"], "forbidden": ["S", "SW"]},
        "Dining":         {"allowed_quadrants": ["E", "SE"], "forbidden": []},
    }
    
    for key in fallbacks:
        if key.lower() in room_name.lower():
            return {"room": room_name, **fallbacks[key], 
                    "reason": "fallback rules"}
    
    return {"room": room_name, 
            "allowed_quadrants": [], 
            "forbidden": [],
            "reason": "unknown room"}


if __name__ == "__main__":
    ingest_vastu_knowledge()
    retriever = get_vastu_retriever()
    if retriever:
        rules = query_vastu_rules("Kitchen", retriever)
        print(rules[:300])

