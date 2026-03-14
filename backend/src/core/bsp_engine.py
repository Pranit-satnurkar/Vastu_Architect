import random
import time
from typing import List, Optional, Dict, Any

from src.data.templates import get_plan

WALL = 0.23  # wall thickness in meters
FT = 0.3048  # feet to meters
PPM = 20     # pixels per meter for frontend canvas


def generate_bsp_layout(
    bhk_type: str,
    plot_w_ft: float,
    plot_d_ft: float,
    style: str = "modern",
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Vastu-aware column-based room placement.

    Three fixed columns:
      Col A (West   34-42%): Bedrooms + Toilets
      Col B (Center 13-18%): Corridor + Pooja
      Col C (East  remainder): Living + Dining + Kitchen

    Only row heights are randomized, column assignment is fixed.
    """
    if seed is None:
        seed = int(time.time() * 1000) % 999_999
    random.seed(seed)

    plot_w = round(plot_w_ft * FT, 2)
    plot_d = round(plot_d_ft * FT, 2)

    iw = round(plot_w - 2 * WALL, 2)  # interior width
    id_ = round(plot_d - 2 * WALL, 2)  # interior depth

    rooms = []
    validation_attempts = 0

    while validation_attempts < 4:
        rooms = []
        try:
            # ═══ PHASE 1: FIXED COLUMN BOUNDARIES ═══
            layout_mode = random.choices(
                ["west_heavy", "balanced", "east_heavy"],
                weights=[33, 34, 33]
            )[0]

            if layout_mode == "west_heavy":
                col_a_pct = random.uniform(0.44, 0.52)
                col_b_pct = random.uniform(0.10, 0.14)
            elif layout_mode == "balanced":
                col_a_pct = random.uniform(0.36, 0.44)
                col_b_pct = random.uniform(0.13, 0.17)
            elif layout_mode == "east_heavy":
                col_a_pct = random.uniform(0.28, 0.36)
                col_b_pct = random.uniform(0.11, 0.15)

            col_c_pct = 1.0 - col_a_pct - col_b_pct

            living_pct = random.uniform(0.40, 0.60)
            flip = random.random() < 0.30

            layout_variant = layout_mode + "_" + ("flipped" if flip else "standard")

            col_a_w = round(iw * col_a_pct, 2)
            col_b_w = round(iw * col_b_pct, 2)
            col_c_w = round(iw - col_a_w - col_b_w, 2)

            x_a = WALL
            x_b = round(WALL + col_a_w, 2)
            x_c = round(WALL + col_a_w + col_b_w, 2)

            if flip:
                x_bedroom_col = x_c
                x_living_col  = x_a
                bedroom_col_w = col_c_w
                living_col_w  = col_a_w
                bedroom_window_wall = "E"
                living_window_wall  = "W"
                bedroom_door_wall   = "W"
                living_door_wall    = "N"
            else:
                x_bedroom_col = x_a
                x_living_col  = x_c
                bedroom_col_w = col_a_w
                living_col_w  = col_c_w
                bedroom_window_wall = "W"
                living_window_wall  = "N"
                bedroom_door_wall   = "E"
                living_door_wall    = "N"

            # ═══ PHASE 2: COL B — CORRIDOR + POOJA ═══
            if bhk_type in ["1BHK", "2BHK"]:
                _corridor_placeholder = True
            else:  # 3BHK, 4BHK
                # Normal pooja at top (NE zone), corridor below
                pooja_h = round(random.uniform(1.4, 1.8), 2)
                rooms.append({
                    "name": "Pooja",
                    "x": x_b,
                    "y": WALL,
                    "w": col_b_w,
                    "h": pooja_h,
                    "door": {"wall": "S", "pos": 0.5, "width": 0.75},
                    "window": None,
                })
                rooms.append({
                    "name": "Corridor",
                    "x": x_b,
                    "y": round(WALL + pooja_h, 2),
                    "w": col_b_w,
                    "h": round(id_ - pooja_h, 2),
                    "door": None,
                    "window": None,
                })

            # ═══ PHASE 3: COL A — BEDROOMS + TOILETS (North to South) ═══
            # Fix 4: Realistic Indian toilet height 1.4–1.8m (4'7"–5'11")
            toilet_h = round(random.uniform(1.4, 1.8), 2)
            remaining = round(id_ - toilet_h, 2)

            # Fix 3: Insert corridor for 1BHK/2BHK now that toilet_h is known
            # Corridor starts BELOW toilet row (realistic dimensions)
            if bhk_type in ["1BHK", "2BHK"]:
                rooms.append({
                    "name": "Corridor",
                    "x": x_b,
                    "y": round(WALL + toilet_h, 2),
                    "w": col_b_w,
                    "h": round(id_ - toilet_h, 2),
                    "door": None,
                    "window": None,
                })

            if bhk_type in ["3BHK", "4BHK"]:
                toilet_w = round(bedroom_col_w / 2, 2)
                toilet_w = min(toilet_w, 1.8)
                toilet_w_2 = round(bedroom_col_w - toilet_w, 2)
            else:
                toilet_w = round(bedroom_col_w / 2, 2)
                toilet_w = min(toilet_w, 1.8)
                toilet_w_2 = round(bedroom_col_w - toilet_w, 2)

            # Toilet 1 — uses bedroom column x
            rooms.append({
                "name": "Toilet 1",
                "x": x_bedroom_col,
                "y": WALL,
                "w": toilet_w,
                "h": toilet_h,
                "door": {"wall": "S", "pos": 0.5, "width": 0.75},
                "window": None,
            })

            # Toilet 2 (if 2BHK+)
            if bhk_type in ["2BHK", "3BHK", "4BHK"]:
                t2_x = round(x_bedroom_col + toilet_w, 2)
                
                rooms.append({
                    "name": "Toilet 2",
                    "x": t2_x,
                    "y": WALL,
                    "w": toilet_w_2,
                    "h": toilet_h,
                    "door": {"wall": "S", "pos": 0.5, "width": 0.75},
                    "window": None,
                })

            # Bedrooms stacked South of toilets
            y_beds = round(WALL + toilet_h, 2)

            if bhk_type == "1BHK":
                bed_h = round(remaining, 2)
                rooms.append({
                    "name": "Bedroom",
                    "x": x_bedroom_col,
                    "y": y_beds,
                    "w": bedroom_col_w,
                    "h": bed_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })

            elif bhk_type == "2BHK":
                b2_style = random.choice(["equal", "master_large"])
                
                if b2_style == "equal":
                    bed_h = max(3.5, round(remaining * 0.45, 2))
                    master_h = max(4.0, round(remaining - bed_h, 2))

                elif b2_style == "master_large":
                    master_h = max(4.5, round(remaining * 0.58, 2))
                    bed_h = max(3.5, round(remaining - master_h, 2))
                
                # Enforce sum constraint safety
                if round(bed_h + master_h, 2) != remaining:
                    master_h = round(remaining - bed_h, 2)

                rooms.append({
                    "name": "Bedroom",
                    "x": x_bedroom_col,
                    "y": y_beds,
                    "w": bedroom_col_w,
                    "h": bed_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                rooms.append({
                    "name": "Master Bedroom",
                    "x": x_bedroom_col,
                    "y": round(y_beds + bed_h, 2),
                    "w": bedroom_col_w,
                    "h": master_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })

            elif bhk_type == "3BHK":
                b3_style = random.choice(["equal", "master_large", "varied"])

                if b3_style == "equal":
                    each = round(remaining / 3, 2)
                    bed2_h = max(3.2, each)
                    bed1_h = max(3.2, each)
                    master_h = max(4.0, round(remaining - bed2_h - bed1_h, 2))

                elif b3_style == "master_large":
                    master_h = max(4.5, round(remaining * 0.42, 2))
                    bed2_h = max(3.2, round(remaining * 0.30, 2))
                    bed1_h = max(3.2, round(remaining - master_h - bed2_h, 2))

                elif b3_style == "varied":
                    bed2_h = max(3.2, round(remaining * 0.28, 2))
                    bed1_h = max(3.5, round(remaining * 0.32, 2))
                    master_h = max(4.0, round(remaining - bed2_h - bed1_h, 2))

                # Ensure exact sum safety check
                if round(bed2_h + bed1_h + master_h, 2) != remaining:
                    master_h = round(remaining - bed2_h - bed1_h, 2)

                rooms.append({
                    "name": "Bedroom 2",
                    "x": x_bedroom_col,
                    "y": y_beds,
                    "w": bedroom_col_w,
                    "h": bed2_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                rooms.append({
                    "name": "Bedroom 1",
                    "x": x_bedroom_col,
                    "y": round(y_beds + bed2_h, 2),
                    "w": bedroom_col_w,
                    "h": bed1_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                rooms.append({
                    "name": "Master Bedroom",
                    "x": x_bedroom_col,
                    "y": round(y_beds + bed2_h + bed1_h, 2),
                    "w": bedroom_col_w,
                    "h": master_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })

            elif bhk_type == "4BHK":
                each = round(remaining / 4, 2)
                bed3_h = max(3.2, round(each * random.uniform(0.85, 1.15), 2))
                bed2_h = max(3.2, round(each * random.uniform(0.85, 1.15), 2))
                bed1_h = max(3.2, round(each * random.uniform(0.85, 1.15), 2))
                master_h = round(remaining - bed3_h - bed2_h - bed1_h, 2)
                if master_h < 4.0:
                    excess = 4.0 - master_h
                    bed1_h = max(3.2, round(bed1_h - excess, 2))
                    master_h = round(remaining - bed3_h - bed2_h - bed1_h, 2)
                    master_h = max(4.0, master_h)

                y_offset = y_beds
                rooms.append({
                    "name": "Bedroom 3",
                    "x": x_bedroom_col,
                    "y": y_offset,
                    "w": bedroom_col_w,
                    "h": bed3_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                y_offset = round(y_offset + bed3_h, 2)
                rooms.append({
                    "name": "Bedroom 2",
                    "x": x_bedroom_col,
                    "y": y_offset,
                    "w": bedroom_col_w,
                    "h": bed2_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                y_offset = round(y_offset + bed2_h, 2)
                rooms.append({
                    "name": "Bedroom 1",
                    "x": x_bedroom_col,
                    "y": y_offset,
                    "w": bedroom_col_w,
                    "h": bed1_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })
                y_offset = round(y_offset + bed1_h, 2)
                rooms.append({
                    "name": "Master Bedroom",
                    "x": x_bedroom_col,
                    "y": y_offset,
                    "w": bedroom_col_w,
                    "h": master_h,
                    "door": {"wall": bedroom_door_wall, "pos": 0.5, "width": 0.9},
                    "window": {"wall": bedroom_window_wall, "pos": 0.4, "width": 1.2},
                })

            # ═══ PHASE 4: COL C — LIVING + DINING + KITCHEN ═══
            living_h = round(id_ * living_pct, 2)
            living_h = max(4.5, min(living_h, id_ * 0.65))

            if bhk_type == "1BHK":
                kitchen_h = round(id_ - living_h, 2)

                rooms.append({
                    "name": "Living Room",
                    "x": x_living_col,
                    "y": WALL,
                    "w": living_col_w,
                    "h": living_h,
                    "door": {"wall": living_door_wall, "pos": 0.65, "width": 1.2},
                    "window": {"wall": living_window_wall, "pos": 0.3, "width": 1.5},
                })
                rooms.append({
                    "name": "Kitchen",
                    "x": x_living_col,
                    "y": round(WALL + living_h, 2),
                    "w": living_col_w,
                    "h": kitchen_h,
                    "door": {"wall": "W", "pos": 0.4, "width": 0.9},
                    "window": {"wall": "E", "pos": 0.4, "width": 0.9},
                })

            else:  # 2BHK, 3BHK, 4BHK
                service_h = round(id_ - living_h, 2)
                dining_pct = random.uniform(0.40, 0.55)
                dining_h = round(service_h * dining_pct, 2)
                dining_h = max(2.8, min(dining_h, 4.5))
                kitchen_h = round(service_h - dining_h, 2)
                kitchen_h = max(3.0, min(kitchen_h, 5.5))

                if dining_h + kitchen_h != service_h:
                    kitchen_h = round(service_h - dining_h, 2)

                rooms.append({
                    "name": "Living Room",
                    "x": x_living_col,
                    "y": WALL,
                    "w": living_col_w,
                    "h": living_h,
                    "door": {"wall": living_door_wall, "pos": 0.65, "width": 1.2},
                    "window": {"wall": living_window_wall, "pos": 0.3, "width": 1.5},
                })
                rooms.append({
                    "name": "Dining",
                    "x": x_living_col,
                    "y": round(WALL + living_h, 2),
                    "w": living_col_w,
                    "h": dining_h,
                    "door": None,
                    "window": None,
                })
                rooms.append({
                    "name": "Kitchen",
                    "x": x_living_col,
                    "y": round(WALL + living_h + dining_h, 2),
                    "w": living_col_w,
                    "h": kitchen_h,
                    "door": {"wall": "W", "pos": 0.4, "width": 0.9},
                    "window": {"wall": "E", "pos": 0.4, "width": 0.9},
                })

            # ═══ PHASE 5: ADD CANVAS DIMENSIONS ═══
            for room in rooms:
                room["x_px"] = round(room["x"] * PPM)
                room["y_px"] = round(room["y"] * PPM)
                room["w_px"] = round(room["w"] * PPM)
                room["h_px"] = round(room["h"] * PPM)

            # ═══ PHASE 5B: ADJUST DOOR WIDTHS BASED ON ROOM SIZE ═══
            for room in rooms:
                if room.get("door") is None:
                    continue

                door = room["door"]
                room_name = room["name"]
                room_w = room["w"]

                # Determine ideal door width based on room type
                if "Master" in room_name:
                    ideal_width = 0.9
                elif "Bedroom" in room_name:
                    # Master bedroom standard, smaller bedrooms can use narrower doors
                    ideal_width = 0.9 if room_w >= 3.5 else 0.8
                elif "Kitchen" in room_name:
                    ideal_width = 0.9
                elif "Toilet" in room_name:
                    # Smaller doors for toilets based on width
                    ideal_width = 0.75 if room_w >= 1.8 else 0.65
                elif "Pooja" in room_name:
                    ideal_width = 0.75
                elif "Living" in room_name:
                    ideal_width = 1.2
                else:
                    ideal_width = door.get("width", 0.9)

                # Constrain to max 60% of wall width (depending on wall orientation)
                wall = door["wall"]
                if wall in ["N", "S"]:
                    max_width = 0.6 * room_w
                else:  # E, W walls
                    max_width = 0.6 * room["h"]

                final_width = min(ideal_width, max_width)
                door["width"] = round(final_width, 2)

            # ═══ PHASE 6: VALIDATION ═══
            if not _validate_layout(rooms, plot_w, plot_d, id_):
                validation_attempts += 1
                continue

            # Success
            break

        except Exception as e:
            validation_attempts += 1
            if validation_attempts >= 4:
                # Fall back to template
                return get_plan(bhk_type, plot_w_ft, plot_d_ft, style)
            continue

    if validation_attempts >= 4:
        # Failed too many times
        return get_plan(bhk_type, plot_w_ft, plot_d_ft, style)

    return {
        "plot_w_m": plot_w,
        "plot_d_m": plot_d,
        "plot_w_ft": plot_w_ft,
        "plot_d_ft": plot_d_ft,
        "bhk_type": bhk_type,
        "style": style,
        "rooms": rooms,
        "room_count": len(rooms),
        "engine": "BSP-VASTU",
        "seed_used": seed,
        "seed": seed,
        "layout_variant": layout_variant,
        "archetype": layout_variant,
        "template_used": None,
        "compliance": {
            "overall": 0,
            "grade": "-",
            "summary": "Vastu scoring coming next",
        },
    }


def _validate_layout(rooms: List[Dict[str, Any]], plot_w: float, plot_d: float, id_: float) -> bool:
    """
    Validate room dimensions and placement.
    Returns True if valid, False otherwise.
    """
    # 1. No room width < 0.8m
    for room in rooms:
        if room["w"] < 0.8:
            return False
        # 2. No room height < 1.2m
        if room["h"] < 1.2:
            return False
        # 3. Toilet size constraint: w<=2.2, h<=2.2 (realistic Indian standard + layout leeway)
        if "Toilet" in room["name"]:
            if room["w"] > 2.2 or room["h"] > 2.2:
                return False
        # 4. Room boundaries
        if room["x"] + room["w"] > plot_w + 0.01:
            return False
        if room["y"] + room["h"] > plot_d + 0.01:
            return False

    # Validate column sums
    col_a_rooms = [r for r in rooms if "Toilet" in r["name"]
                   or "Bedroom" in r["name"]]
    col_b_rooms = [r for r in rooms if r["name"] in ["Corridor", "Pooja"]]
    col_c_rooms = [r for r in rooms if r["name"]
                   in ["Living Room", "Dining", "Kitchen"]]

    # All rooms in a column should have heights summing to interior depth
    if col_a_rooms:
        # Don't double count side-by-side toilets (Toilet 2 is next to Toilet 1)
        col_a_sum_rooms = [r for r in col_a_rooms if r["name"] != "Toilet 2"]
        col_a_h = sum(r["h"] for r in col_a_sum_rooms)
        if abs(col_a_h - id_) > 0.1:  # Allow 10cm tolerance for float drift
            return False

    if col_c_rooms:
        col_c_h = sum(r["h"] for r in col_c_rooms)
        if abs(col_c_h - id_) > 0.1:
            return False

    return True
