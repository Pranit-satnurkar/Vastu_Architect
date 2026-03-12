"""
Vastu compliance scorer for floor plan layouts.

Evaluates each room's position against classical Vastu Shastra directional
rules using a 3×3 quadrant grid (NW/N/NE/W/C/E/SW/S/SE).

No external API calls — purely rule-based, always available.
"""

# ---------------------------------------------------------------------------
# Vastu directional data
# ---------------------------------------------------------------------------

# Sanskrit zone names and their meanings
_ZONE_INFO = {
    "NE": ("Ishanya",    "knowledge, spirituality, water"),
    "N":  ("Kubera",     "wealth, prosperity, opportunities"),
    "NW": ("Vayu",       "movement, air, guests"),
    "E":  ("Purva",      "health, new beginnings, sunrise"),
    "C":  ("Brahmasthana", "sacred center, open energy"),
    "W":  ("Varuna",     "gains, stability, water element"),
    "SE": ("Agneya",     "fire, cooking, transformation"),
    "S":  ("Yama",       "rest, strength, discipline"),
    "SW": ("Nairutya",   "stability, master, earth element"),
}

# Adjacency map — used for partial-credit scoring
_ADJACENT = {
    "NW": {"N", "W"},
    "N":  {"NW", "NE", "C"},
    "NE": {"N", "E"},
    "W":  {"NW", "SW", "C"},
    "C":  {"N", "S", "E", "W"},
    "E":  {"NE", "SE", "C"},
    "SW": {"W", "S"},
    "S":  {"SW", "SE", "C"},
    "SE": {"S", "E"},
}

# (preferred_quadrants, weight)
# weight reflects importance in overall score
_VASTU_RULES = {
    "living":   (["NE", "N", "E"],      3.0),
    "master":   (["SW", "S"],           3.0),
    "bedroom":  (["NW", "W", "S"],      2.0),
    "kitchen":  (["SE", "NW"],          3.0),
    "dining":   (["W", "S"],            1.5),
    "toilet":   (["NW", "SE"],          2.0),
    "pooja":    (["NE"],                2.5),
    "corridor": (["N", "E", "C"],       0.5),
    "store":    (["NW", "SW"],          1.0),
    "balcony":  (["N", "NE", "E"],      1.0),
    "study":    (["NE", "N", "E"],      1.5),
    "default":  (["N", "NE", "E", "C"], 0.8),
}

# Violation penalty messages
_FORBIDDEN = {
    "pooja":  {"SW", "SE", "S"},
    "master": {"NE"},
    "kitchen": {"NE", "SW"},
    "toilet": {"NE", "SW"},
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rtype(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("toilet", "bath", "wc")):         return "toilet"
    if any(k in n for k in ("corridor", "passage", "foyer")): return "corridor"
    if any(k in n for k in ("pooja", "puja", "prayer")):      return "pooja"
    if "master" in n:                                          return "master"
    if any(k in n for k in ("bedroom", "bed")):                return "bedroom"
    if any(k in n for k in ("living", "hall", "lounge")):     return "living"
    if "kitchen" in n:                                         return "kitchen"
    if "dining" in n:                                          return "dining"
    if any(k in n for k in ("store", "utility")):             return "store"
    if any(k in n for k in ("balcony", "terrace")):           return "balcony"
    if any(k in n for k in ("study", "office")):              return "study"
    return "default"


def _quadrant(cx: float, cy: float, plot_w: float, plot_d: float) -> str:
    """
    Map a point to one of 9 Vastu quadrants.
    Coordinate system: x increases East, y increases South (y=0 is North).
    """
    col = 0 if cx < plot_w / 3 else (1 if cx < 2 * plot_w / 3 else 2)
    row = 0 if cy < plot_d / 3 else (1 if cy < 2 * plot_d / 3 else 2)
    return [["NW", "N", "NE"], ["W", "C", "E"], ["SW", "S", "SE"]][row][col]


def _room_score(rtype: str, quadrant: str) -> int:
    """Score a single room 0–100 based on its Vastu quadrant."""
    preferred, _ = _VASTU_RULES.get(rtype, _VASTU_RULES["default"])
    forbidden = _FORBIDDEN.get(rtype, set())

    if quadrant in forbidden:
        return 10                          # severe violation
    if quadrant == preferred[0]:
        return 100                         # ideal placement
    if quadrant in preferred:
        return 80                          # acceptable
    if quadrant in _ADJACENT.get(preferred[0], set()):
        return 55                          # adjacent to ideal — partial credit
    return 30                              # wrong zone


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_plan(rooms: list, plot_w: float, plot_d: float) -> dict:
    """
    Score a complete floor plan for Vastu compliance.

    Returns:
        {
          "overall": int (0–100),
          "grade":   str ("A+" .. "D"),
          "summary": str (human-readable explanation),
          "room_scores": [{"name", "quadrant", "preferred", "score"}, ...]
        }
    """
    room_scores = []
    total_weighted = 0.0
    total_weight = 0.0

    for room in rooms:
        rtype = _rtype(room["name"])
        preferred, weight = _VASTU_RULES.get(rtype, _VASTU_RULES["default"])

        cx = room["x"] + room["w"] / 2
        cy = room["y"] + room["h"] / 2
        quad = _quadrant(cx, cy, plot_w, plot_d)
        score = _room_score(rtype, quad)

        total_weighted += score * weight
        total_weight += weight
        room_scores.append({
            "name":      room["name"],
            "quadrant":  quad,
            "preferred": preferred,
            "score":     score,
        })

    overall = round(total_weighted / total_weight) if total_weight > 0 else 0

    if overall >= 90:   grade = "A+"
    elif overall >= 80: grade = "A"
    elif overall >= 70: grade = "B+"
    elif overall >= 60: grade = "B"
    elif overall >= 50: grade = "C"
    else:               grade = "D"

    summary = _build_summary(room_scores, overall)

    return {
        "overall":     overall,
        "grade":       grade,
        "summary":     summary,
        "room_scores": room_scores,
    }


def _build_summary(room_scores: list, overall: int) -> str:
    """Generate a professional Vastu summary with Sanskrit zone names."""
    ideal   = [r for r in room_scores if r["score"] == 100]
    good    = [r for r in room_scores if r["score"] == 80]
    poor    = [r for r in room_scores if r["score"] < 50]

    parts = []

    # Highlight star placements
    for r in ideal[:3]:
        zone_name, zone_desc = _ZONE_INFO.get(r["quadrant"], (r["quadrant"], ""))
        parts.append(
            f"{r['name']} is correctly placed in the {zone_name} "
            f"({r['quadrant']}) zone — the zone of {zone_desc}."
        )

    # Note acceptable placements briefly
    if good and len(ideal) < 2:
        names = ", ".join(r["name"] for r in good[:2])
        parts.append(f"{names} occupies an acceptable Vastu zone.")

    # Flag violations
    for r in poor[:2]:
        pref_zone, pref_desc = _ZONE_INFO.get(r["preferred"][0], (r["preferred"][0], ""))
        curr_zone, _ = _ZONE_INFO.get(r["quadrant"], (r["quadrant"], ""))
        parts.append(
            f"{r['name']} is in the {curr_zone} ({r['quadrant']}) zone; "
            f"Vastu recommends the {pref_zone} ({r['preferred'][0]}) direction for {pref_desc}."
        )

    if not parts:
        if overall >= 80:
            parts.append("The layout aligns well with the Padavinyasa grid system.")
        else:
            parts.append("Several rooms deviate from their prescribed Vastu directions.")

    return " ".join(parts)
