"""subdivision.py — Squarified guillotine partitioning.

Core routine: ``squarify`` lays out weighted items into a region as
non-overlapping rectangles that fill it exactly, keeping each rectangle as close
to square as possible (the squarified-treemap heuristic). This keeps aspect
ratios sane at any level of the hierarchy.

The generator uses it twice: once to carve the interior into *zone* regions, and
again to fill each zone region with its *rooms*.
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Tuple

from .geometry import Rect
from .room_program import RoomSpec


def _worst_aspect(areas: List[float], strip_length: float,
                  thickness: float) -> float:
    if thickness <= 0 or strip_length <= 0:
        return float("inf")
    worst = 1.0
    for a in areas:
        side = a / thickness
        if side <= 0:
            return float("inf")
        asp = max(side, thickness) / min(side, thickness)
        worst = max(worst, asp)
    return worst


def squarify(region: Rect, items: List[Tuple[Any, float]],
             rng: random.Random) -> List[Tuple[Any, Rect]]:
    """
    Partition `region` into one Rect per item, area proportional to the item's
    weight. Returns [(payload, Rect)] in input order. Always fills the region.
    """
    if not items:
        return []
    if len(items) == 1:
        return [(items[0][0], Rect(region.x, region.y, region.w, region.h))]

    total = sum(max(w, 1e-6) for _, w in items)
    area = region.area
    targets = [(payload, area * max(w, 1e-6) / total) for payload, w in items]
    return _squarify(Rect(region.x, region.y, region.w, region.h), targets)


def _squarify(region: Rect, targets) -> List[Tuple[Any, Rect]]:
    placed: List[Tuple[Any, Rect]] = []
    remaining = list(targets)
    free = Rect(region.x, region.y, region.w, region.h)

    while remaining:
        horizontal = free.w <= free.h
        strip_length = free.w if horizontal else free.h
        row = [remaining[0]]
        rest = remaining[1:]
        row_area = row[0][1]
        thickness = row_area / strip_length if strip_length > 0 else free.h
        best = _worst_aspect([a for _, a in row], strip_length, thickness)

        while rest:
            trial = row + [rest[0]]
            t_area = row_area + rest[0][1]
            t_thick = t_area / strip_length if strip_length > 0 else free.h
            w = _worst_aspect([a for _, a in trial], strip_length, t_thick)
            if w <= best:
                row, best = trial, w
                row_area, thickness = t_area, t_thick
                rest = rest[1:]
            else:
                break

        placed += _emit_row(free, row, horizontal, thickness, strip_length)

        if horizontal:
            free = Rect(free.x, free.y + thickness, free.w,
                        max(0.0, free.h - thickness))
        else:
            free = Rect(free.x + thickness, free.y,
                        max(0.0, free.w - thickness), free.h)
        remaining = rest

    return placed


def _emit_row(free: Rect, row, horizontal: bool, thickness: float,
              strip_length: float) -> List[Tuple[Any, Rect]]:
    out: List[Tuple[Any, Rect]] = []
    row_total = sum(a for _, a in row) or 1.0
    cursor = free.x if horizontal else free.y
    for payload, a in row:
        length = strip_length * (a / row_total)
        if horizontal:
            r = Rect(cursor, free.y, length, thickness)
            cursor += length
        else:
            r = Rect(free.x, cursor, thickness, length)
            cursor += length
        out.append((payload, r))
    return out


# ---------------------------------------------------------------------------
# Convenience wrappers
# ---------------------------------------------------------------------------

def fill_region(region: Rect, specs: List[RoomSpec],
                rng: random.Random) -> List[Rect]:
    """Fill a region with one Rect per RoomSpec (area ∝ spec.weight)."""
    items = [(s, s.weight) for s in specs]
    rects: List[Rect] = []
    for spec, r in squarify(region, items, rng):
        r.name = spec.name
        r.meta["spec"] = spec
        rects.append(r)
    return rects


def partition_by_area(region: Rect, weighted: List[Tuple[Any, float]],
                      rng: random.Random) -> Dict[Any, Rect]:
    """Partition a region among keys by weight; returns key -> Rect."""
    return {key: rect for key, rect in squarify(region, weighted, rng)}
