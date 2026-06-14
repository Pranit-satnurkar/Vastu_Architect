# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vastu Architect is an AI-powered house floor plan generator based on Vastu Shastra principles. It produces interactive visualizations and professional CAD files (DXF for AutoCAD).

## Development Commands

### Backend (Python/FastAPI)
```bash
cd backend

# Install dependencies (use the backend venv at backend/.venv)
pip install -r requirements.txt

# Run FastAPI server (primary backend for frontend)
uvicorn main:app --reload --port 8000

# Run Streamlit app (alternative standalone UI)
streamlit run src/ui/vastu_app.py

# Quick engine smoke test
python scripts/test_engine.py
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
GROQ_API_KEY=...            # Used by vastu_rag_engine.py (Groq LLM for RAG)
GEMINI_API_KEY=...          # Used by backend/main.py (Gemini for prompt parsing)
OPENWEATHER_API_KEY=...     # Used by /weather endpoint (optional — falls back to hardcoded data)
```

## Architecture

Two parallel UI systems — **Next.js frontend** is the primary interface, **Streamlit** is a standalone alternative.

### Request Flow (Next.js path)
1. User fills form in `frontend/app/page.tsx` (BHK type, plot dims, style, prompt)
2. POST to `http://localhost:8000/generate-plan` (`backend/main.py`)
3. Gemini AI (`parse_prompt()`) extracts structured params from natural language
4. `spatial_optimizer.py` calls `floorplan.generator.generate()` (primary engine)
5. The generator builds a room program, partitions the interior into zones, fills them via squarified slicing, carves bath suites + open dining, places connectivity-guaranteed doors and windows; falls back to `layout_engine.generate_layout()` (scaled templates) only on tight plots where it can't place valid rooms
6. `compute_vastu_compliance()` in `spatial_optimizer.py` annotates the result — Vastu is **scored only, never enforced** during generation (low scores are expected for now)
7. Response JSON with room coordinates rendered on Konva canvas in `frontend/components/FloorPlanCanvas.tsx`
8. Generated plan is auto-saved to `localStorage` under key `vastu_projects`

### Request Flow (Streamlit path)
1. `src/ui/vastu_app.py` collects inputs, calls `src/rag/vastu_rag_engine.py` for Vastu constraints (RAG over PDFs via ChromaDB)
2. Layout generated from templates, rendered with Matplotlib via `src/ui/vastu_renderer.py`
3. `src/export/vastu_engine.py` generates DXF output using AIA standard layers

### Key Backend Files
| File | Role |
|------|------|
| `main.py` | FastAPI server — `/generate-plan`, `/export-dxf`, `/api/download-dxf`, `/weather`, `/risk`, `/health` |
| `src/core/spatial_optimizer.py` | Primary entry point: calls `floorplan.generator.generate()`, adds pixel coords; also houses `compute_vastu_compliance()` |
| `src/core/floorplan/` | **Primary** rule-driven architectural generator (non-Vastu). `geometry` (Rect + predicates), `room_program` (BHK→RoomSpecs), `subdivision` (squarify), `circulation` (connectivity doors), `openings` (windows), `generator` (orchestrator). Engine tag `ARCH-v1`. See `docs/superpowers/specs/2026-06-14-architectural-floorplan-generator-design.md` |
| `src/core/layout_engine.py` | Fallback template engine: picks a hardcoded template by plot aspect-ratio similarity, round-robins among the closest matches for variety, then scales rooms to fit the plot. Engine tag `SCALED-TEMPLATE` |
| `src/core/bsp_engine.py` | Retired procedural archetype engine (no longer wired into `/generate-plan`; kept for reference) |
| `src/data/templates.py` | Hardcoded room coordinate templates (PLANS dict: 2BHK_v1-5, 3BHK_v1-3, etc.) — used only by the fallback engine |
| `src/data/template_store.py` | Template selection by BHK type using percentage-based layout |
| `src/data/reference_plans.py` | Reference architectural plan data |
| `src/scoring/vastu_scorer.py` | Vastu compliance scoring using 3×3 directional quadrant grid (NW/N/NE/W/C/E/SW/S/SE) |
| `src/export/vastu_engine.py` | Basic DXF CAD generation with AIA standard layers (`A-WALL`, `A-DOOR`, etc.) — used by `/api/download-dxf` |
| `src/export/dxf_exporter.py` | Professional DXF export with dual unit system (metric/imperial) — used by `/export-dxf` |
| `src/rag/vastu_rag_engine.py` | RAG pipeline: ChromaDB + SentenceTransformer embeddings + Groq LLM |
| `src/ui/vastu_renderer.py` | Matplotlib preview rendering for Streamlit |
| `scripts/test_engine.py` | Smoke test for layout engine — run to verify templates load correctly |

