"""circulation.py — Door placement with guaranteed reachability.

After rooms are placed, we connect them so every room is reachable from the
entrance. We build an adjacency graph from shared walls wide enough for a door,
take a spanning tree rooted at an entrance room, and put one door on each tree
edge (each non-root room's door faces its parent). The entrance room also gets a
door on an exterior wall. No compass/Vastu logic is involved.
"""

from __future__ import annotations

import random
from collections import deque
from typing import Dict, List, Optional, Tuple

from .geometry import Rect, shared_wall, on_exterior

DOOR_MIN_SPAN = 0.9   # a shared wall must be at least this long to host a door
DOOR_WIDTH = 0.9
ENTRY_WIDTH = 1.1

STRATEGIES = ["stacked", "columns", "L-wrap", "central-public"]


def choose_strategy(rng: random.Random) -> str:
    return rng.choice(STRATEGIES)


def _door_on_wall(room: Rect, wall: str, overlap_lo: float, overlap_hi: float,
                  width: float) -> Dict:
    """Build a door dict centred on the [overlap_lo, overlap_hi] span of `wall`."""
    if wall in ("N", "S"):
        wall_len = room.w
        start = room.x
    else:
        wall_len = room.h
        start = room.y
    span = max(0.0, overlap_hi - overlap_lo)
    w = round(min(width, 0.6 * span if span > 0 else width, 0.6 * wall_len), 2)
    w = max(0.6, w)
    centre = (overlap_lo + overlap_hi) / 2
    pos = (centre - start) / wall_len if wall_len > 0 else 0.5
    pos = round(min(0.85, max(0.15, pos)), 2)
    return {"wall": wall, "pos": pos, "width": w}


def _overlap_interval(a: Rect, b: Rect, wall: str) -> Tuple[float, float]:
    if wall in ("E", "W"):
        return (max(a.y, b.y), min(a.y2, b.y2))
    return (max(a.x, b.x), min(a.x2, b.x2))


def build_adjacency(rooms: List[Rect]) -> Dict[int, List[Tuple[int, str]]]:
    """idx -> list of (neighbour_idx, wall_of_this_room_facing_neighbour)."""
    adj: Dict[int, List[Tuple[int, str]]] = {i: [] for i in range(len(rooms))}
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            sw = shared_wall(rooms[i], rooms[j])
            if sw and sw[1] >= DOOR_MIN_SPAN:
                wall_i = sw[0]
                wall_j = {"N": "S", "S": "N", "E": "W", "W": "E"}[wall_i]
                adj[i].append((j, wall_i))
                adj[j].append((i, wall_j))
    return adj


def _pick_entrance(rooms: List[Rect], plot: Rect, rng: random.Random) -> int:
    """Prefer a public room (Living) sitting on an exterior wall."""
    public_exterior = [i for i, r in enumerate(rooms)
                       if r.meta.get("spec") and r.meta["spec"].zone == "public"
                       and on_exterior(r, plot)]
    if public_exterior:
        # Living first if available.
        living = [i for i in public_exterior if rooms[i].name == "Living Room"]
        return rng.choice(living) if living else rng.choice(public_exterior)
    exterior = [i for i, r in enumerate(rooms) if on_exterior(r, plot)]
    return rng.choice(exterior) if exterior else 0


def place_doors(rooms: List[Rect], plot: Rect,
                rng: random.Random) -> Optional[int]:
    """
    Assign doors so every room is reachable from the entrance.
    Returns the entrance room index, or None if the graph is disconnected
    (caller should reject and retry).
    """
    adj = build_adjacency(rooms)
    entrance = _pick_entrance(rooms, plot, rng)

    # BFS spanning tree from the entrance.
    visited = {entrance}
    parent: Dict[int, Tuple[int, str]] = {}
    q = deque([entrance])
    while q:
        cur = q.popleft()
        neigh = adj[cur][:]
        rng.shuffle(neigh)
        for nb, wall in neigh:
            if nb not in visited:
                visited.add(nb)
                parent[nb] = (cur, {"N": "S", "S": "N", "E": "W", "W": "E"}[wall])
                q.append(nb)

    if len(visited) != len(rooms):
        return None  # disconnected — let the generator retry

    # Each non-root room gets a door toward its parent.
    for idx, (par, wall_of_child) in parent.items():
        child, par_rect = rooms[idx], rooms[par]
        lo, hi = _overlap_interval(child, par_rect, wall_of_child)
        child.door = _door_on_wall(child, wall_of_child, lo, hi, DOOR_WIDTH)

    # Entrance door on an exterior wall of the entrance room.
    ext = on_exterior(rooms[entrance], plot)
    if ext:
        wall = rng.choice(ext)
        r = rooms[entrance]
        if wall in ("N", "S"):
            lo, hi = r.x, r.x2
        else:
            lo, hi = r.y, r.y2
        r.door = _door_on_wall(r, wall, lo, hi, ENTRY_WIDTH)
        r.meta["entrance"] = True

    return entrance
