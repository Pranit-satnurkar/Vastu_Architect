# Backend Agent Guidance

Python/FastAPI backend for Vastu Architect. Handles plan generation, RAG-based Vastu constraints, and CAD export.

## Entry Points

- `main.py` — FastAPI app, single endpoint `POST /generate-plan`. Start with `uvicorn main:app --reload --port 8000`.
- `vastu_app.py` — Standalone Streamlit UI. Start with `streamlit run vastu_app.py`.

## Module Responsibilities

**Plan Generation Pipeline:**
- `main.py` → `parse_prompt()` uses Gemini to extract structured params from natural language, then calls `spatial_optimizer.get_optimized_layout()`
- `spatial_optimizer.py` → thin wrapper, calls `templates.get_plan()` and applies `ft_to_px` pixel scaling
- `templates.py` → hardcoded room coordinate dicts keyed by template name (e.g. `2BHK_v1`, `3BHK_v2`). Each room has `x, y, w, h` in meters plus door/window metadata
- `template_store.py` → selects template by BHK type using `x_pct/y_pct/w_pct/h_pct` percentage layout

**RAG Pipeline** (Streamlit path only):
- `vastu_rag_engine.py` — loads PDFs into ChromaDB with `SentenceTransformerEmbeddings` (`all-MiniLM-L6-v2`), queries constraints via Groq LLM
- Requires PDF source files in the expected directory for initial ingestion

**Output:**
- `vastu_renderer.py` — Matplotlib preview for Streamlit display
- `vastu_engine.py` — DXF generation with AIA standard layers; call `generate_dxf(rooms, plot_w, plot_d)` → returns DXF bytes

## Adding a New Template

Add an entry to `templates.py` following the existing pattern:
```python
"3BHK_v4": [
    {"name": "Living Room", "x": 0, "y": 0, "w": 5.0, "h": 4.0,
     "door": {"wall": "south", "pos": 0.5, "width": 0.9},
     "window": {"wall": "north", "pos": 0.5, "width": 1.2}},
    ...
]
```
Then register it in `template_store.py` under the appropriate BHK key.

## LLM Integrations

| Model | Library | Used In |
|-------|---------|---------|
| Gemini (`gemini-1.5-flash`) | `google.generativeai` | `main.py` prompt parsing |
| Groq (`mixtral-8x7b-32768`) | `langchain_groq` | `vastu_rag_engine.py` constraint extraction |

Both keys must be set in `.env` at the project root.

## Dependencies

`pip install -r requirements.txt` — key packages: `fastapi`, `uvicorn`, `google-generativeai`, `groq`, `langchain`, `langchain-groq`, `chromadb`, `ezdxf`, `shapely`, `streamlit`, `python-dotenv`
