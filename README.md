# Vastu Architect

AI-powered house floor plan generator based on Vastu Shastra principles. Produces interactive visualizations and professional CAD files (DXF for AutoCAD).

## Tech Stack

- **Frontend**: Next.js 14, React, Konva.js, Tailwind CSS
- **Backend**: Python, FastAPI, Google Gemini AI, LangChain, Groq
- **CAD**: ezdxf (AIA standard layers)
- **RAG**: ChromaDB + SentenceTransformers (Streamlit path)

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

Start the API server:
```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The frontend connects to the backend at `http://localhost:8000`.

## Alternative: Streamlit UI

A standalone Streamlit UI with RAG-based Vastu constraint analysis is also available:

```bash
cd backend
streamlit run src/ui/vastu_app.py
```

Requires `GROQ_API_KEY` in `backend/.env` for RAG functionality.

## CAD Layer Standards (DXF)

Exported DXF files follow the AIA National CAD Standard:

| Layer | Color | Lineweight |
|-------|-------|-----------|
| `A-WALL` | White | 0.50mm |
| `A-DOOR` | Cyan | 0.25mm |
| `A-ANNO-TEXT` | Yellow | 0.18mm |
| `A-ANNO-DIMS` | Magenta | 0.15mm |

## Project Structure

```
Vastu_Architect/
├── backend/
│   ├── main.py          # FastAPI server
│   ├── src/
│   │   ├── core/        # Layout engines
│   │   ├── data/        # Room templates
│   │   ├── export/      # DXF generation
│   │   ├── rag/         # Vastu knowledge RAG
│   │   ├── scoring/     # Vastu compliance
│   │   └── ui/          # Streamlit app
│   └── scripts/         # Debug/test scripts
└── frontend/
    ├── app/             # Next.js App Router
    └── components/      # Shared UI components
```
