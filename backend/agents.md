# Backend Agent Guidance

Python/FastAPI backend for Vastu Architect. Handles plan generation, RAG-based Vastu constraints, and CAD export.

## Folder Structure

```
backend/
├── main.py               # FastAPI entry point — stays at root for uvicorn
├── requirements.txt
├── .env                  # GEMINI_API_KEY, GROQ_API_KEY
│
├── src/                  # All application source code
│   ├── __init__.py
│   │
│   ├── core/             # Layout generation engines
│   │   ├── layout_engine.py      # Primary layout generator (generate_layout())
│   │   ├── spatial_optimizer.py  # Wrapper: calls layout_engine, pixel coords & Vastu compliance
│   │   └── bsp_engine.py         # BSP-based alternate layout strategy
│   │
│   ├── data/             # Static room templates and reference data
│   │   ├── templates.py          # Hardcoded room layouts keyed by name (2BHK_v1, 3BHK_v2 …)
│   │   ├── template_store.py     # Selects template by BHK type (percentage-based)
│   │   └── reference_plans.py    # Reference floor plans for comparison
│   │
│   ├── export/           # CAD file generation
│   │   ├── vastu_engine.py       # Clean DXF export with AIA layers
│   │   └── dxf_exporter.py       # Professional DXF with dual unit support
│   │
│   ├── rag/              # Vastu knowledge retrieval
│   │   └── vastu_rag_engine.py   # ChromaDB + SentenceTransformer + Groq LLM
│   │
│   ├── scoring/          # Vastu compliance scoring
│   │   └── vastu_scorer.py       # Rule-based zone-matching, grades A+ through D
│   │
│   └── ui/               # Streamlit standalone UI
│       ├── vastu_app.py          # Streamlit entry point
│       └── vastu_renderer.py     # Matplotlib floor plan preview
│
├── scripts/              # Debug and test scripts (not production)
│   ├── test_engine.py
│   ├── verify_1bhk.py
│   ├── debug_*.py
│   ├── test2.py
│   ├── bsp_engine_debug.py
│   └── bsp_engine_fatal.py
│
└── logs/                 # Generated log and output files (gitignored)
    ├── debug.log
    └── out.txt / out2.txt / verify_output.txt
```

## Entry Points

- **FastAPI:** `uvicorn main:app --reload --port 8000` (run from `backend/`)
- **Streamlit:** `streamlit run src/ui/vastu_app.py` (run from `backend/`)
- **Scripts:** `python scripts/test_engine.py` (run from `backend/`)

## Request Flow

### Next.js path (primary)
```
main.py
  └─ parse_prompt()                          # Gemini extracts params from natural language
  └─ src.core.spatial_optimizer.optimize_layout()
       └─ src.core.layout_engine.generate_layout()   # primary layout
       └─ src.data.templates.get_plan()               # fallback if layout fails
  └─ src.export.vastu_engine.generate_clean_dxf()    # /api/download-dxf
  └─ src.export.dxf_exporter.generate_professional_dxf()  # /export-dxf
```

### Streamlit path (standalone)
```
src/ui/vastu_app.py
  └─ src.rag.vastu_rag_engine    # RAG retrieval of Vastu constraints
  └─ src.core.spatial_optimizer  # Layout generation
  └─ src.export.vastu_engine     # DXF export
  └─ .vastu_renderer             # Matplotlib preview (relative import)
```

## Import Conventions

All internal imports use **absolute `src.` paths** from the `backend/` root. Within the same sub-package, use **relative imports**.

```python
# main.py — always use src. prefix
from src.core.spatial_optimizer import optimize_layout
from src.export.vastu_engine import generate_clean_dxf

# within src/core/ — relative for same package, src. for cross-package
from .layout_engine import generate_layout       # same package (relative)
from src.data.templates import get_plan          # cross-package

# wrong — flat imports no longer work
from layout_engine import generate_layout
from core.spatial_optimizer import optimize_layout
```

Scripts in `scripts/` prepend `backend/` to `sys.path`, then use `src.` absolute imports:
```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.core.layout_engine import generate_layout
```

## Adding a New Template

1. Add entry to `src/data/templates.py`:
```python
"3BHK_v4": [
    {"name": "Living Room", "x": 0, "y": 0, "w": 5.0, "h": 4.0,
     "door": {"wall": "south", "pos": 0.5, "width": 0.9},
     "window": {"wall": "north", "pos": 0.5, "width": 1.2}},
    ...
]
```
2. Register it in `src/data/template_store.py` under the appropriate BHK key.

## LLM Integrations

| Model | Library | Used In |
|-------|---------|---------|
| Gemini (`gemini-1.5-flash`) | `google.generativeai` | `main.py` prompt parsing |
| Groq (`mixtral-8x7b-32768`) | `langchain_groq` | `src/rag/vastu_rag_engine.py` |

Both keys must be set in `.env`:
```
GEMINI_API_KEY=...
GROQ_API_KEY=...
```

## API Endpoints (`main.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/generate-plan` | Generate floor plan from BHK type + plot dims |
| POST | `/api/download-dxf` | Download DXF using last generated plan (cached) |
| POST | `/export-dxf` | Export professional DXF with metric/imperial support |

## Key Constants

| Constant | Value | File |
|----------|-------|------|
| `PPM` | 20 px/m | `src/core/spatial_optimizer.py` |
| `WALL` | 0.23 m | `src/core/layout_engine.py` |
| `IWALL` | 0.15 m | `src/core/layout_engine.py` |
| FT→M | 0.3048 | throughout |

## Dependencies

`pip install -r requirements.txt` — key packages: `fastapi`, `uvicorn`, `google-generativeai`, `groq`, `langchain`, `langchain-groq`, `chromadb`, `ezdxf`, `shapely`, `streamlit`, `python-dotenv`
