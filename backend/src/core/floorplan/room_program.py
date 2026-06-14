"""room_program.py — Maps a BHK type to the rooms a home needs.

A program is the *brief*: which rooms, how big (relative), what zone they belong
to, and architectural requirements. It carries no compass / Vastu information —
placement is decided later by the generator.

Bathrooms are not standalone entries: each is attached to a bedroom as a suite
(``bath_name`` on the bedroom spec). The master always has an ensuite; common
bathrooms are attached to other bedrooms. This avoids thin sliver bathrooms by
carving the bath as a strip of a properly-sized bedroom rectangle.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

# Zones group rooms by privacy/function. Used to lay out coherent regions.
PUBLIC = "public"
PRIVATE = "private"
SERVICE = "service"


@dataclass
class RoomSpec:
    name: str
    zone: str
    weight: float                 # relative area weight within its zone
    min_w: float                  # minimum width (m)
    min_h: float                  # minimum height/depth (m)
    max_aspect: float = 2.9       # longest/shortest side cap (habitable comfort)
    needs_window: bool = True
    bath_name: Optional[str] = None  # if set, carve a bath of this name from it


# Realistic minimums for compact homes (metres). Shorter side governs.
_MIN = {
    "living":  (2.9, 2.9),
    "dining":  (2.1, 2.1),
    "kitchen": (2.2, 2.2),
    "master":  (2.9, 3.0),
    "bedroom": (2.6, 2.7),
    "store":   (1.4, 1.4),
}


def _spec(name, zone, weight, kind, **kw) -> RoomSpec:
    mw, mh = _MIN[kind]
    return RoomSpec(name=name, zone=zone, weight=weight, min_w=mw, min_h=mh, **kw)


def build_program(bhk: str) -> List[RoomSpec]:
    """Return the ordered list of RoomSpecs for a BHK type (1/2/3/4 BHK)."""
    bhk = bhk.upper().replace(" ", "")
    n_bed = {"1BHK": 1, "2BHK": 2, "3BHK": 3, "4BHK": 4}.get(bhk, 3)

    specs: List[RoomSpec] = []

    # ── Public zone ──────────────────────────────────────────────────────
    # Dining is carved from the living room (open living-dining) by the
    # generator when has_dining() is true — not a standalone squarified room.
    living_w = 1.5 if n_bed >= 2 else 1.0  # extra area to host the dining annex
    specs.append(_spec("Living Room", PUBLIC, living_w, "living", max_aspect=3.0))

    # ── Service zone ─────────────────────────────────────────────────────
    specs.append(_spec("Kitchen", SERVICE, 0.7, "kitchen", max_aspect=2.8))
    if n_bed >= 3:
        specs.append(_spec("Store", SERVICE, 0.4, "store",
                           needs_window=False, max_aspect=3.2))

    # ── Private zone: bedrooms (master carries its ensuite) ───────────────
    # The master always has an ensuite. Common bathrooms are assigned to the
    # largest bedrooms by the generator (after sizes are known), so they never
    # land on a too-small bedroom — see generator._assign_common_baths.
    if n_bed == 1:
        specs.append(_spec("Bedroom", PRIVATE, 1.0, "bedroom",
                           bath_name="Bathroom"))
        return specs

    specs.append(_spec("Master Bedroom", PRIVATE, 1.0, "master",
                       bath_name="Ensuite"))

    other = n_bed - 1
    if other == 1:
        specs.append(_spec("Bedroom", PRIVATE, 0.8, "bedroom"))
    else:
        for i in range(other):
            specs.append(_spec(f"Bedroom {i + 1}", PRIVATE, 0.8, "bedroom"))

    return specs


def has_dining(bhk: str) -> bool:
    """Whether the plan includes a dining area (carved from the living room)."""
    bhk = bhk.upper().replace(" ", "")
    return bhk not in ("1BHK",)


def common_bath_count(bhk: str) -> int:
    """Number of common (non-ensuite) bathrooms for a BHK type."""
    bhk = bhk.upper().replace(" ", "")
    n_bed = {"1BHK": 1, "2BHK": 2, "3BHK": 3, "4BHK": 4}.get(bhk, 3)
    if n_bed == 1:
        return 0  # the single bedroom's bath is its own ensuite
    return 2 if n_bed >= 4 else 1


def zones_present(specs: List[RoomSpec]) -> List[str]:
    """Distinct zones in program order."""
    seen: List[str] = []
    for s in specs:
        if s.zone not in seen:
            seen.append(s.zone)
    return seen


def zone_weight(specs: List[RoomSpec], zone: str) -> float:
    return sum(s.weight for s in specs if s.zone == zone)
