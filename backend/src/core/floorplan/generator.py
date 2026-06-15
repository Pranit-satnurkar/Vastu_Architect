"""generator.py — Rule-driven residential floor plan generator (non-Vastu).

Pipeline:  program -> zone regions -> fill rooms -> carve ensuite ->
doors (connectivity) -> windows -> validate -> retry/fallback.

Variety comes from arrangement strategy, split axis, zone ordering, and the fill
seed — never from compass direction. Vastu is scored elsewhere, after the fact.
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from .geometry import Rect, no_overlaps, contains, shared_wall
from .room_program import (
    build_program, zones_present, zone_weight, RoomSpec,
    PUBLIC, PRIVATE, SERVICE,
)
from .subdivision import fill_region, partition_by_area
from .circulation import place_doors, choose_strategy
from .openings import place_windows
from .footprint import choose_footprint

FT = 0.3048
WALL = 0.23
PPM = 20
ENSUITE_DEPTH = (1.6, 2.2)
MAX_ATTEMPTS = 18


# ---------------------------------------------------------------------------
# Zone arrangement
# ---------------------------------------------------------------------------

def _zone_groups(specs: List[RoomSpec], strategy: str,
                 rng: random.Random) -> List[List[str]]:
    """
    Decide how zones are grouped into regions. Grouping is a variety lever:
    sometimes the three zones stay separate, sometimes public+service merge into
    a single 'social core' so no region is a lone thin room. A zone is only kept
    separate when it has enough rooms to tile well on its own.
    """
    zones = zones_present(specs)
    n_service = sum(1 for s in specs if s.zone == SERVICE)

    # Service alone is a single room (kitchen) unless it also has a store; a lone
    # room makes a thin region, so prefer merging it with public there.
    merge_service = (n_service < 2) or (rng.random() < 0.5)

    if merge_service and PUBLIC in zones and SERVICE in zones:
        groups = [[PUBLIC, SERVICE]]
        groups += [[z] for z in zones if z not in (PUBLIC, SERVICE)]
    else:
        groups = [[z] for z in zones]

    rng.shuffle(groups)  # de-Vastu: any group can land on any side
    if strategy == "central-public" and len(groups) == 3:
        pub = next((g for g in groups if PUBLIC in g), None)
        if pub:
            groups.remove(pub)
            groups.insert(1, pub)
    return groups


def _group_regions(interior: Rect, groups: List[List[str]],
                   specs: List[RoomSpec], rng: random.Random) -> List[tuple]:
    """Partition the interior among groups (by total weight). Returns
    [(group_zones, region_rect)]."""
    weighted = [(tuple(g), sum(zone_weight(specs, z) for z in g)) for g in groups]
    regions = partition_by_area(interior, weighted, rng)
    return [(list(g), regions[g]) for g, _ in weighted]


def _grouping_for_n(specs: List[RoomSpec], n: int) -> Optional[List[List[str]]]:
    """Group zones into exactly `n` buckets to map onto `n` footprint cells."""
    zones = zones_present(specs)  # program order: public, service, private
    if n == 2 and PRIVATE in zones:
        social = [z for z in zones if z != PRIVATE]
        return [social, [PRIVATE]] if social else None
    if n == 3 and len(zones) >= 3:
        return [[z] for z in zones[:3]]
    return None


def _fill_cells(cells: List[Rect], specs: List[RoomSpec], strategy: str,
                rng: random.Random) -> Optional[List[Rect]]:
    """Tile the building cells with rooms. A single cell reuses the zone-group
    sub-partition; multiple cells map one zone-group per cell (by area)."""
    if len(cells) == 1:
        groups = _zone_groups(specs, strategy, rng)
        rooms: List[Rect] = []
        for zones, region in _group_regions(cells[0], groups, specs, rng):
            group_specs = [s for s in specs if s.zone in zones]
            rng.shuffle(group_specs)
            group_specs.sort(key=lambda s: -s.weight)
            rooms += fill_region(region, group_specs, rng)
        return rooms

    groups = _grouping_for_n(specs, len(cells))
    if groups is None:
        return None
    cells_sorted = sorted(cells, key=lambda c: -c.area)
    groups_sorted = sorted(
        groups, key=lambda g: -sum(zone_weight(specs, z) for z in g))
    rooms = []
    for cell, group in zip(cells_sorted, groups_sorted):
        group_specs = [s for s in specs if s.zone in group]
        if not group_specs:
            return None
        rng.shuffle(group_specs)
        group_specs.sort(key=lambda s: -s.weight)
        rooms += fill_region(cell, group_specs, rng)
    return rooms


def _assign_common_baths(rooms: List[Rect], bhk: str) -> None:
    """Tag the largest non-master bedrooms with a common bathroom to carve."""
    from .room_program import common_bath_count
    n = common_bath_count(bhk)
    if n <= 0:
        return
    beds = [r for r in rooms
            if r.name.startswith("Bedroom") and r.meta.get("spec")]
    beds.sort(key=lambda r: -r.area)  # largest first — most room for a bath
    for i in range(min(n, len(beds))):
        label = "Bathroom" if n == 1 else f"Bathroom {i + 1}"
        beds[i].meta["bath_name"] = label


def _carve_strip(parent: Rect, name: str, annex_cap: float, annex_min: float,
                 depth_max: float, zone: str, rng: random.Random,
                 needs_window: bool = False) -> Optional[Rect]:
    """
    Cut a full-length rectangular strip (an annex: bathroom, dining…) off a
    parent room, keeping both pieces rectangular and valid. The strip spans the
    parent's shorter side so the annex isn't a long sliver. Shrinks `parent` in
    place and returns the annex Rect, or None if it won't fit.
    """
    pspec: RoomSpec = parent.meta["spec"]

    def feasible(span: float, perp: float, perp_min: float):
        lo = max(annex_min, span / annex_cap)   # deep enough to cap annex aspect
        hi = min(depth_max, perp - perp_min)     # shallow enough to keep parent
        return (lo, hi) if hi >= lo else None

    order = ["w", "h"] if parent.w <= parent.h else ["h", "w"]
    annex = None
    for axis in order:
        if axis == "w":  # horizontal strip (N/S): annex spans full width
            rng_d = feasible(parent.w, parent.h, pspec.min_h)
            if not rng_d:
                continue
            depth = round(rng.uniform(*rng_d), 2)
            side = rng.choice(["N", "S"])
            annex = Rect(parent.x, parent.y if side == "N" else parent.y2 - depth,
                         parent.w, depth, name)
            if side == "N":
                parent.y += depth
            parent.h -= depth
            break
        else:            # vertical strip (E/W): annex spans full height
            rng_d = feasible(parent.h, parent.w, pspec.min_w)
            if not rng_d:
                continue
            depth = round(rng.uniform(*rng_d), 2)
            side = rng.choice(["E", "W"])
            annex = Rect(parent.x if side == "W" else parent.x2 - depth, parent.y,
                         depth, parent.h, name)
            if side == "W":
                parent.x += depth
            parent.w -= depth
            break

    if annex is None:
        return None
    annex.meta["spec"] = RoomSpec(name, zone, 0.0, annex_min, annex_min,
                                  max_aspect=annex_cap, needs_window=needs_window)
    return annex


def _carve_bath(bedroom: Rect, bath_name: str,
                rng: random.Random) -> Optional[Rect]:
    """Carve an ensuite/common bath strip off a bedroom suite."""
    bath = _carve_strip(bedroom, bath_name, annex_cap=3.4, annex_min=1.4,
                        depth_max=2.6, zone=PRIVATE, rng=rng, needs_window=False)
    if bath is not None:
        bath.meta["bath"] = True
    return bath


def _carve_dining(living: Rect, rng: random.Random) -> Optional[Rect]:
    """Carve an open dining area off the living room (living-dining)."""
    return _carve_strip(living, "Dining", annex_cap=2.8, annex_min=2.1,
                        depth_max=3.6, zone=PUBLIC, rng=rng, needs_window=True)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _valid(rooms: List[Rect], plot: Rect) -> bool:
    if not no_overlaps(rooms):
        return False
    for r in rooms:
        if not contains(plot, r, eps=0.05):
            return False
        spec: RoomSpec = r.meta.get("spec")
        min_w = spec.min_w if spec else 1.2
        min_h = spec.min_h if spec else 1.2
        max_aspect = spec.max_aspect if spec else 2.6
        # min dims (either orientation acceptable for the room's footprint)
        long_ok = (r.w + 0.05 >= min_w and r.h + 0.05 >= min_h) or \
                  (r.h + 0.05 >= min_w and r.w + 0.05 >= min_h)
        if not long_ok:
            return False
        if r.aspect > max_aspect + 0.15:
            return False
    return True


def _kitchen_dining_adjacent(rooms: List[Rect]) -> bool:
    k = next((r for r in rooms if r.name == "Kitchen"), None)
    d = next((r for r in rooms if r.name == "Dining"), None)
    if not k or not d:
        return True  # no dining in program (1BHK) — nothing to satisfy
    return shared_wall(k, d) is not None


# ---------------------------------------------------------------------------
# One attempt
# ---------------------------------------------------------------------------

def _attempt(bhk: str, interior: Rect, plot: Rect, strategy: str,
             rng: random.Random, force_full: bool = False):
    """
    Build one candidate plan on a chosen footprint. Returns
    (rooms, kitchen_dining_adjacent, gardens, shape) for a hard-valid plan,
    or None on any hard-constraint violation.
    """
    specs = build_program(bhk)
    cells, gardens, shape = choose_footprint(interior, rng, force_full=force_full)

    rooms = _fill_cells(cells, specs, strategy, rng)
    if rooms is None:
        return None

    # Open dining carved from the living room (living-dining).
    from .room_program import has_dining
    if has_dining(bhk):
        living = next((r for r in rooms if r.name == "Living Room"), None)
        if living is None:
            return None
        dining = _carve_dining(living, rng)
        if dining is None:
            return None
        rooms.append(dining)

    # Assign common bathrooms to the largest non-master bedrooms (now that
    # sizes are known), so a bath never lands on a too-small bedroom.
    _assign_common_baths(rooms, bhk)

    # Carve each bedroom's bath suite (master ensuite + assigned baths) as a strip.
    baths: List[Rect] = []
    for r in list(rooms):
        bath_name = r.meta.get("bath_name") or (
            r.meta["spec"].bath_name if r.meta.get("spec") else None)
        if bath_name:
            bath = _carve_bath(r, bath_name, rng)
            if bath is None:
                return None
            baths.append(bath)
    rooms += baths

    rooms = [r.rounded() for r in rooms]
    if not _valid(rooms, plot):
        return None

    # Entrance faces the plot edge; pass the interior boundary for that test.
    entrance = place_doors(rooms, interior, rng)
    if entrance is None:
        return None
    place_windows(rooms, rng)   # windows on any exterior wall (incl. garden side)
    # kitchen-dining adjacency is a soft quality signal, not a hard gate.
    return rooms, _kitchen_dining_adjacent(rooms), gardens, shape


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate(bhk_type: str, plot_w_ft: float, plot_d_ft: float,
             style: str = "modern", seed: Optional[int] = None) -> Dict[str, Any]:
    """Generate a floor plan. Falls back to the template engine on failure."""
    seed = seed if seed is not None else random.randint(0, 999_999)
    plot_w = round(plot_w_ft * FT, 2)
    plot_d = round(plot_d_ft * FT, 2)
    plot = Rect(0, 0, plot_w, plot_d)
    interior = Rect(WALL, WALL, round(plot_w - 2 * WALL, 2),
                    round(plot_d - 2 * WALL, 2))

    fallback_valid = None  # first hard-valid plan, used if none is kd-adjacent
    for attempt in range(MAX_ATTEMPTS):
        rng = random.Random(seed + attempt * 7919)
        strategy = choose_strategy(rng)
        # Late retries pin to the plain rectangle so a plot that can't host a
        # shape still yields an ARCH plan rather than falling back to templates.
        force_full = attempt >= MAX_ATTEMPTS - 6
        cand = _attempt(bhk_type, interior, plot, strategy, rng, force_full)
        if cand is None:
            continue
        rooms, kd_adjacent, gardens, shape = cand
        if kd_adjacent:
            return _to_result(rooms, bhk_type, style, plot_w, plot_d,
                              plot_w_ft, plot_d_ft, shape, seed, gardens)
        if fallback_valid is None:
            fallback_valid = (rooms, shape, gardens)

    if fallback_valid is not None:
        rooms, shape, gardens = fallback_valid
        return _to_result(rooms, bhk_type, style, plot_w, plot_d,
                          plot_w_ft, plot_d_ft, shape, seed, gardens)

    # Fallback: scaled professional templates.
    from src.core.layout_engine import generate_layout
    result = generate_layout(bhk_type, plot_w_ft, plot_d_ft, style)
    for r in result.get("rooms", []):
        if "x_px" not in r:
            r["x_px"] = round(r["x"] * PPM)
            r["y_px"] = round(r["y"] * PPM)
            r["w_px"] = round(r["w"] * PPM)
            r["h_px"] = round(r["h"] * PPM)
    return result


def _to_result(rooms: List[Rect], bhk, style, plot_w, plot_d,
               plot_w_ft, plot_d_ft, shape, seed,
               gardens: Optional[List[Rect]] = None) -> Dict[str, Any]:
    out_rooms = []
    for r in rooms:
        out_rooms.append({
            "name": r.name,
            "x": r.x, "y": r.y, "w": r.w, "h": r.h,
            "door": r.door, "window": r.window,
            "x_px": round(r.x * PPM), "y_px": round(r.y * PPM),
            "w_px": round(r.w * PPM), "h_px": round(r.h * PPM),
        })
    out_gardens = [{
        "x": g.x, "y": g.y, "w": g.w, "h": g.h,
        "x_px": round(g.x * PPM), "y_px": round(g.y * PPM),
        "w_px": round(g.w * PPM), "h_px": round(g.h * PPM),
    } for g in (gardens or [])]
    return {
        "plot_w_m": plot_w, "plot_d_m": plot_d,
        "plot_w_ft": round(plot_w_ft, 1), "plot_d_ft": round(plot_d_ft, 1),
        "bhk_type": bhk, "style": style,
        "engine": "ARCH-v1",
        "template_used": shape,
        "shape": shape,
        "gardens": out_gardens,
        "room_count": len(out_rooms),
        "rooms": out_rooms,
        "seed": seed,
    }
