# Architectural Floor Plan Generator — Design

**Date:** 2026-06-14
**Status:** Approved for implementation

## Problem

The current layout pipeline routes `spatial_optimizer.optimize_layout()` to
`bsp_engine.generate_bsp_layout()`, a procedural engine that places every room
by hardcoded Vastu rules (bedrooms→west, kitchen→SE, pooja→NE, toilets→north).
Every output therefore shares the same Vastu skeleton and feels generic and
repetitive. Two secondary problems compound it:

1. `FloorPlanCanvas.tsx` is hardcoded to the old 3-column template structure
   (it filters rooms by fixed column x-positions), so non-column layouts render
   incorrectly.
2. The rewritten `layout_engine.py` (fallback) seeds with
   `int(time.time()*1000) % 999_999`, which is effectively constant across rapid
   calls — it would emit the same plan repeatedly.

## Goal

Generate **flexible, varied, professional** residential floor plans driven by
architectural principles — **not** by Vastu. Vastu becomes a score computed
*after* generation, never a placement constraint. A clean extension point is
left for optional Vastu-biased generation later.

## Non-Goals

- No multi-storey plans, stairs, or 3D structural concerns.
- No furniture placement.
- No Vastu-driven generation in this phase (score overlay only).
- Curved/non-rectangular rooms are out of scope (rectangles only).

## Approach

**Constraint-based recursive slicing + squarify** (chosen over adjacency-graph
dualization and greedy packing for robustness). The interior is partitioned into
zones by target area ratio, and each zone is recursively sliced into room
rectangles using a squarify heuristic that keeps aspect ratios sane and respects
minimum sizes. Slicing always yields non-overlapping rectangles that fill the
plot exactly, so validation rarely fails.

## Module Structure

New package: `backend/src/core/floorplan/`. Small, single-purpose, testable units.

| Module | Responsibility | Depends on |
|---|---|---|
| `geometry.py` | `Rect` dataclass; overlap, containment, shared-wall-segment detection; `EPS` rounding | — |
| `room_program.py` | `RoomSpec` dataclass; `build_program(bhk)` → ordered list of specs (zone, area fraction, min dims, aspect range, `needs_window`, `needs_ensuite`) | — |
| `subdivision.py` | `fill_region(rect, specs, rng)` → list of placed `Rect`s via recursive guillotine slicing + squarify; clamps aspect & min size | geometry |
| `circulation.py` | `choose_strategy(rng)`; `place_doors(rooms, entrance, rng)` → assigns each room a door so all rooms are reachable from the entrance (spanning tree over shared-wall adjacency) | geometry |
| `openings.py` | `place_windows(rooms, plot, rng)` on exterior walls for rooms with `needs_window` | geometry |
| `generator.py` | Orchestrator `generate(bhk, plot_w_ft, plot_d_ft, style, seed)` → result dict in the existing schema; retry + fallback | all above |

`bsp_engine.py` is retired from the main path (left in repo, no longer imported
by `spatial_optimizer`). `spatial_optimizer.optimize_layout()` routes to
`floorplan.generator.generate()`. `layout_engine.generate_layout()` stays as the
fallback when generation fails after all retries.

## Data Contract (unchanged output schema)

Each room is a dict, identical to today's so DXF/PDF/scoring keep working:

```python
{ "name": str, "x": float, "y": float, "w": float, "h": float,
  "door": {"wall": "N|S|E|W", "pos": 0..1, "width": float} | None,
  "window": {"wall": "N|S|E|W", "pos": 0..1, "width": float} | None,
  "x_px": int, "y_px": int, "w_px": int, "h_px": int }
```

Result dict keys: `plot_w_m, plot_d_m, plot_w_ft, plot_d_ft, bhk_type, style,
engine ("ARCH-v1"), template_used (strategy+orientation label), room_count,
rooms, seed`. Units: meters internally; `PPM = 20` px/m. `WALL = 0.23`, `FT = 0.3048`.

## Room Program (per BHK)

Zones: **public** (Living, Dining), **private** (Bedrooms, Master+ensuite,
common bath), **service** (Kitchen, Store/Utility).

| BHK | Rooms |
|---|---|
| 1BHK | Living, Kitchen, Bedroom, Bathroom |
| 2BHK | Living, Dining, Kitchen, Master Bedroom (+ensuite), Bedroom, Bathroom |
| 3BHK | Living, Dining, Kitchen, Master Bedroom (+ensuite), Bedroom 1, Bedroom 2, Bathroom, Store |
| 4BHK | Living, Dining, Kitchen, Master Bedroom (+ensuite), Bedroom 1, Bedroom 2, Bedroom 3, Bathroom ×2, Store |

Min dims / aspect bounds reuse the existing `_ROOM_LIMITS` values where sensible
(toilet 1.5×2.0, bedroom 2.8×3.2, living 3.0×3.0, kitchen 2.4×2.4, etc.).
Global aspect clamp: longest/shortest side ≤ ~2.2 for habitable rooms.

## Generation Pipeline

