# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vastu Architect is an AI-powered house floor plan generator based on Vastu Shastra principles. It produces interactive visualizations and professional CAD files (DXF for AutoCAD).

## Development Commands

### Backend (Python/FastAPI)
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run FastAPI server (primary backend for frontend)
uvicorn main:app --reload --port 8000

# Run Streamlit app (alternative standalone UI)
streamlit run vastu_app.py
```

### Frontend (Next.js)
```bash
cd frontend

# Install dependencies
npm install

# Run dev server (connects to backend at http://localhost:8000)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Environment Setup

Copy `.env.example` to `.env` in the root directory:
```
GROQ_API_KEY=...       # Used by vastu_rag_engine.py (Groq LLM)
GEMINI_API_KEY=...     # Used by backend/main.py (prompt parsing)
```

## Architecture

Two parallel UI systems exist — the **Next.js frontend** is the primary interface, while **Streamlit** is a standalone alternative:

### Request Flow (Next.js path)
1. User fills form in `frontend/app/page.tsx` (BHK type, plot dims, style, prompt)
2. POST to `http://localhost:8000/generate-plan` (`backend/main.py`)
3. Gemini AI (`parse_prompt()`) extracts structured params from natural language
4. `spatial_optimizer.py` calls `templates.py` → selects a hardcoded room layout template
5. Response JSON with room coordinates rendered on Konva canvas in `frontend/components/FloorPlanCanvas.tsx`

### Request Flow (Streamlit path)
1. `vastu_app.py` collects inputs, calls `vastu_rag_engine.py` for Vastu constraints (RAG over PDFs via ChromaDB)
2. Layout generated from templates, rendered with Matplotlib via `vastu_renderer.py`
3. `vastu_engine.py` generates DXF output using AIA standard layers

### Key Backend Files
| File | Role |
|------|------|
| `main.py` | FastAPI server with `/generate-plan` endpoint |
| `templates.py` | Hardcoded room coordinate templates (2BHK_v1-5, 3BHK_v1-3, etc.) |
| `template_store.py` | Template selection by BHK type using percentage-based layout |
| `spatial_optimizer.py` | Thin wrapper: calls `get_plan()` and applies pixel scaling |
| `vastu_rag_engine.py` | RAG pipeline: ChromaDB + SentenceTransformer embeddings + Groq LLM |
| `vastu_engine.py` | DXF CAD generation with AIA standard layers (A-WALL, A-DOOR, etc.) |
| `vastu_renderer.py` | Matplotlib preview rendering for Streamlit |

### API Contract (`POST /generate-plan`)
```typescript
// Request
{ bhk_type: "1BHK"|"2BHK"|"3BHK"|"4BHK", plot_w_ft: number, plot_d_ft: number, style: "modern"|"traditional", prompt: string }

// Response — rooms in both meters and pixels
{ template_used: string, room_count: number, plot_w_m: number, plot_d_m: number,
  rooms: [{ name, x, y, w, h, x_px, y_px, w_px, h_px, door: {wall, pos, width}|null, window: {wall, pos, width}|null }] }
```

### Frontend Key Files
- `frontend/app/page.tsx` — main page, form, API call, result state
- `frontend/components/FloorPlanCanvas.tsx` — Konva.js canvas rendering rooms, doors, windows, scale bar, north arrow

### CAD Layer Standards (DXF output)
AIA standards used in `vastu_engine.py`: `A-WALL` (white, 0.50mm), `A-DOOR` (cyan), `A-ANNO-TEXT` (yellow, 0.18mm), etc.
