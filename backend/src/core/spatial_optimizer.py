from typing import Any, Dict, List, Tuple
from .layout_engine import generate_layout


def optimize_layout(bhk_type, plot_w_ft, plot_d_ft,
                    style="modern",
                    user_preferences=None):
    """
    Primary layout entry point.
    Delegates entirely to the real-plan engine (layout_engine.py).
    Adds pixel coordinates for the frontend canvas.
    """
    ppm = 20

    result = generate_layout(bhk_type, plot_w_ft, plot_d_ft, style)

    for r in result["rooms"]:
        r["x_px"] = round(r["x"] * ppm)
        r["y_px"] = round(r["y"] * ppm)
        r["w_px"] = round(r["w"] * ppm)
        r["h_px"] = round(r["h"] * ppm)

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
        "Dining":         {"prefer_x": "east",   "prefer_y": "south"},
        "Toilet 1":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet 2":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet 3":       {"prefer_x": "west",   "prefer_y": "north"},
        "Toilet":         {"prefer_x": "west",   "prefer_y": "north"},
        "Pooja":          {"prefer_x": "east",   "prefer_y": "north"},
        "Corridor":       {"prefer_x": "center", "prefer_y": "center"},
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

    def match(actual, prefer):
        if prefer == "center":
            return 1.0 if actual == "center" else 0.5
        if actual == prefer:
            return 1.0
        return 0.5 if actual == "center" else 0.0

    scored: List[Tuple[str, float]] = []
    for r in rooms:
        name = r.get("name", "")
        if name not in ZONES:
            continue
        pref = ZONES[name]
        cx = float(r.get("x", 0)) + float(r.get("w", 0)) / 2
        cy = float(r.get("y", 0)) + float(r.get("h", 0)) / 2
        sx = match(axis_zone(cx, plot_w, "x"), pref["prefer_x"])
        sy = match(axis_zone(cy, plot_d, "y"), pref["prefer_y"])
        scored.append((name, (sx + sy) / 2))

    if not scored:
        return {"overall": 0, "grade": "D", "summary": "No scorable rooms found."}

    overall = round(100 * sum(s for _, s in scored) / len(scored))
    grade = (
        "A+" if overall >= 90 else
        "A"  if overall >= 80 else
        "B+" if overall >= 70 else
        "B"  if overall >= 60 else
        "C"  if overall >= 50 else "D"
    )
    good = [n for n, s in scored if s >= 0.75]
    summary = f"{len(good)}/{len(scored)} key rooms match preferred Vastu zones."

    return {"overall": overall, "grade": grade, "summary": summary}
