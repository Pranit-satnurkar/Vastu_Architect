import random

from src.core.floorplan.footprint import choose_footprint
from src.core.floorplan.geometry import Rect, overlaps, contains


def _interior():
    return Rect(0.23, 0.23, 12.0, 15.0)


def test_cells_and_gardens_tile_interior():
    """cells + gardens must exactly cover the interior with no overlaps."""
    interior = _interior()
    for seed in range(60):
        cells, gardens, name = choose_footprint(interior, random.Random(seed))
        parts = cells + gardens
        # all within interior
        for p in parts:
            assert contains(interior, p, eps=0.05), f"{name} escapes at {seed}"
        # pairwise non-overlapping
        for a in range(len(parts)):
            for b in range(a + 1, len(parts)):
                assert not overlaps(parts[a], parts[b]), f"{name} overlap at {seed}"
        # area conservation
        covered = sum(p.area for p in parts)
        assert abs(covered - interior.area) < 0.02 * interior.area, name


def test_full_has_no_garden():
    interior = _interior()
    # full appears among outcomes and has a single cell, no garden
    saw_full = False
    for seed in range(60):
        cells, gardens, name = choose_footprint(interior, random.Random(seed))
        if name == "full":
            saw_full = True
            assert len(cells) == 1 and not gardens
    assert saw_full


def test_shapes_appear():
    interior = _interior()
    names = {choose_footprint(interior, random.Random(s))[2] for s in range(80)}
    # at least one non-rectangular shape should show up
    assert names & {"L", "U", "T"}
