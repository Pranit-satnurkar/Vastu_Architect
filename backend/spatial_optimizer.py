from layout_engine import generate_layout
import time
from typing import Any, Dict, List, Optional, Tuple


VASTU_ZONES: Dict[str, Dict[str, str]] = {
    "Living Room": {"prefer_x": "east", "prefer_y": "north"},
    "Master Bedroom": {"prefer_x": "west", "prefer_y": "south"},
    "Bedroom 1": {"prefer_x": "west", "prefer_y": "south"},
    "Bedroom 2": {"prefer_x": "west", "prefer_y": "south"},
    "Bedroom 3": {"prefer_x": "west", "prefer_y": "south"},
    "Bedroom": {"prefer_x": "west", "prefer_y": "south"},
    "Kitchen": {"prefer_x": "east", "prefer_y": "south"},
    "Dining": {"prefer_x": "east", "prefer_y": "south"},
    "Toilet 1": {"prefer_x": "west", "prefer_y": "north"},
    "Toilet 2": {"prefer_x": "west", "prefer_y": "north"},
    "Toilet 3": {"prefer_x": "west", "prefer_y": "north"},
    "Toilet": {"prefer_x": "west", "prefer_y": "north"},
    "Pooja": {"prefer_x": "east", "prefer_y": "north"},
    "Corridor": {"prefer_x": "center", "prefer_y": "center"},
    "Store": {"prefer_x": "west", "prefer_y": "north"},
}


def _axis_zone(value: float, total: float, axis: str) -> str:
    """
    Split plot into thirds.
    - x axis: west/center/east
    - y axis: north/center/south (y grows downward from north wall)
    """
    if total <= 0:
        return "center"
    t = value / total
    if t < 1 / 3:
        return "west" if axis == "x" else "north"
    if t > 2 / 3:
        return "east" if axis == "x" else "south"
    return "center"


def _match_score(actual: str, prefer: str) -> float:
    if prefer == "center":
        return 1.0 if actual == "center" else 0.5
    if actual == prefer:
        return 1.0
    # Being in center is "okay" for most non-center preferences
    if actual == "center":
        return 0.5
    return 0.0


def compute_vastu_compliance(
    rooms: List[Dict[str, Any]],
    plot_w: float,
    plot_d: float,
) -> Dict[str, Any]:
    scored: List[Tuple[str, float]] = []
    for r in rooms:
        name = r.get("name")
        if not name or name not in VASTU_ZONES:
            continue
        pref = VASTU_ZONES[name]
        cx = float(r.get("x", 0)) + float(r.get("w", 0)) / 2
        cy = float(r.get("y", 0)) + float(r.get("h", 0)) / 2

        actual_x = _axis_zone(cx, plot_w, "x")
        actual_y = _axis_zone(cy, plot_d, "y")
        sx = _match_score(actual_x, pref["prefer_x"])
        sy = _match_score(actual_y, pref["prefer_y"])
        scored.append((name, (sx + sy) / 2))

    if not scored:
        overall = 0
    else:
        overall = round(100 * sum(s for _, s in scored) / len(scored))

    if overall >= 90:
        grade = "A+"
    elif overall >= 80:
        grade = "A"
    elif overall >= 70:
        grade = "B+"
    elif overall >= 60:
        grade = "B"
    elif overall >= 50:
        grade = "C"
    else:
        grade = "D"

    good = [name for name, s in scored if s >= 0.75]
    summary = (
        f"{len(good)}/{len(scored)} key rooms match preferred zones. "
        "Score is computed from each room's center position relative to plot thirds."
        if scored
        else "No scorable rooms found for Vastu compliance."
    )

    return {"overall": overall, "grade": grade, "summary": summary}


def optimize_layout(bhk_type, plot_w_ft, plot_d_ft,
                    style="modern", 
                    user_preferences=None):
  
  toilet_pref = "auto"
  include_pooja = True
  include_dining = True
  
  if user_preferences:
    if "common toilet" in user_preferences.lower():
      toilet_pref = "common"
    if "attached toilet" in user_preferences.lower():
      toilet_pref = "all_attached"
    if "no pooja" in user_preferences.lower():
      include_pooja = False
    if "no dining" in user_preferences.lower():
      include_dining = False
  
  result = generate_layout(
    bhk_type=bhk_type,
    plot_w_ft=plot_w_ft,
    plot_d_ft=plot_d_ft,
    style=style,
    toilet_pref=toilet_pref,
    include_pooja=include_pooja,
    include_dining=include_dining
  )
  
  if "error" in result:
    # Fallback to old template engine
    from templates import get_plan
    return get_plan(bhk_type, plot_w_ft, 
                    plot_d_ft, style)
  
  # Add pixel coordinates for frontend
  ppm = 20
  for r in result["rooms"]:
    r["x_px"] = round(r["x"] * ppm)
    r["y_px"] = round(r["y"] * ppm)
    r["w_px"] = round(r["w"] * ppm)
    r["h_px"] = round(r["h"] * ppm)
  
  return result

