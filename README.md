# Vastu Architect

AI-powered house floor plan generator based on Vastu Shastra principles. Produces interactive visualizations and professional CAD files (DXF for AutoCAD).

## Tech Stack

- **Frontend**: Next.js 14, React, Konva.js, Tailwind CSS
- **Backend**: Python, FastAPI, Google Gemini 3.1 Flash Lite, LangChain, Groq
- **CAD**: ezdxf (AIA standard layers)
- **RAG**: ChromaDB + SentenceTransformers (Streamlit path)

## Features

### 🏠 Layout Engine
- **BSP-VASTU Generation** — Binary Space Partitioning with Vastu-compliant room placement, dynamic column strategies (`west_heavy`, `balanced`, `east_heavy`), and procedural corridor generation
- **Template Blending** — Procedural generation informed by a curated template database (2BHK v1–5, 3BHK v1–3, etc.) for realistic room proportions
- **Compact 1BHK Optimization** — Specialized logic for small plots (<600 sqft)
- **Gap-Fix Pass** — Automated geometry verification to eliminate floating-point gaps between room boundaries
- **Random Seed Variants** — Every generation produces a unique layout; regenerate for different configurations

### 📊 Vastu Compliance Scoring
- Per-room scoring against preferred directional zones (N/S/E/W) per Vastu Shastra
- Overall score (0–100) with grade (A+/A/B+/B/C/D)
- Directional balance breakdown (North/East/South/West percentages)
- AI-generated observations per room placement

### 🌍 Environmental Analysis Suite
- **Sun Path Analysis** — SunCalc.js integration; per-room sunlight exposure across dawn, morning, noon, evening, dusk for any Indian city
- **Heat Signature** — Real-time room temperature estimation using solar position + OpenWeatherMap (with seasonal fallback data for 8 cities)
- **Air Circulation** — Wind-based cross-ventilation scoring per room; overall airflow rating
- **Crowd Simulation** — Agent-based occupancy simulation with CO₂ buildup, bottleneck detection, and movement flow across presets (Morning Routine, Evening Party, Night, Custom)
- **Fire Safety & Evacuation** — A* pathfinding on the room graph; evacuation routes, time-to-exit per room, dead-end detection
- **Disaster Risk Analysis** — Seismic zone (IS 1893:2016) and flood risk data for all major Indian cities; live USGS earthquake feed

### 🗺️ Floor Plan Canvas (2D)
- Konva.js interactive rendering with color-coded room types
- Professional architectural notation: 3-tick window symbols, door swing arcs, dimension lines
- Scale bar and north arrow overlay
- Unit toggle (ft ↔ m)

### 🧊 3D Visualization
- Three.js scene built from 2D room coordinates — walls, doors, windows, ceiling, floor labels
- Animated sun orbit synced to real solar position (SunCalc) with time-of-day slider
- Heat map overlay mode
- Orbit controls (drag, zoom, pan); fullscreen mode

### ✏️ Plan Editor
- Drag-to-move and resize rooms on a snap grid (0.5m)
- Edge-attachment snapping between adjacent rooms
- Apply edits back to the canvas and all analysis components

### 🛠️ CAD Export (DXF)
- AIA National CAD Standard layers (`A-WALL-EXT`, `A-WALL-INT`, `A-DOOR`, `A-GLAZ`, `A-ANNO-TEXT`, `A-ANNO-DIMS`)
- Wall deduplication at 10mm precision; accurate door arcs
- Professional title block with client name, plot dimensions, and Vastu score

### 📄 PDF Report
- jsPDF-generated report with floor plan image, room schedule, compliance score, and project metadata

### 💾 My Projects
- Auto-saves every generated plan to browser localStorage (up to 20 plans)
- Load any past plan back into the canvas instantly

### 📚 Vastu Guide
- Built-in reference panel covering all 9 zones (N, NE, E, SE, S, SW, W, NW, Brahmasthan)
- Per-zone: ideal rooms, rooms to avoid, and Vastu principle explanation

### 🎨 Dashboard UI
- Material Design 3 dark theme — warm amber/teal palette (Noto Serif + Manrope)
- 3-column layout: input sidebar → floor plan canvas → compliance + analysis panel
- Analysis tabs (Sun / Heat / Air / Crowd / Fire / Risk) in right panel
- Bottom toolbar pill: 2D / 3D / Edit / unit toggle
- Share button with URL state sync

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
