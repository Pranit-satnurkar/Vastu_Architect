import os
import json
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.llms import OpenAI  # Fallback
# If using local/other LLM, we'd import that here.

# --- CONFIGURATION ---
PDF_DIR = "PDF"
DB_DIR = "db_vastu_rules"

def ingest_vastu_knowledge(pdf_dir=PDF_DIR, db_dir=DB_DIR):
    """
    Ingests PDFs from the specified directory, chunks them, 
    and stores embeddings in a ChromaDB vector store.
    """
    if not os.path.exists(pdf_dir):
        print(f"[ERROR] PDF directory '{pdf_dir}' not found.")
        return None

    print(f"[INFO] Loading PDFs from {pdf_dir}...")
    loader = DirectoryLoader(pdf_dir, glob="*.pdf", loader_cls=PyPDFLoader)
    documents = loader.load()
    
    if not documents:
        print("[WARN] No PDFs found in the directory.")
        return None

    print(f"[INFO] Found {len(documents)} pages. Splitting text...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    texts = text_splitter.split_documents(documents)

    print(f"[INFO] Creating Vector Database with {len(texts)} chunks...")
    # Using open-source embeddings to avoid immediate API key dependency
    embedding_function = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
    
    vectordb = Chroma.from_documents(
        documents=texts, 
        embedding=embedding_function,
        persist_directory=db_dir
    )
    vectordb.persist()
    print(f"[SUCCESS] Knowledge Base persisted to '{db_dir}'.")
    return vectordb

def get_vastu_retriever(db_dir=DB_DIR):
    """
    Returns a Retriever object from the persisted ChromaDB.
    """
    if not os.path.exists(db_dir):
        print("[WARN] Database not found. Building it now...")
        return ingest_vastu_knowledge(db_dir=db_dir).as_retriever()
    
    embedding_function = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
    vectordb = Chroma(persist_directory=db_dir, embedding_function=embedding_function)
    return vectordb.as_retriever(search_kwargs={"k": 3})

def query_vastu_rules(room_name, retriever):
    """
    Retrieves context for a specific room.
    """
    print(f"[INFO] Querying Vastu rules for: {room_name}")
    try:
        docs = retriever.invoke(f"Vastu rules for {room_name} location and direction")
        context_text = "\n\n".join([d.page_content for d in docs])
        return context_text
    except Exception as e:
        print(f"[ERROR] Retrieval failed: {e}")
        return ""

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain.output_parsers import ResponseSchema, StructuredOutputParser

class ConstraintExtractor:
    def __init__(self, api_key=None, model_name="llama3-70b-8192"):
        self.api_key = api_key
        self.model_name = model_name
        self.llm = None
        
        if self.api_key:
            try:
                self.llm = ChatGroq(temperature=0, groq_api_key=self.api_key, model_name=self.model_name)
            except Exception as e:
                print(f"[ERROR] Failed to initialize Groq LLM: {e}")

    def extract_constraints(self, room_name, context_text):
        """
        Uses LLM (Groq) to convert text rules into JSON.
        Falls back to Mock logic if no API key or LLM failure.
        """
        if self.llm:
            try:
                # 1. Define Output Structure
                response_schemas = [
                    ResponseSchema(name="room", description="Name of the room"),
                    ResponseSchema(name="allowed_quadrants", description="List of allowed Vastu zones (e.g. ['NE', 'SW'])"),
                    ResponseSchema(name="forbidden", description="List of forbidden zones")
                ]
                output_parser = StructuredOutputParser.from_response_schemas(response_schemas)
                format_instructions = output_parser.get_format_instructions()

                # 2. Operations
                prompt = ChatPromptTemplate.from_template(
                    """
                    You are an expert Vastu Shastra Architect.
                    Given the following context about Vastu rules for a room, extract the allowed and forbidden zones.
                    Valid Zones: NE, E, SE, S, SW, W, NW, N, C (Center).
                    
                    Context: {context}
                    
                    Task: Extract rules for room '{room}'.
                    
                    {format_instructions}
                    """
                )
                
                chain = prompt | self.llm | output_parser
                result = chain.invoke({"context": context_text, "room": room_name, "format_instructions": format_instructions})
                return result

            except Exception as e:
                print(f"[ERROR] LLM Extraction Failed: {e}. Falling back to mock.")
                # Fallthrough to mock
        
        # MOCK LOGIC (Fallback)
        print(f"[WARN] Using Mock/Heuristic extraction for {room_name}")
        allowed = []
        context_lower = context_text.lower()
        
        if "south east" in context_lower or "southeast" in context_lower: allowed.append("SE")
        if "north east" in context_lower or "northeast" in context_lower: allowed.append("NE")
        if "south west" in context_lower or "southwest" in context_lower: allowed.append("SW")
        if "north west" in context_lower or "northwest" in context_lower: allowed.append("NW")
            
        if not allowed:
            if "kitchen" in room_name.lower(): allowed = ["SE"]
            elif "bedroom" in room_name.lower(): allowed = ["SW"]
            elif "living" in room_name.lower(): allowed = ["NE", "N"]
            elif "toilet" in room_name.lower(): allowed = ["NW", "W"]
        
        return {
            "room": room_name,
            "allowed_quadrants": allowed,
            "forbidden": []
        }


if __name__ == "__main__":
    # Test Ingestion
    ingest_vastu_knowledge()
    
    # Test Retrieval
    retriever = get_vastu_retriever()
    kitchen_rules = query_vastu_rules("Kitchen", retriever)
    print("\n--- Retrieved Kitchen Rules ---")
    print(kitchen_rules[:500] + "...")
