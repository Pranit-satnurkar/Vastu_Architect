"""
layout_engine.py — Demo mode
Returns hardcoded real-plan vector data from templates.py directly.
No procedural generation, no scaling.
"""

import importlib.util
import os
from copy import deepcopy
from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Plan library — loaded once from templates.py
# ---------------------------------------------------------------------------

_PLANS: Optional[Dict] = None

# Per-BHK call counters so each request cycles to the next variant
_counters: Dict[str, int] = {}


def _load_plans() -> Dict:
    global _PLANS
    if _PLANS is not None:
        return _PLANS

    tpl_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "templates.py",
    )
    spec = importlib.util.spec_from_file_location("_vastu_tpl", tpl_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    _PLANS = getattr(mod, "PLANS", {})
    print(f"[ENGINE] Loaded {len(_PLANS)} demo plans")
    return _PLANS


def _select_plan(bhk_type: str) -> Tuple[str, Dict]:
    global _counters
    plans = _load_plans()

    bhk_key = bhk_type.upper().replace(" ", "")
    candidates = [(k, v) for k, v in plans.items() if k.startswith(bhk_key)]
    if not candidates:
        candidates = list(plans.items())

    _counters[bhk_key] = _counters.get(bhk_key, 0) + 1
    idx = (_counters[bhk_key] - 1) % len(candidates)
    return candidates[idx]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_layout(bhk_type: str,
                    plot_w_ft: float,
                    plot_d_ft: float,
                    style: str = "modern",
                    **_) -> Dict:
    """
    Demo mode: return a real measured floor plan from templates.py verbatim.
    Cycles through all variants for the requested BHK type on repeated calls.
    """
    FT = 0.3048
    plan_key, plan = _select_plan(bhk_type)
    rooms = deepcopy(plan["rooms"])

    return {
        "plot_w_m":      plan["plot_w"],
        "plot_d_m":      plan["plot_d"],
        "plot_w_ft":     round(plan["plot_w"] / FT, 1),
        "plot_d_ft":     round(plan["plot_d"] / FT, 1),
        "bhk_type":      bhk_type,
        "style":         style,
        "engine":        "DEMO-VECTOR",
        "template_used": plan_key,
        "room_count":    len(rooms),
        "rooms":         rooms,
    }
