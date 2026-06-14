"""
layout_engine.py — Template-based fallback engine.

Selects a template matched to the user's plot aspect ratio, then
proportionally scales all room coordinates to fit the requested plot.
Used as fallback when BSP engine fails.
"""

import random
from copy import deepcopy
from typing import Dict, List, Optional, Tuple

from src.data.templates import PLANS, _ROOM_LIMITS, _rtype

FT = 0.3048
WALL = 0.23

# Per-BHK round-robin counters so repeated calls cycle through variants instead
# of returning the same plan (the previous time-based seed barely changed across
# rapid calls, which produced "the same plan over and over").
_counters: Dict[str, int] = {}


def _select_template(bhk_type: str, target_ratio: float) -> Tuple[str, Dict]:
    """
    Pick a template matched to the plot's aspect ratio. Among the closest
    matches we round-robin per BHK so consecutive calls return different plans.
    """
    bhk_key = bhk_type.upper().replace(" ", "")
    candidates = [(k, v) for k, v in PLANS.items() if k.startswith(bhk_key)]
    if not candidates:
        candidates = list(PLANS.items())

    def ratio_diff(plan):
        return abs(plan["plot_w"] / plan["plot_d"] - target_ratio)

    candidates.sort(key=lambda kv: ratio_diff(kv[1]))

    # Cycle through the closest matches for guaranteed variety.
    top_n = min(3, len(candidates))
    _counters[bhk_key] = _counters.get(bhk_key, 0) + 1
    idx = (_counters[bhk_key] - 1) % top_n
    return candidates[idx]


def _scale_rooms(rooms: List[Dict], src_w: float, src_d: float,
                 dst_w: float, dst_d: float) -> List[Dict]:
    """
    Proportionally scale rooms from source template dimensions to target plot.
    Interior space is scaled; wall offsets are preserved.
    """
    src_iw = src_w - 2 * WALL
    src_id = src_d - 2 * WALL
    dst_iw = dst_w - 2 * WALL
    dst_id = dst_d - 2 * WALL

    sx = dst_iw / src_iw if src_iw > 0 else 1.0
    sy = dst_id / src_id if src_id > 0 else 1.0

    scaled = []
    for room in rooms:
        rt = _rtype(room["name"])
        lim = _ROOM_LIMITS.get(rt, _ROOM_LIMITS["default"])
        min_w, max_w, min_h, max_h = lim

        # Scale position relative to interior origin, then restore wall offset
        new_x = round(WALL + (room["x"] - WALL) * sx, 2)
        new_y = round(WALL + (room["y"] - WALL) * sy, 2)
        new_w = round(max(min_w, min(max_w, room["w"] * sx)), 2)
        new_h = round(max(min_h, min(max_h, room["h"] * sy)), 2)

        r = deepcopy(room)
        r["x"] = new_x
        r["y"] = new_y
        r["w"] = new_w
        r["h"] = new_h
        scaled.append(r)

    return scaled


def generate_layout(bhk_type: str,
                    plot_w_ft: float,
                    plot_d_ft: float,
                    style: str = "modern",
                    **_) -> Dict:
    """
    Scale a matched template to the user's actual plot dimensions.
    Template is chosen by aspect-ratio similarity and round-robined for variety.
    """
    plot_w = round(plot_w_ft * FT, 2)
    plot_d = round(plot_d_ft * FT, 2)
    target_ratio = plot_w / max(plot_d, 0.01)

    plan_key, plan = _select_template(bhk_type, target_ratio)
    scaled_rooms = _scale_rooms(
        deepcopy(plan["rooms"]),
        plan["plot_w"], plan["plot_d"],
        plot_w, plot_d,
    )

    return {
        "plot_w_m":      plot_w,
        "plot_d_m":      plot_d,
        "plot_w_ft":     round(plot_w_ft, 1),
        "plot_d_ft":     round(plot_d_ft, 1),
        "bhk_type":      bhk_type,
        "style":         style,
        "engine":        "SCALED-TEMPLATE",
        "template_used": plan_key,
        "room_count":    len(scaled_rooms),
        "rooms":         scaled_rooms,
        "seed":          _counters.get(bhk_type.upper().replace(" ", ""), 0),
    }