1. `build_program(bhk)` → specs with zone tags and area fractions.
2. Pick a **circulation strategy** and a random **orientation** (one of 8:
   rotate 0/90/180/270 × mirror). Orientation + strategy are the primary variety
   levers and replace the Vastu fixation — public/private/service can land on
   any side.
3. Split interior into zone regions by area fraction (guillotine cut along the
   longer axis), assign zones to regions per the chosen orientation.
4. `fill_region` each zone into its rooms (squarified slicing).
5. Carve the master's **ensuite** from the master rectangle; place common
   bath(s) within the private zone.
6. `place_doors` — build shared-wall adjacency graph, compute a spanning tree
   rooted at the entrance, put a door on each tree edge (and the entrance door on
   an exterior wall of an entry room). Guarantees full reachability.
7. `place_windows` — exterior-facing rooms that `needs_window` get a window on
   their longest exterior wall.
8. **Validate** (`geometry` + generator): no overlaps, all in-bounds, min sizes
   met, aspect within bounds, every room reachable. Retry up to 8 times with new
   sub-seeds; on total failure fall back to `layout_engine.generate_layout()`.
9. Add pixel coords, return result dict.

## Professional-Quality Guarantees

- Min room dimensions + aspect clamp → no slivers.
- Kitchen placed adjacent to Dining (same zone, shared wall).
- Every bedroom has bath access; Master has a private ensuite.
- Guaranteed circulation: all rooms reachable from the entrance.
- Space-filling slices → no wasted gaps or overlaps.

## Variety Sources

Orientation (8) × circulation strategy (4: open-plan, corridor-spine,
central-hall, courtyard) × zone area ratios × slice order × room sizing. Same
inputs across repeated calls yield visibly different, non-Vastu-locked plans.

## Frontend Renderer Change

Replace `FloorPlanCanvas.tsx`'s column-based filtering
(`r.x < data.plot_w_m * 0.45`, hardcoded column x-positions at 0.34/0.37) with a
**generic per-room renderer**: for each room draw its rectangle, interior walls,
label, and its own door/window from the room's coordinates. No assumption about
columns or zones. This makes any archetype render correctly. The title-block fix
for `compliance?.overall` (which doesn't exist → always 0) is included: read
`compliance?.score`.

## Testing Strategy

Python unit tests under `backend/tests/` (pytest), run with
`cd backend && python -m pytest`:

- `geometry`: overlap, containment, shared-wall detection on known rects.
- `subdivision`: `fill_region` rooms are non-overlapping, in-region, meet min
  size and aspect bounds, total area ≈ region area.
- `room_program`: correct room set/zones per BHK.
- `circulation`: every room reachable from entrance in the door graph.
- `generator` (property tests over many seeds & plot sizes / BHKs):
  - no overlaps, all in-bounds, min sizes met, schema complete;
  - **variety**: ≥ 6 distinct layouts in 8 calls for the same inputs;
  - master has ensuite; kitchen adjacent to dining;
  - never raises; always returns a valid plan (generator or fallback).

## Risks & Mitigations

- *Squarify produces an awkward leftover cell* → aspect clamp + a final
  merge/snap pass; validation retry.
- *Connectivity can't be satisfied for a layout* → reject in validation, retry;
  fallback guarantees a result.
- *Renderer rewrite regresses visuals* → keep the generic renderer minimal and
  verify against several generated plans before removing old code.

## Rollback

`spatial_optimizer` keeps a one-line switch between the new generator and the
template engine; reverting the route restores prior behavior.

---

## Addendum (2026-06-15): Footprint shapes + accurate openings

Follow-up to user feedback ("plans are always rectangular; doors/windows not accurate").

**Footprint shapes (`floorplan/footprint.py`):** the plot stays the rectangle
the user enters; the *building* takes an orthogonal footprint — **Full / L / U /
T** (mirrored/transposed for orientation variety) — and the leftover corner or
notch becomes a **garden** (open space). A footprint is a small set of
rectangular **cells** (1–3) that tile the building plus garden rectangles. The
generator tiles rooms into the cells: one cell reuses the zone-group
sub-partition; multiple cells map one zone-group per cell by area
(`_grouping_for_n`, `_fill_cells`). If a shape can't fit all rooms it retries a
different footprint (often Full); tight plots stay Full. Result carries `shape`
and `gardens`. Garden-facing walls now count as exterior for windows
(`geometry.exterior_walls` — "wall not backed by another room").

**Renderer:** plot boundary drawn as a thin dashed lot line (building outline
comes from room walls, so non-rectangular footprints read correctly); gardens
drawn as dashed green open space; **doors** cut a real gap in the wall with a
swing leaf + arc into the room; **windows** cut a gap with a double glazing
line. Openings render in a top layer so a neighbour's wall can't cover them.

**Results:** all reasonable plot sizes use `ARCH-v1` with full shape variety
(L/T/U on roomy plots, Full on tighter ones), 12/12 distinct layouts, zero
room/garden overlaps. Tests: `test_footprint.py` (tiling/area conservation) +
extended `test_generator.py` (garden non-overlap, shape field).
