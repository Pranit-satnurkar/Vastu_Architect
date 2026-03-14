# Vastu Architect — Backend

Python backend powering the Vastu Architect floor plan generator. Exposes a FastAPI REST API for the Next.js frontend and includes a standalone Streamlit interface with RAG-based Vastu constraint analysis.

## Setup

```bash
pip install -r requirements.txt
```

Create a `.env` file in the project root:
```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## Running

**FastAPI server** (for the Next.js frontend):
```bash
uvicorn main:app --reload --port 8000
```

**Streamlit app** (standalone UI with RAG + DXF export):
```bash
streamlit run src/ui/vastu_app.py
```

## API

### `POST /generate-plan`

Generates a floor plan layout from user inputs.

**Request:**
```json
{
  "bhk_type": "2BHK",
  "plot_w_ft": 30,
  "plot_d_ft": 40,
  "style": "modern",
  "prompt": "I want a large kitchen facing east"
}
```

**Response:**
```json
{
  "template_used": "2BHK_v2",
  "room_count": 5,
  "plot_w_m": 9.14,
  "plot_d_m": 12.19,
  "rooms": [
    {
      "name": "Living Room",
      "x": 0, "y": 0, "w": 4.5, "h": 3.8,
      "x_px": 0, "y_px": 0, "w_px": 148, "h_px": 125,
      "door": { "wall": "south", "pos": 0.5, "width": 0.9 },
      "window": { "wall": "north", "pos": 0.5, "width": 1.2 }
    }
  ]
}
```

Supported `bhk_type` values: `1BHK`, `2BHK`, `3BHK`, `4BHK`
Supported `style` values: `modern`, `traditional`

## Architecture

```
User Prompt
    │
    ▼
main.py (FastAPI)
    │── parse_prompt() → Gemini AI extracts structured params
    │
    ▼
spatial_optimizer.py
    │── get_optimized_layout() → selects template, applies pixel scaling
    │
    ▼
templates.py / template_store.py
    │── returns hardcoded room coordinates (meters + pixels)
    │
    ▼
JSON Response → Frontend
```

**Streamlit path additionally includes:**
- `vastu_rag_engine.py` — ChromaDB + SentenceTransformer RAG over Vastu PDFs, queried via Groq LLM
- `vastu_renderer.py` — Matplotlib-based floor plan preview
- `vastu_engine.py` — DXF CAD file generation with AIA standard layers

## CAD Export (DXF)

The Streamlit app can export professional `.dxf` files compatible with AutoCAD. Layers follow AIA standards:

| Layer | Color | Lineweight |
|-------|-------|-----------|
| `A-WALL` | White | 0.50mm |
| `A-DOOR` | Cyan | 0.25mm |
| `A-ANNO-TEXT` | Yellow | 0.18mm |

## Tech Stack

- **FastAPI** — REST API
- **Streamlit** — standalone UI
- **Google Generative AI** (`gemini-1.5-flash`) — natural language prompt parsing
- **Groq** (`mixtral-8x7b-32768`) via LangChain — Vastu constraint extraction
- **ChromaDB** + **SentenceTransformers** — RAG vector store
- **ezdxf** — DXF CAD file generation
- **Shapely** — geometry operations
- **Matplotlib** — preview rendering
