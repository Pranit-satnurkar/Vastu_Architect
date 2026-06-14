from typing import Any, Dict, List
from src.core.floorplan.generator import generate as generate_arch_layout

PPM = 20


def optimize_layout(bhk_type, plot_w_ft, plot_d_ft,
                    style="modern",
                    user_preferences=None):
    """
    Primary layout entry point. Delegates to the rule-driven architectural
    generator (non-Vastu). Falls back to the scaled template engine on failure
    (handled inside the generator). Vastu is scored separately, not enforced.
    """
    result = generate_arch_layout(bhk_type, plot_w_ft, plot_d_ft, style)

    # Ensure pixel coords exist (BSP engine adds them, fallback may not)
    for r in result.get("rooms", []):
        if "x_px" not in r:
            r["x_px"] = round(r["x"] * PPM)
            r["y_px"] = round(r["y"] * PPM)
            r["w_px"] = round(r["w"] * PPM)
            r["h_px"] = round(r["h"] * PPM)

    return result


def compute_vastu_compliance(
    rooms: List[Dict[str, Any]],
    plot_w: float,
    plot_d: float,
) -> Dict[str, Any]:
    """
    Informational Vastu score — does NOT affect layout generation.
    Rooms come from real plans; this only annotates the result.
    """
    ZONES: Dict[str, Dict[str, str]] = {
        "Living Room":    {"prefer_x": "east",   "prefer_y": "north"},
        "Master Bedroom": {"prefer_x": "west",   "prefer_y": "south"},
        "Bedroom 1":      {"prefer_x": "west",   "prefer_y": "south"},
        "Bedroom 2":      {"prefer_x": "west",   "prefer_y": "south"},
        "Bedroom 3":      {"prefer_x": "west",   "prefer_y": "south"},
        "Bedroom":        {"prefer_x": "west",   "prefer_y": "south"},
        "Kitchen":        {"prefer_x": "east",   "prefer_y": "south"},
        "Kitchen & Dining": {"prefer_x": "east", "prefer_y": "south"},
        "Dining":         {"prefer_x": "east",   "prefer_y": "south"},
        "Toilet 1":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet 2":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet 3":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet":         {"prefer_x": "west",   "prefer_y": "north"},
        "Pooja":          {"prefer_x": "east",   "prefer_y": "north"},
        "Corridor":       {"prefer_x": "center", "prefer_y": "center"},
        "Foyer":          {"prefer_x": "center", "prefer_y": "north"},
        "Study":          {"prefer_x": "east",   "prefer_y": "north"},
        "Store":          {"prefer_x": "west",   "prefer_y": "north"},
    }

    def axis_zone(value, total, axis):
        if total <= 0:
            return "center"
        t = value / total
        if t < 1/3:
            return "west" if axis == "x" else "north"
        if t > 2/3:
            return "east" if axis == "x" else "south"
        return "center"

    scored = 0
    total = 0
    details = []

    for room in rooms:
        pref = ZONES.get(room["name"])
        if not pref:
            continue
        cx = room["x"] + room["w"] / 2
        cy = room["y"] + room["h"] / 2
        actual_x = axis_zone(cx, plot_w, "x")
        actual_y = axis_zone(cy, plot_d, "y")

        hits = 0
        if pref["prefer_x"] == "center" or actual_x == pref["prefer_x"]:
            hits += 1
        if pref["prefer_y"] == "center" or actual_y == pref["prefer_y"]:
            hits += 1

        score = hits / 2
        scored += score
        total += 1
        details.append({
            "room": room["name"],
            "score": score,
            "preferred": f"{pref['prefer_x']}-{pref['prefer_y']}",
            "actual": f"{actual_x}-{actual_y}",
        })

    overall = round((scored / total) * 100) if total else 0
    if overall >= 85:
        grade = "A"
    elif overall >= 70:
        grade = "B"
    elif overall >= 55:
        grade = "C"
    else:
        grade = "D"

    return {
        "score": overall,
        "grade": grade,
        "details": details,
        "note": "Vastu score is informational. Modern homes at 70%+ are well-balanced.",
    }
