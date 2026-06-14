import random

from src.core.floorplan.geometry import Rect, no_overlaps, contains
from src.core.floorplan.room_program import build_program
from src.core.floorplan.subdivision import fill_region


def _region():
    return Rect(0.23, 0.23, 9.0, 12.0)


def test_one_rect_per_spec():
    specs = build_program("3BHK")
    rng = random.Random(1)
    rects = fill_region(_region(), specs, rng)
    assert len(rects) == len(specs)


def test_fill_covers_region_no_overlap():
    region = _region()
    for seed in range(20):
        specs = build_program("3BHK")
        rects = fill_region(region, specs, random.Random(seed))
        assert no_overlaps(rects), f"overlap at seed {seed}"
        for r in rects:
            assert contains(region, r, eps=0.05), f"escape at seed {seed}: {r}"
        covered = sum(r.area for r in rects)
        assert abs(covered - region.area) < 0.05 * region.area


def test_areas_track_weights():
    region = _region()
    specs = build_program("3BHK")
    rects = fill_region(region, specs, random.Random(3))
    by_name = {r.name: r for r in rects}
    # Living (weight 1.0) should be larger than Store (weight 0.35).
    assert by_name["Living Room"].area > by_name["Store"].area


def test_single_spec():
    specs = build_program("3BHK")[:1]
    rects = fill_region(_region(), specs, random.Random(0))
    assert len(rects) == 1
    assert abs(rects[0].area - _region().area) < 1e-6
