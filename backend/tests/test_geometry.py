from src.core.floorplan.geometry import (
    Rect, overlaps, contains, shared_wall, on_exterior, no_overlaps,
)


def test_overlap_true_and_false():
    a = Rect(0, 0, 4, 4)
    b = Rect(2, 2, 4, 4)
    c = Rect(4, 0, 4, 4)  # touches a on the edge only
    assert overlaps(a, b)
    assert not overlaps(a, c)


def test_contains():
    outer = Rect(0, 0, 10, 10)
    inner = Rect(1, 1, 3, 3)
    outside = Rect(8, 8, 4, 4)
    assert contains(outer, inner)
    assert not contains(outer, outside)


def test_shared_wall_vertical():
    a = Rect(0, 0, 4, 4)
    b = Rect(4, 1, 3, 2)  # to the east of a, overlapping y in [1,3]
    res = shared_wall(a, b)
    assert res is not None
    wall, span = res
    assert wall == "E"
    assert abs(span - 2) < 1e-6


def test_shared_wall_horizontal_and_none():
    a = Rect(0, 0, 4, 4)
    below = Rect(0, 4, 4, 2)
    apart = Rect(10, 10, 2, 2)
    assert shared_wall(a, below)[0] == "S"
    assert shared_wall(a, apart) is None


def test_on_exterior():
    plot = Rect(0, 0, 10, 10)
    nw_room = Rect(0, 0, 3, 3)
    interior = Rect(4, 4, 2, 2)
    assert set(on_exterior(nw_room, plot)) == {"N", "W"}
    assert on_exterior(interior, plot) == []


def test_no_overlaps():
    rooms = [Rect(0, 0, 5, 10), Rect(5, 0, 5, 10)]
    assert no_overlaps(rooms)
    rooms.append(Rect(3, 3, 4, 4))
    assert not no_overlaps(rooms)
