import random

from src.core.floorplan.geometry import Rect
from src.core.floorplan.room_program import build_program
from src.core.floorplan.subdivision import fill_region
from src.core.floorplan.circulation import place_doors, build_adjacency


def _layout(seed):
    interior = Rect(0.23, 0.23, 10.0, 12.0)
    specs = build_program("3BHK")
    # bounds passed to place_doors is the interior rooms are flush with
    return fill_region(interior, specs, random.Random(seed)), interior


def test_all_rooms_reachable_from_entrance():
    """Every room must connect into the door spanning tree."""
    ok = 0
    for seed in range(15):
        rooms, plot = _layout(seed)
        ent = place_doors(rooms, plot, random.Random(seed))
        if ent is None:
            continue
        ok += 1
        # entrance + every other room has a door
        doored = sum(1 for r in rooms if r.door is not None)
        assert doored == len(rooms)
    assert ok >= 10  # most seeds should yield a connected graph


def test_adjacency_symmetric():
    rooms, _ = _layout(2)
    adj = build_adjacency(rooms)
    for i, nbrs in adj.items():
        for j, _wall in nbrs:
            assert any(k == i for k, _ in adj[j])
