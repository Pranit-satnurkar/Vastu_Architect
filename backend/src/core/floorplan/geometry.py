"""geometry.py — Rectangle primitives and spatial predicates.

All coordinates are in metres. Origin is top-left (y grows downward), matching
the rest of the codebase and the frontend canvas. A wall side is named by
compass: N = top (min y), S = bottom (max y), W = left (min x), E = right (max x).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

EPS = 0.02  # 2 cm tolerance for float comparisons


def _r(v: float) -> float:
    return round(v, 2)


@dataclass
class Rect:
    """An axis-aligned rectangle that may carry a room name and openings."""

    x: float
    y: float
    w: float
    h: float
    name: str = ""
    door: Optional[Dict] = None
    window: Optional[Dict] = None
    meta: Dict = field(default_factory=dict)

    # -- derived ----------------------------------------------------------
    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.h

    @property
    def area(self) -> float:
        return self.w * self.h

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def aspect(self) -> float:
        """Longest side / shortest side (>= 1)."""
        lo, hi = sorted((self.w, self.h))
        return hi / lo if lo > 0 else float("inf")

    def rounded(self) -> "Rect":
        return Rect(_r(self.x), _r(self.y), _r(self.w), _r(self.h),
                    self.name, self.door, self.window, dict(self.meta))


def overlaps(a: Rect, b: Rect, eps: float = EPS) -> bool:
    """True if a and b share interior area (touching edges do not count)."""
    return (a.x < b.x2 - eps and b.x < a.x2 - eps and
            a.y < b.y2 - eps and b.y < a.y2 - eps)


def contains(outer: Rect, inner: Rect, eps: float = EPS) -> bool:
    """True if inner sits within outer (edge-flush allowed)."""
    return (inner.x >= outer.x - eps and inner.y >= outer.y - eps and
            inner.x2 <= outer.x2 + eps and inner.y2 <= outer.y2 + eps)


def shared_wall(a: Rect, b: Rect, eps: float = EPS) -> Optional[Tuple[str, float]]:
    """
    If a and b are adjacent along a wall, return (wall_of_a, overlap_length).
    wall_of_a is the side of `a` that touches `b` (N/S/E/W). Returns None if the
    rectangles are not edge-adjacent with a positive shared span.
    """
    # Vertical shared edge: a's E touches b's W, or a's W touches b's E
    if abs(a.x2 - b.x) <= eps:
        span = min(a.y2, b.y2) - max(a.y, b.y)
        if span > eps:
            return ("E", span)
    if abs(a.x - b.x2) <= eps:
        span = min(a.y2, b.y2) - max(a.y, b.y)
        if span > eps:
            return ("W", span)
    # Horizontal shared edge: a's S touches b's N, or a's N touches b's S
    if abs(a.y2 - b.y) <= eps:
        span = min(a.x2, b.x2) - max(a.x, b.x)
        if span > eps:
            return ("S", span)
    if abs(a.y - b.y2) <= eps:
        span = min(a.x2, b.x2) - max(a.x, b.x)
        if span > eps:
            return ("N", span)
    return None


def on_exterior(room: Rect, plot: Rect, eps: float = EPS) -> List[str]:
    """Return the walls of `room` that lie on the plot boundary."""
    walls = []
    if abs(room.y - plot.y) <= eps:
        walls.append("N")
    if abs(room.y2 - plot.y2) <= eps:
        walls.append("S")
    if abs(room.x - plot.x) <= eps:
        walls.append("W")
    if abs(room.x2 - plot.x2) <= eps:
        walls.append("E")
    return walls


def no_overlaps(rooms: List[Rect], eps: float = EPS) -> bool:
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            if overlaps(rooms[i], rooms[j], eps):
                return False
    return True
