from src.core.floorplan.room_program import (
    build_program, common_bath_count, PUBLIC, PRIVATE, SERVICE,
)


def names(bhk):
    return [s.name for s in build_program(bhk)]


def test_bedroom_counts():
    assert sum("Bedroom" in n or "Master" in n for n in names("1BHK")) == 1
    assert sum("Bedroom" in n or "Master" in n for n in names("2BHK")) == 2
    assert sum("Bedroom" in n or "Master" in n for n in names("3BHK")) == 3
    assert sum("Bedroom" in n or "Master" in n for n in names("4BHK")) == 4


def test_master_has_ensuite():
    for bhk in ["2BHK", "3BHK", "4BHK"]:
        master = [s for s in build_program(bhk) if s.name == "Master Bedroom"][0]
        assert master.bath_name == "Ensuite"


def test_every_program_has_living_and_kitchen():
    for bhk in ["1BHK", "2BHK", "3BHK", "4BHK"]:
        n = names(bhk)
        assert "Living Room" in n
        assert "Kitchen" in n


def test_zones_assigned():
    specs = build_program("3BHK")
    zones = {s.name: s.zone for s in specs}
    assert zones["Living Room"] == PUBLIC
    assert zones["Kitchen"] == SERVICE
    assert zones["Master Bedroom"] == PRIVATE


def test_common_bath_counts():
    # Common baths are carved by the generator, not listed as program specs.
    assert common_bath_count("1BHK") == 0
    assert common_bath_count("2BHK") == 1
    assert common_bath_count("3BHK") == 1
    assert common_bath_count("4BHK") == 2
