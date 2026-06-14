import random

from src.core.floorplan.generator import generate
from src.core.floorplan.geometry import Rect, no_overlaps, shared_wall

BHKS = ["1BHK", "2BHK", "3BHK", "4BHK"]
PLOTS = [(30, 50), (40, 60), (25, 40), (50, 80), (20, 35)]


def _rects(result):
    return [Rect(r["x"], r["y"], r["w"], r["h"], r["name"]) for r in result["rooms"]]


def test_schema_complete():
    res = generate("3BHK", 30, 50, "modern", seed=1)
    for r in res["rooms"]:
        for k in ("name", "x", "y", "w", "h", "x_px", "y_px", "w_px", "h_px",
                  "door", "window"):
            assert k in r, f"missing {k}"
    assert res["engine"] in ("ARCH-v1", "SCALED-TEMPLATE", "DEMO-VECTOR")
    assert res["room_count"] == len(res["rooms"])


def test_no_overlaps_in_bounds_across_inputs():
    for bhk in BHKS:
        for (w, d) in PLOTS:
            res = generate(bhk, w, d, "modern", seed=7)
            rects = _rects(res)
            if res["engine"] != "ARCH-v1":
                continue  # fallback path validated by its own engine
            assert no_overlaps(rects), f"overlap {bhk} {w}x{d}"
            plot = Rect(0, 0, res["plot_w_m"], res["plot_d_m"])
            for r in rects:
                assert r.x >= -0.05 and r.y >= -0.05
                assert r.x2 <= plot.x2 + 0.06 and r.y2 <= plot.y2 + 0.06


def test_variety():
    """Same inputs should yield mostly distinct layouts (not Vastu-locked)."""
    sigs = set()
    for _ in range(8):
        res = generate("3BHK", 30, 50, "modern")  # random seed each call
        sig = tuple(sorted((r["name"], r["x"], r["y"], r["w"], r["h"])
                           for r in res["rooms"]))
        sigs.add(sig)
    assert len(sigs) >= 6, f"only {len(sigs)} distinct layouts in 8 calls"


def test_master_has_ensuite_when_arch():
    for seed in range(10):
        res = generate("3BHK", 35, 55, "modern", seed=seed)
        if res["engine"] != "ARCH-v1":
            continue
        names = [r["name"] for r in res["rooms"]]
        assert "Ensuite" in names, f"no ensuite at seed {seed}"


def test_kitchen_adjacent_to_dining_when_arch():
    for seed in range(12):
        res = generate("3BHK", 35, 55, "modern", seed=seed)
        if res["engine"] != "ARCH-v1":
            continue
        rects = {r["name"]: Rect(r["x"], r["y"], r["w"], r["h"]) for r in res["rooms"]}
        if "Kitchen" in rects and "Dining" in rects:
            assert shared_wall(rects["Kitchen"], rects["Dining"]) is not None


def test_never_raises_and_always_returns_rooms():
    for bhk in BHKS:
        for (w, d) in PLOTS + [(12, 18), (60, 90)]:
            res = generate(bhk, w, d, "modern", seed=3)
            assert res["rooms"], f"empty plan {bhk} {w}x{d}"
