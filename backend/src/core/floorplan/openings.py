"""openings.py — Window placement on exterior walls.

Rooms whose spec wants daylight get a window on their longest exterior wall.
Purely geometric — no compass/Vastu preference.
"""

from __future__ import annotations

import random
from typing import List

from .geometry import Rect, on_exterior

WINDOW_FRAC = 0.5   # window width as a fraction of the chosen wall (capped)
WINDOW_MAX = 1.8


def _wall_len(room: Rect, wall: str) -> float:
    return room.w if wall in ("N", "S") else room.h


def place_windows(rooms: List[Rect], plot: Rect, rng: random.Random) -> None:
    for r in rooms:
        spec = r.meta.get("spec")
        if spec is not None and not spec.needs_window:
            continue
        ext = on_exterior(r, plot)
        if not ext:
            continue
        # Prefer the wall opposite the door, else the longest exterior wall.
        door_wall = r.door["wall"] if r.door else None
        candidates = [w for w in ext if w != door_wall] or ext
        wall = max(candidates, key=lambda w: _wall_len(r, w))
        wlen = _wall_len(r, wall)
        width = round(min(WINDOW_MAX, max(0.9, wlen * WINDOW_FRAC)), 2)
        pos = round(rng.uniform(0.35, 0.6), 2)
        r.window = {"wall": wall, "pos": pos, "width": width}
