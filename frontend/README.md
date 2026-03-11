# Vastu Architect — Frontend

Next.js 14 frontend for the Vastu Architect floor plan generator. Provides a form-based UI and an interactive Konva.js canvas for visualizing AI-generated floor plans.

## Setup

```bash
npm install
```

Ensure the backend is running at `http://localhost:8000` before generating plans.

## Running

```bash
npm run dev      # development server → http://localhost:3000
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```

## Features

- Input form for BHK type, plot dimensions (ft), architectural style, and natural language requirements
- Sends request to the FastAPI backend and renders the returned floor plan
- Interactive Konva.js canvas showing:
  - Color-coded rooms with name and dimension labels
  - Door swing arcs and window markers
  - Scale bar and north arrow

## Architecture

```
app/page.tsx
    │── Form state (bhk_type, plot_w_ft, plot_d_ft, style, prompt)
    │── POST /generate-plan → backend API
    │── Passes rooms[] response to FloorPlanCanvas
    │
    ▼
components/FloorPlanCanvas.tsx
    │── Konva Stage → Layer
    │── Per room: Rect (fill) + Text (label) + Arc (door) + Line (window)
```

Room pixel coordinates (`x_px`, `y_px`, `w_px`, `h_px`) from the API are used directly on the canvas without additional scaling.

## Tech Stack

- **Next.js 14** with App Router
- **React 18** + **TypeScript**
- **Konva.js** / **react-konva** — canvas rendering
- **Tailwind CSS** — styling
- **Lucide React** — icons
