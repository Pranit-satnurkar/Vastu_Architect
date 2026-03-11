# Frontend Agent Guidance

Next.js 14 frontend for Vastu Architect. Renders an interactive floor plan canvas from backend-generated room data.

## Dev Commands

```bash
npm install       # install deps
npm run dev       # start dev server (http://localhost:3000)
npm run build     # production build
npm run lint      # ESLint
```

Backend must be running at `http://localhost:8000` for plan generation to work.

## Key Files

- `app/page.tsx` — only page; owns all state (form inputs, API response, loading/error). Makes `POST /generate-plan` and passes `rooms[]` to `FloorPlanCanvas`.
- `components/FloorPlanCanvas.tsx` — Konva.js canvas component; purely presentational, receives room data as props and renders it.
- `app/layout.tsx` — root layout, minimal wrapper.

## Canvas Rendering (`FloorPlanCanvas.tsx`)

Uses `react-konva` with a `Stage` → `Layer` structure. Each room is drawn as:
- `Rect` — room rectangle, color-coded by room name via a `ROOM_COLORS` map
- `Arc` — door swing (quarter circle at the door's wall/position)
- `Line` — window indicator on the wall
- `Text` — room name + dimensions label

Room data comes from the API in both meters (`x, y, w, h`) and pixels (`x_px, y_px, w_px, h_px`). The canvas uses the `*_px` fields directly. Canvas also renders a north arrow and scale bar.

**To add a new room type:** add its name to the `ROOM_COLORS` map in `FloorPlanCanvas.tsx` with a hex color.

**To change canvas size:** the `Stage` width/height is currently fixed — adjust alongside the pixel scaling factor in `backend/spatial_optimizer.py` (`ft_to_px`) so coordinates stay consistent.

## API Integration

All backend communication is in `app/page.tsx`:
```typescript
const res = await fetch("http://localhost:8000/generate-plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bhk_type, plot_w_ft, plot_d_ft, style, prompt })
});
const data = await res.json(); // { rooms: [...], template_used, plot_w_m, plot_d_m }
```

## Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 14.2.3 | Framework |
| `react-konva` / `konva` | 18.2.10 / 9.3.6 | Canvas rendering |
| `lucide-react` | 0.378.0 | Icons |
| `tailwindcss` | 3.4.1 | Styling |