### API Endpoints (`backend/main.py`)
```typescript
POST /generate-plan       // Generate floor plan layout
POST /export-dxf          // Professional DXF with metric/imperial units
POST /api/download-dxf    // Basic DXF (uses app.state cache from last /generate-plan)
GET  /weather?city=Delhi  // Live weather (OpenWeatherMap) or hardcoded fallback
GET  /risk?city=Delhi     // Seismic zone (IS 1893:2016) + flood risk + recent USGS earthquakes
GET  /health              // Health check

// /generate-plan request
{ bhk_type: "1BHK"|"2BHK"|"3BHK"|"4BHK", plot_w_ft: number, plot_d_ft: number,
  style: "modern"|"traditional", prompt: string, client_name: string }

// /generate-plan response
{ template_used: string, room_count: number, plot_w_m: number, plot_d_m: number,
  engine: "BSP-v3"|"SCALED-TEMPLATE", seed: number,
  compliance: { score, grade, details, note },
  rooms: [{ name, x, y, w, h, x_px, y_px, w_px, h_px, door: {wall, pos, width}|null, window: {wall, pos, width}|null }] }
```

### Frontend Key Files
- `frontend/app/page.tsx` — main page, form, API call, result state; also computes directional Vastu scores and AI observations client-side
- `frontend/lib/reportGenerator.ts` — jsPDF-based PDF report generation
- `frontend/components/FloorPlanCanvas.tsx` — Konva.js canvas rendering rooms, doors, windows, scale bar, north arrow
- `frontend/components/PlanEditor.tsx` — interactive plan editing
- `frontend/components/FloorPlan3D.tsx` — Three.js 3D plan view
- `frontend/components/SunAnalysis.tsx` / `AirCirculation.tsx` / `HeatSignature.tsx` — environmental analysis panels (use `suncalc` for sun position)
- `frontend/components/RiskAnalysis.tsx` — seismic/flood risk display (uses `/risk` endpoint)
- `frontend/components/FireSafety.tsx` / `CrowdSimulation.tsx` — safety analysis panels

### CAD Layer Standards (DXF output)
AIA standards used in `vastu_engine.py`: `A-WALL` (white, 0.50mm), `A-DOOR` (cyan), `A-ANNO-TEXT` (yellow, 0.18mm), etc.

### Layout Generation Pipeline
```
spatial_optimizer.optimize_layout()
  → floorplan.generator.generate()              (engine "ARCH-v1")
      → build_program(bhk)                       room brief (zones, weights, baths)
      → _zone_groups + _group_regions            partition interior (squarify)
      → fill_region per group                    squarify rooms into each region
      → _carve_dining (from Living), _carve_bath (suites)
      → place_doors (spanning tree = reachability), place_windows
      → _valid(); up to 18 attempts, prefer kitchen-dining adjacency
      → on total failure → layout_engine.generate_layout()   (engine "SCALED-TEMPLATE")
          → _select_template() by aspect ratio, round-robin among closest
          → _scale_rooms() to target plot dims
  ← pixel coords added (PPM = 20 px/m)
```

Variety comes from zone grouping (3-zone vs merged social core), orientation
(zone order shuffle), slice order, and room sizing — never from compass
direction. Reasonable plot sizes yield ~9–10 distinct layouts per 10 calls;
genuinely tight plots (e.g. 3–4BHK on ~20×35ft) fall back to scaled templates.

Backend tests live in `backend/tests/` — run `cd backend && python -m pytest`.

### Data Contract Note
The backend `compliance` object returns `{ score, grade, details, note }`. The frontend reads `compliance?.score` (with a legacy `?? compliance?.overall` fallback) for the gauge — `page.tsx` and `FloorPlanCanvas.tsx`. Client-side directional scores (`computeDirectionalScores`) are computed independently from room positions. Since generation is no longer Vastu-driven, compliance scores are typically low for now — this is expected until Vastu-aware generation is added back.
