# Vastu Architect

AI-powered house floor plan generator based on Vastu Shastra principles. Produces interactive visualizations and professional CAD files (DXF for AutoCAD).

## Tech Stack

- **Frontend**: Next.js 14, React, Konva.js, Tailwind CSS
- **Backend**: Python, FastAPI, Google Gemini 3.1 Flash Lite, LangChain, Groq
- **CAD**: ezdxf (AIA standard layers)
- **RAG**: ChromaDB + SentenceTransformers (Streamlit path)

## New Features & Technical Improvements

### 🏠 Layout Engine V2 (Procedural)
- **Pattern Variety**: Added `LR_front` and `LR_right` (mirrored) patterns for diverse spatial configurations.
- **Compact 1BHK Optimization**: Specialized logic for small plots (<600 sqft) ensuring functional room sizes.
- **Gap-Fix Pass**: Automated geometry verification to eliminate floating-point gaps between room boundaries.
- **Template Blending**: Procedural generation informed by a curated template database for realistic room proportions.

### 📐 BSP-VASTU Generation
- **Dynamic Columns**: Randomized column strategies (`west_heavy`, `balanced`, `east_heavy`) for varied corridor placement.
- **Procedural Corridors**: Intelligent movement flow generation with Vastu-compliant Pooja room integration.
- **Indian Standard Toilets**: Optimized dimensions (1.4m–1.8m) and placement based on modern Indian architectural standards.

### 🛠️ Professional CAD Export (DXF)
- **Wall Deduplication**: Coordinate rounding (10mm precision) to ensure shared walls are drawn as single segments.
- **AIA Layer Standards**: Organized exports into standard layers (`A-WALL-EXT`, `A-WALL-INT`, `A-DOOR`, `A-GLAZ`, etc.).
- **Precise Geometry**: Accurate door arcs and centered room labels with auto-scaling dimensions.

### 🎨 Interactive UI Rendering
- **Visual Polish**: Color-coded room types (Living, Bedroom, Kitchen, Pooja) for instant recognition.
- **Architectural Notation**: 3-tick professional window symbols and visual door swings.
- **Auto-Dimensioning**: Integrated top and right dimension lines for quick measurement reference.
- **Title Block**: Professional architectural title block with project metadata and Vastu compliance score.

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
