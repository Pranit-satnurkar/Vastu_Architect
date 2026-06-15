"""footprint.py — Building footprint shapes inside a rectangular plot.

The plot stays the rectangle the user enters. The *building* may take an
orthogonal shape — Full, L, U or T — and the leftover corner/notch becomes a
garden (open space). A footprint is expressed as a small set of rectangular
**cells** that tile the building, plus **garden** rectangles for the open area.
Rooms are later tiled into the cells, so everything stays rectangular (no
circles/triangles).

Shapes are defined in a unit square and then mirrored/transposed for variety,
so e.g. an L can open onto any corner. Cell count drives how rooms are grouped:
Full=1, L=2, T=2, U=3.
"""

from __future__ import annotations

import random
from typing import List, Tuple

from .geometry import Rect

# A unit-square footprint: (cells, gardens) as fractional rects (fx, fy, fw, fh).
FRect = Tuple[float, float, float, float]


def _full(rng) -> Tuple[List[FRect], List[FRect], str]:
    return [(0.0, 0.0, 1.0, 1.0)], [], "full"


def _l(rng) -> Tuple[List[FRect], List[FRect], str]:
    cx = rng.uniform(0.30, 0.44)   # garden width fraction
    cy = rng.uniform(0.28, 0.42)   # garden depth fraction
    cells = [(0.0, 0.0, 1.0, 1.0 - cy),          # full-width band
             (0.0, 1.0 - cy, 1.0 - cx, cy)]       # remaining leg
    gardens = [(1.0 - cx, 1.0 - cy, cx, cy)]       # cut corner
    return cells, gardens, "L"


def _t(rng) -> Tuple[List[FRect], List[FRect], str]:
    cx = rng.uniform(0.17, 0.26)   # each cut corner width
    cy = rng.uniform(0.28, 0.40)   # cut depth
    cells = [(0.0, 0.0, 1.0, 1.0 - cy),               # bar
             (cx, 1.0 - cy, 1.0 - 2 * cx, cy)]         # stem
    gardens = [(0.0, 1.0 - cy, cx, cy),
               (1.0 - cx, 1.0 - cy, cx, cy)]
    return cells, gardens, "T"


def _u(rng) -> Tuple[List[FRect], List[FRect], str]:
    cy = rng.uniform(0.28, 0.40)   # notch depth
    nw = rng.uniform(0.24, 0.36)   # notch width
    nx = (1.0 - nw) / 2 + rng.uniform(-0.08, 0.08)
    nx = max(0.24, min(1.0 - nw - 0.24, nx))
    cells = [(0.0, 0.0, 1.0, 1.0 - cy),                       # top band
             (0.0, 1.0 - cy, nx, cy),                          # left leg
             (nx + nw, 1.0 - cy, 1.0 - nx - nw, cy)]           # right leg
    gardens = [(nx, 1.0 - cy, nw, cy)]
    return cells, gardens, "U"


# Favour shapes over plain rectangles so the variety is obvious; Full is the
# fallback the generator lands on anyway when a shape can't fit a tight plot.
_SHAPES = [(_full, 12), (_l, 34), (_t, 28), (_u, 26)]


def _mirror_x(r: FRect) -> FRect:
    fx, fy, fw, fh = r
    return (1.0 - fx - fw, fy, fw, fh)


def _mirror_y(r: FRect) -> FRect:
    fx, fy, fw, fh = r
    return (fx, 1.0 - fy - fh, fw, fh)


def _transpose(r: FRect) -> FRect:
    fx, fy, fw, fh = r
    return (fy, fx, fh, fw)


def choose_footprint(interior: Rect, rng: random.Random,
                     force_full: bool = False
                     ) -> Tuple[List[Rect], List[Rect], str]:
    """
    Pick a building footprint for `interior`. Returns (cells, gardens, name)
    as absolute Rects. `cells` tile the building; `gardens` are open blocks.
    `force_full` pins it to the plain rectangle (used on late retries so a plot
    that can't host a shape still produces an ARCH plan instead of falling back).
    """
    fn = _full if force_full else _weighted_choice(_SHAPES, rng)[0]
    cells_f, gardens_f, name = fn(rng)

    # Random orientation: mirror in x / y and optionally transpose.
    ops = []
    if rng.random() < 0.5:
        ops.append(_mirror_x)
    if rng.random() < 0.5:
        ops.append(_mirror_y)
    if rng.random() < 0.5:
        ops.append(_transpose)

    def apply(r: FRect) -> FRect:
        for op in ops:
            r = op(r)
        return r

    def to_abs(r: FRect) -> Rect:
        fx, fy, fw, fh = apply(r)
        return Rect(round(interior.x + fx * interior.w, 2),
                    round(interior.y + fy * interior.h, 2),
                    round(fw * interior.w, 2),
                    round(fh * interior.h, 2))

    cells = [to_abs(r) for r in cells_f]
    gardens = [to_abs(r) for r in gardens_f]
    return cells, gardens, name


def _weighted_choice(items, rng):
    total = sum(w for _, w in items)
    pick = rng.uniform(0, total)
    acc = 0.0
    for it, w in items:
        acc += w
        if pick <= acc:
            return it, w
    return items[-1]
