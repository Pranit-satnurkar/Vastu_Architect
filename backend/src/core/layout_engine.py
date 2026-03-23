import json
import os
import random
import time
from typing import Optional

# ---------------------------------------------------------------------------
# Template database — lazy-loaded once
# ---------------------------------------------------------------------------

_TEMPLATE_DB = None


def load_template_database() -> dict:
    global _TEMPLATE_DB
    if _TEMPLATE_DB is not None:
        return _TEMPLATE_DB

    db_path = os.path.join(
        os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))),
        "data", "template_database.json"
    )

    if os.path.exists(db_path):
        with open(db_path, "r") as f:
            _TEMPLATE_DB = json.load(f)
        print(f"[INFO] Loaded {len(_TEMPLATE_DB)}"
              f" templates from database")
    else:
        print(f"[WARN] Template database not found"
              f" at {db_path}")
        _TEMPLATE_DB = {}

    return _TEMPLATE_DB


def find_similar_templates(
    bhk_type: str,
    plot_w_ft: float,
    plot_d_ft: float,
    n: int = 3
) -> list:
    db = load_template_database()
    if not db:
        return []

    plot_area = plot_w_ft * plot_d_ft
    aspect = plot_w_ft / max(plot_d_ft, 1)
    scores = []

    for name, meta in db.items():
        # Skip if missing required fields
        if not meta.get("bhk_type"):
            continue
        if not meta.get("plot_area_sqft"):
            continue
        if meta.get("bhk_type") != bhk_type:
            continue

        meta_area = float(meta.get("plot_area_sqft", 0))
        if meta_area <= 0:
            continue

        # Area similarity (60% weight)
        area_diff = abs(meta_area - plot_area) / \
                    max(plot_area, 1)

        # Aspect ratio similarity (40% weight)
        meta_aspect = meta.get("plot_w_ft", 30) / \
                      max(meta.get("plot_d_ft", 50), 1)
        aspect_diff = abs(meta_aspect - aspect)

        score = area_diff * 0.60 + aspect_diff * 0.40
        scores.append((name, meta, score))

    # Sort by similarity score (lower = more similar)
    scores.sort(key=lambda x: x[2])
    return scores[:n]


def blend_proportions(
    similar: list,
    random_variance: float = 0.04
) -> Optional[dict]:
    if not similar:
        return None

    total_weight = 0
    bed_sum = 0
    north_sum = 0
    master_sum = 0
    pattern_votes: dict = {}
    dining_votes: dict = {}
    pooja_votes = []

    for name, meta, score in similar:
        # Closer match = higher weight
        weight = 1.0 / (score + 0.05)
        total_weight += weight

        bed_sum += meta.get(
            "bed_col_pct", 0.45) * weight
        north_sum += meta.get(
            "north_h_pct", 0.45) * weight
        master_sum += meta.get(
            "master_h_pct", 0.35) * weight

        # Pattern voting
        p = meta.get("pattern", "LR_front")
        pattern_votes[p] = pattern_votes.get(
            p, 0) + weight

        # Dining voting
        d = meta.get("dining_mode", "merged")
        dining_votes[d] = dining_votes.get(
            d, 0) + weight

        pooja_votes.append(
            meta.get("has_pooja", False))

    if total_weight == 0:
        return None

    # Weighted averages
    bed_col_pct = bed_sum / total_weight
    north_h_pct = north_sum / total_weight
    master_h_pct = master_sum / total_weight

    # Add random variance for variety
    bed_col_pct += random.uniform(
        -random_variance, random_variance)
    north_h_pct += random.uniform(
        -random_variance, random_variance)
    master_h_pct += random.uniform(
        -random_variance, random_variance)

    # Clamp to valid ranges
    bed_col_pct = max(0.32, min(0.58, bed_col_pct))
    north_h_pct = max(0.28, min(0.58, north_h_pct))
    master_h_pct = max(0.22, min(0.48, master_h_pct))

    # Pick most voted pattern
    pattern = max(pattern_votes,
                  key=pattern_votes.get)

    # Pick most voted dining mode
    dining_mode = max(dining_votes,
                      key=dining_votes.get)

    # Majority vote for pooja
    has_pooja = sum(pooja_votes) > len(pooja_votes) / 2

    return {
        "bed_col_pct": round(bed_col_pct, 3),
        "north_h_pct": round(north_h_pct, 3),
        "master_h_pct": round(master_h_pct, 3),
        "pattern": pattern,
        "dining_mode": dining_mode,
        "has_pooja": has_pooja,
        "source": "template_blend",
        "templates_used": [s[0] for s in similar]
    }


# ---------------------------------------------------------------------------

ROOM_SIZES = {
    "Master Bedroom": {
        "min_w": 3.5, "min_h": 4.0,
        "ideal_w": 4.2, "ideal_h": 4.5
    },
    "Bedroom": {
        "min_w": 3.0, "min_h": 3.5,
        "ideal_w": 3.4, "ideal_h": 3.8
    },
    "Living Room": {
        "min_w": 3.6, "min_h": 4.5,
        "ideal_w": 4.5, "ideal_h": 5.5
    },
    "Kitchen": {
        "min_w": 2.4, "min_h": 3.0,
        "ideal_w": 3.0, "ideal_h": 3.6
    },
    "Dining": {
        "min_w": 2.5, "min_h": 3.0,
        "ideal_w": 3.2, "ideal_h": 3.6
    },
    "Attached Toilet": {
        "min_w": 1.2, "min_h": 2.1,
        "ideal_w": 1.5, "ideal_h": 2.4
    },
    "Common Toilet": {
        "min_w": 1.5, "min_h": 2.1,
        "ideal_w": 1.8, "ideal_h": 2.4
    },
    "Pooja": {
        "min_w": 1.2, "min_h": 1.2,
        "ideal_w": 1.5, "ideal_h": 1.5
    }
}

WALL = 0.23   # outer wall thickness meters
IWALL = 0.15  # inner wall thickness meters

VASTU_MODE_WEIGHTS = {
    "modern": {
        "vastu": 0.30,
        "comfort": 0.40,
        "circulation": 0.20,
        "light": 0.10
    },
    "guided": {
        "vastu": 0.55,
        "comfort": 0.25,
        "circulation": 0.15,
        "light": 0.05
    },
    "strict": {
        "vastu": 0.80,
        "comfort": 0.10,
        "circulation": 0.05,
        "light": 0.05
    }
}


def score_circulation(rooms, plot_w, plot_d):
    """
    Score how well rooms are connected for
    human movement flow.

    Good circulation:
    - Living room is central/accessible
    - Kitchen adjacent to dining
    - Bedrooms clustered together
    - Master bedroom most private (furthest from entry)
    - Toilets not on main circulation path
    """
    score = 0
    checks = 0

    living = next((r for r in rooms
                   if "Living" in r["name"]), None)
    kitchen = next((r for r in rooms
                    if "Kitchen" in r["name"]), None)
    dining = next((r for r in rooms
                   if "Dining" in r["name"]), None)
    master = next((r for r in rooms
                   if "Master" in r["name"]), None)

    # Check 1: Living room near entrance (north)
    if living:
        checks += 1
        living_cy = living["y"] + living["h"] / 2
        if living_cy < plot_d * 0.45:  # in north half
            score += 1

    # Check 2: Kitchen adjacent to dining
    if kitchen and dining:
        checks += 1
        k_cx = kitchen["x"] + kitchen["w"] / 2
        d_cx = dining["x"] + dining["w"] / 2
        k_cy = kitchen["y"] + kitchen["h"] / 2
        d_cy = dining["y"] + dining["h"] / 2
        distance = ((k_cx - d_cx) ** 2 +
                    (k_cy - d_cy) ** 2) ** 0.5
        if distance < plot_w * 0.5:
            score += 1

    # Check 3: Master bedroom most private
    # (furthest south = most private)
    if master:
        checks += 1
        master_cy = master["y"] + master["h"] / 2
        if master_cy > plot_d * 0.55:
            score += 1

    # Check 4: No toilet near living room
    toilets = [r for r in rooms
               if "Toilet" in r["name"]]
    if toilets and living:
        checks += 1
        all_private = True
        for t in toilets:
            t_cx = t["x"] + t["w"] / 2
            l_cx = living["x"] + living["w"] / 2
            t_cy = t["y"] + t["h"] / 2
            l_cy = living["y"] + living["h"] / 2
            dist = ((t_cx - l_cx) ** 2 +
                    (t_cy - l_cy) ** 2) ** 0.5
            if dist < plot_w * 0.35:
                all_private = False
        if all_private:
            score += 1

    if checks == 0:
        return 0.5
    return score / checks


def generate_layout(
    bhk_type: str,
    plot_w_ft: float,
    plot_d_ft: float,
    style: str = "modern",
    toilet_pref: str = "auto",
    include_pooja: bool = True,
    include_dining: bool = True,
    seed: int = None,
    vastu_constraints: dict = None,
    user_preferences: str = None,
    vastu_mode: str = "modern"
) -> dict:

    if seed is None:
        seed = int(time.time() * 1000) % 999999
        
    for attempt in range(4):
        random.seed(seed + attempt)

        # Convert to meters
        plot_w = round(plot_w_ft * 0.3048, 2)
        plot_d = round(plot_d_ft * 0.3048, 2)
        
        # Inner dimensions (subtract outer walls)
        inner_w = round(plot_w - 2 * WALL, 2)
        inner_d = round(plot_d - 2 * WALL, 2)
        plot_area_sqft = plot_w_ft * plot_d_ft

        # --- Template blending (Step 5) ---
        blended = None
        try:
            similar = find_similar_templates(
                bhk_type, plot_w_ft, plot_d_ft, n=3)
            if similar:
                blended = blend_proportions(
                    similar,
                    random_variance=0.04)
                if blended:
                    print(f"[INFO] Using blended "
                          f"proportions from: "
                          f"{blended['templates_used']}")
        except Exception as e:
            print(f"[WARN] Template blending failed: {e}")
            blended = None

        # Resolve toilet preference
        pref = toilet_pref
        if pref == "auto":
            pref = "common" if plot_area_sqft < 600 else "all_attached"

        # Resolve dining separation
        force_separate_dining = False
        force_merged_dining = False

        if user_preferences:
            prefs_lower = user_preferences.lower()
            if any(w in prefs_lower for w in
                   ["separate dining", "dining room",
                    "formal dining"]):
                force_separate_dining = True
            if any(w in prefs_lower for w in
                   ["open kitchen", "open plan",
                    "studio", "merged"]):
                force_merged_dining = True

        # Auto rule based on plot size (Step 8)
        if force_separate_dining:
            dining_mode = "separate"
        elif force_merged_dining:
            dining_mode = "merged"
        elif plot_area_sqft < 800:
            dining_mode = "merged"  # always merge small plots
        elif blended:
            dining_mode = blended["dining_mode"]
        else:
            dining_mode = "merged"  # default merged
            # Only separate if user explicitly asks

        # Pattern selection — always random; templates only inform proportions
        if blended:
            # Always randomize — templates inform col/row proportions, NOT pattern
            if plot_area_sqft < 600:
                pattern = random.choices(
                    ["LR_front", "compact"],
                    weights=[70, 30]
                )[0]
            else:
                pattern = random.choices(
                    ["LR_front", "LR_right"],
                    weights=[60, 40]
                )[0]
        else:
            if plot_area_sqft < 600:
                pattern = random.choices(
                    ["LR_front", "compact"],
                    weights=[60, 40]
                )[0]
            else:
                pattern = random.choices(
                    ["LR_front", "LR_right", "compact"],
                    weights=[65, 25, 10]
                )[0]

        # Preserve selected label for response/debugging
        pattern_selected = pattern

        # Column split (Step 7) — use template-informed proportions if available
        split_style = "balanced"
        col_a_pct = 0.45
        north_h_pct_val = random.uniform(0.35, 0.50)  # default
        if pattern in ["LR_front", "LR_right"]:
            if blended:
                # Use template-informed proportions
                col_a_pct = blended["bed_col_pct"]
                split_style = "template_blend"
                north_h_target = blended["north_h_pct"]
                master_h_target = blended["master_h_pct"]

                # Add small random variation
                north_h_pct_val = north_h_target + \
                    random.uniform(-0.04, 0.04)
                north_h_pct_val = max(0.30,
                    min(0.55, north_h_pct_val))
            else:
                split_style = random.choice([
                    "bed_heavy",    # bedrooms get more space
                    "balanced",     # equal split
                    "living_heavy"  # living gets more space
                ])
                if split_style == "bed_heavy":
                    col_a_pct = random.uniform(0.48, 0.56)
                elif split_style == "balanced":
                    col_a_pct = random.uniform(0.42, 0.48)
                else:
                    col_a_pct = random.uniform(0.36, 0.42)
                north_h_pct_val = random.uniform(0.35, 0.50)

        # Row split — vary north/south proportions
        row_style = random.choice([
            "living_tall",   # living gets more height
            "balanced",      # equal north/south
            "kitchen_tall"   # kitchen/bedroom gets more
        ])
        if blended:
            north_h_pct = north_h_pct_val
        else:
            if row_style == "living_tall":
                north_h_pct = random.uniform(0.45, 0.55)
            elif row_style == "balanced":
                north_h_pct = random.uniform(0.38, 0.45)
            else:
                north_h_pct = random.uniform(0.30, 0.38)

        north_h_min = max(inner_d * north_h_pct, 4.5)
        north_h_max = min(inner_d * (north_h_pct + 0.08),
                          7.0)
        north_h = round(
            random.uniform(north_h_min, north_h_max), 2)
        south_h = round(inner_d - north_h, 2)
        
        rooms = []
        bhk_num = int(bhk_type[0]) if bhk_type[0].isdigit() else 1

        if bhk_num == 1 and inner_w < 6.5:
            # Compact 1BHK layout
            # Split width 50/50 for small plots
            bed_col_w = round(inner_w * 0.50, 2)
            living_col_w = round(inner_w - bed_col_w, 2)
            living_x = round(WALL + bed_col_w, 2)
            
            # Toilet height from top
            toilet_h = round(random.uniform(1.8, 2.2), 2)
            toilet_w = round(bed_col_w * 0.55, 2)
            toilet_w = min(toilet_w, 1.5)
            toilet_w = max(toilet_w, 1.1)
            
            # Master bedroom takes full column height
            # Toilet carved from top portion
            master_h = round(inner_d - toilet_h, 2)
            master_h = max(master_h, 3.5)
            
            rooms = []
            
            # Living / Dining — full right column
            rooms.append({
                "name": "Living / Dining",
                "x": living_x, "y": WALL,
                "w": living_col_w,
                "h": round(inner_d * 0.55, 2),
                "door": {"wall": "N", "pos": 0.5, "width": 1.0},
                "window": {"wall": "N", "pos": 0.5, "width": 1.2}
            })
            
            # Kitchen — bottom right
            kitchen_h = round(inner_d - round(inner_d*0.55, 2), 2)
            rooms.append({
                "name": "Kitchen",
                "x": living_x,
                "y": round(WALL + round(inner_d*0.55, 2), 2),
                "w": living_col_w,
                "h": kitchen_h,
                "door": {"wall": "N", "pos": 0.5, "width": 0.8},
                "window": {"wall": "E", "pos": 0.4, "width": 0.9}
            })
            
            # Toilet — top of bedroom column
            rooms.append({
                "name": "Toilet (Master)",
                "x": WALL,
                "y": WALL,
                "w": toilet_w,
                "h": toilet_h,
                "door": {"wall": "S", "pos": 0.5, "width": 0.7},
                "window": None
            })
            
            # Master Bedroom — below toilet
            rooms.append({
                "name": "Master Bedroom",
                "x": WALL,
                "y": round(WALL + toilet_h, 2),
                "w": bed_col_w,
                "h": master_h,
                "door": {"wall": "E", "pos": 0.5, "width": 0.9},
                "window": {"wall": "W", "pos": 0.4, "width": 1.0}
            })
            
            # Pooja if space allows
            if include_pooja and toilet_w < bed_col_w - 0.5:
                pooja_w = round(bed_col_w - toilet_w, 2)
                pooja_w = min(pooja_w, 1.5)
                if pooja_w >= 0.9:
                    rooms.append({
                        "name": "Pooja",
                        "x": round(WALL + toilet_w, 2),
                        "y": WALL,
                        "w": pooja_w,
                        "h": toilet_h,
                        "door": {"wall": "S", "pos": 0.5, 
                                 "width": 0.7},
                        "window": None
                    })
            
            # Gap-fix pass (compact 1BHK)
            bed_right_edge = round(WALL + bed_col_w, 2)
            for r in rooms:
                if abs(r["x"] - bed_right_edge) < 0.05:
                    r["x"] = bed_right_edge
                bed_room_right = round(r["x"] + r["w"], 2)
                if abs(bed_room_right - bed_right_edge) < 0.05:
                    r["w"] = round(bed_right_edge - r["x"], 2)
                room_right = round(r["x"] + r["w"], 2)
                plot_right = round(plot_w - WALL, 2)
                if abs(room_right - plot_right) < 0.05:
                    r["w"] = round(plot_right - r["x"], 2)
                room_bottom = round(r["y"] + r["h"], 2)
                plot_bottom = round(plot_d - WALL, 2)
                if abs(room_bottom - plot_bottom) < 0.05:
                    r["h"] = round(plot_bottom - r["y"], 2)
                if abs(r["y"] - WALL) < 0.05:
                    r["y"] = WALL
                if abs(r["x"] - WALL) < 0.05:
                    r["x"] = WALL

            # Validate
            valid = True
            for r in rooms:
                if "Toilet" in r["name"] or r["name"]=="Pooja":
                    if r["w"] < 0.9 or r["h"] < 1.5:
                        valid = False
                        break
                else:
                    if r["w"] < 2.0 or r["h"] < 2.0:
                        valid = False
                        break
            
            if valid:
                return {
                    "plot_w_m": plot_w,
                    "plot_d_m": plot_d,
                    "plot_w_ft": plot_w_ft,
                    "plot_d_ft": plot_d_ft,
                    "bhk_type": bhk_type,
                    "style": style,
                    "rooms": rooms,
                    "engine": "LAYOUT-V2",
                    "seed": seed,
                    "layout_pattern": "compact_1bhk",
                    "toilet_pref": pref,
                    "layout_variant": f"compact_1bhk_compact",
                    "row_style": "compact",
                    "dining_mode": dining_mode,
                    "plot_area_sqft": plot_area_sqft,
                    "vastu_mode": vastu_mode if vastu_mode else "modern"
                }
            # If validation fails, continue to normal flow

        if bhk_num == 1:
            include_dining_separate = False
        else:
            include_dining_separate = include_dining and dining_mode == "separate"

        if pattern == "LR_front":
            # Adaptive minimums based on plot width
            if inner_w < 6.0:
                # Small plot — compact layout
                living_min = round(inner_w * 0.36, 2)
                bed_min = round(inner_w * 0.42, 2)
                toilet_w_max = 1.2  # smaller toilets
                toilet_h_min = 1.8
            elif inner_w < 7.5:
                # Medium plot
                living_min = round(inner_w * 0.36, 2)
                bed_min = round(inner_w * 0.42, 2)
                toilet_w_max = 1.4
                toilet_h_min = 2.0
            else:
                # Large plot
                living_min = max(round(inner_w * 0.34, 2), 3.6)
                bed_min = max(round(inner_w * 0.40, 2), 4.0)
                toilet_w_max = 1.5
                toilet_h_min = 2.1

            bed_col_w = round(inner_w * col_a_pct, 2)
            living_col_w = round(inner_w - bed_col_w, 2)

            # Ensure minimums
            if bed_col_w < bed_min:
                bed_col_w = bed_min
                living_col_w = round(inner_w - bed_col_w, 2)
            if living_col_w < living_min:
                living_col_w = living_min
                bed_col_w = round(inner_w - living_col_w, 2)
            
            if bhk_num == 1 and inner_w >= 6.0:
                # No need to fit multiple bedrooms
                # Master + toilet needs 3.0 + 1.2 = 4.2m min
                bed_col_w = max(bed_col_w, 4.4)
                living_col_w = round(inner_w - bed_col_w, 2)
                living_col_w = max(living_col_w, 3.6)
                # Recalculate if conflict
                if bed_col_w + living_col_w > inner_w:
                    bed_col_w = round(inner_w * 0.55, 2)
                    living_col_w = round(inner_w - bed_col_w, 2)

            living_x = round(WALL + bed_col_w, 2)
            bed_x = WALL  # bed column on west

            dining_w = 0
            dining_h = 0
            if include_dining_separate:
                if living_col_w < 4.6:
                    rooms.append({
                        "name": "Living / Dining",
                        "x": living_x, "y": WALL,
                        "w": living_col_w, "h": north_h,
                        "door": {"wall": "W", "pos": 0.5, "width": 1.2},
                        "window": {"wall": "N", "pos": 0.5, "width": 1.5}
                    })
                else:
                    rooms.append({
                        "name": "Living Room",
                        "x": living_x, "y": WALL,
                        "w": living_col_w, "h": north_h,
                        "door": {"wall": "W", "pos": 0.5, "width": 1.2},
                        "window": {"wall": "N", "pos": 0.5, "width": 1.5}
                    })
                    dining_h = round(min(inner_d * 0.25, 4.0), 2)
                    dining_h = max(dining_h, 3.0)
                    dining_w = round(living_col_w * 0.55, 2)
                    dining_w = max(dining_w, 2.5)
                    rooms.append({
                        "name": "Dining",
                        "x": living_x,
                        "y": round(WALL + north_h, 2),
                        "w": dining_w,
                        "h": dining_h,
                        "door": None,
                        "window": None
                    })
            else:
                rooms.append({
                    "name": "Living / Dining" if include_dining else "Living Room",
                    "x": living_x, "y": WALL,
                    "w": living_col_w, "h": north_h,
                    "door": {"wall": "W", "pos": 0.5, "width": 1.2},
                    "window": {"wall": "N", "pos": 0.5, "width": 1.5}
                })

            kitchen_y = round(WALL + north_h + dining_h, 2)
            kitchen_h = round(plot_d - WALL - kitchen_y, 2)
            kitchen_h = min(kitchen_h, 5.0)
            kitchen_h = max(kitchen_h, 3.0)

            rooms.append({
                "name": "Kitchen",
                "x": round(living_x + dining_w, 2),
                "y": round(WALL + north_h, 2),
                "w": round(living_col_w - dining_w, 2),
                "h": kitchen_h,
                "door": {"wall": "N", "pos": 0.5, "width": 0.9},
                "window": {"wall": "E", "pos": 0.4, "width": 0.9}
            })

            # Bedrooms stacked in west column
            num_other_beds = bhk_num - 1
            other_bed_h = 0

            if num_other_beds == 0:
                # 1BHK — master takes south portion only
                master_h = round(inner_d * random.uniform(0.45, 0.60), 2)
                master_h = max(master_h, 4.0)
                master_h = min(master_h, 8.0)  # never more than 8m
            else:
                master_h = round(inner_d * random.uniform(0.30, 0.38), 2)
                master_h = max(master_h, 4.0)
                other_bed_h = round((inner_d - master_h) / num_other_beds, 2)
                other_bed_h = max(other_bed_h, 3.5)
                other_bed_h = min(other_bed_h, 6.0)
                
                # If other_bed_h is capped, recalculate master
                # to fill the remaining space correctly
                total_bed_h = other_bed_h * num_other_beds + master_h
                if total_bed_h < inner_d - 0.5:
                    master_h = round(master_h + (inner_d - total_bed_h), 2)
                    master_h = min(master_h, 8.0)
            
            remaining_h = round(inner_d - master_h, 2)

            y_offset = WALL
            
            if num_other_beds >= 3:
                rooms.append({
                    "name": "Bedroom 3", "x": WALL, "y": y_offset, "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "E", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "W", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)

            if num_other_beds >= 2:
                rooms.append({
                    "name": "Bedroom 2", "x": WALL, "y": y_offset, "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "E", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "W", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)

            if num_other_beds >= 1:
                rooms.append({
                    "name": "Bedroom", "x": WALL, "y": y_offset, "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "E", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "W", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)
            
            # Master Bedroom
            rooms.append({
                "name": "Master Bedroom",
                "x": WALL,
                "y": y_offset,
                "w": bed_col_w,
                "h": master_h,
                "door": {"wall": "E", "pos": 0.5, "width": 0.9},
                "window": {"wall": "W", "pos": 0.4, "width": 1.2}
            })

        elif pattern == "LR_right":
            # Mirror layout — living on West, bedrooms on East
            # Fix 3: row_style defined locally for LR_right
            row_style = random.choice([
                "living_tall", "balanced", "kitchen_tall"
            ])
            if inner_w < 6.0:
                living_min = round(inner_w * 0.36, 2)
                bed_min = round(inner_w * 0.42, 2)
                toilet_w_max = 1.2
                toilet_h_min = 1.8
            elif inner_w < 7.5:
                living_min = round(inner_w * 0.36, 2)
                bed_min = round(inner_w * 0.42, 2)
                toilet_w_max = 1.4
                toilet_h_min = 2.0
            else:
                living_min = max(round(inner_w * 0.34, 2), 3.6)
                bed_min = max(round(inner_w * 0.40, 2), 4.0)
                toilet_w_max = 1.5
                toilet_h_min = 2.1

            bed_col_w = round(inner_w * col_a_pct, 2)
            living_col_w = round(inner_w - bed_col_w, 2)

            if bed_col_w < bed_min:
                bed_col_w = bed_min
                living_col_w = round(inner_w - bed_col_w, 2)
            if living_col_w < living_min:
                living_col_w = living_min
                bed_col_w = round(inner_w - living_col_w, 2)

            if bhk_num == 1 and inner_w >= 6.0:
                bed_col_w = max(bed_col_w, 4.4)
                living_col_w = round(inner_w - bed_col_w, 2)
                living_col_w = max(living_col_w, 3.6)
                if bed_col_w + living_col_w > inner_w:
                    bed_col_w = round(inner_w * 0.55, 2)
                    living_col_w = round(inner_w - bed_col_w, 2)

            # In LR_right, kitchen goes to bottom of
            # living column (west side, south position)
            # This is NW zone — acceptable modern Vastu

            # Fix 2: confirm the x-flip is active
            living_x = WALL              # living on west
            bed_x = round(WALL + living_col_w, 2)  # beds on east
            print(f"[DEBUG] LR_right: living_x={living_x:.2f}"
                  f" bed_x={bed_x:.2f}")

            kitchen_h = min(round(inner_d * 0.35, 2), 5.0)
            kitchen_h = max(kitchen_h, 3.0)
            living_h = round(inner_d - kitchen_h, 2)

            # Living Room — west col, north
            rooms.append({
                "name": "Living / Dining"
                         if living_col_w > 4.0
                         else "Living Room",
                "x": WALL,
                "y": WALL,
                "w": living_col_w,
                "h": living_h,
                "door": {"wall": "N", "pos": 0.6, "width": 1.2},
                "window": {"wall": "N", "pos": 0.5, "width": 1.5}
            })

            # Kitchen — west col, south
            rooms.append({
                "name": "Kitchen",
                "x": WALL,
                "y": round(WALL + living_h, 2),
                "w": living_col_w,
                "h": kitchen_h,
                "door": {"wall": "N", "pos": 0.5, "width": 0.9},
                "window": {"wall": "W", "pos": 0.4, "width": 0.9}
            })

            # Bedrooms — east col, stacked north to south
            bed_x = round(WALL + living_col_w, 2)

            num_other_beds = bhk_num - 1
            other_bed_h = 0

            if num_other_beds == 0:
                master_h = round(inner_d * random.uniform(0.45, 0.60), 2)
                master_h = max(master_h, 4.0)
                master_h = min(master_h, 8.0)
            else:
                master_h = round(inner_d * random.uniform(0.30, 0.38), 2)
                master_h = max(master_h, 4.0)
                other_bed_h = round((inner_d - master_h) / num_other_beds, 2)
                other_bed_h = max(other_bed_h, 3.5)
                other_bed_h = min(other_bed_h, 6.0)
                total_bed_h = other_bed_h * num_other_beds + master_h
                if total_bed_h < inner_d - 0.5:
                    master_h = round(master_h + (inner_d - total_bed_h), 2)
                    master_h = min(master_h, 8.0)

            y_offset = WALL

            if num_other_beds >= 3:
                rooms.append({
                    "name": "Bedroom 3",
                    "x": bed_x, "y": y_offset,
                    "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "W", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "E", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)

            if num_other_beds >= 2:
                rooms.append({
                    "name": "Bedroom 2",
                    "x": bed_x, "y": y_offset,
                    "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "W", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "E", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)

            if num_other_beds >= 1:
                rooms.append({
                    "name": "Bedroom",
                    "x": bed_x, "y": y_offset,
                    "w": bed_col_w, "h": other_bed_h,
                    "door": {"wall": "W", "pos": 0.5, "width": 0.9},
                    "window": {"wall": "E", "pos": 0.4, "width": 1.2}
                })
                y_offset = round(y_offset + other_bed_h, 2)

            rooms.append({
                "name": "Master Bedroom",
                "x": bed_x,
                "y": y_offset,
                "w": bed_col_w,
                "h": master_h,
                "door": {"wall": "W", "pos": 0.5, "width": 0.9},
                "window": {"wall": "E", "pos": 0.4, "width": 1.2}
            })

        # Attached Toilets
        master = next((r for r in rooms if r["name"] == "Master Bedroom"), None)
        if master:
            toilet_w = min(round(random.uniform(1.2, toilet_w_max), 2), round(master["w"] * 0.30, 2))
            toilet_w = max(toilet_w, 1.2)
            toilet_h = round(random.uniform(toilet_h_min, 2.4), 2)
            
            rooms.append({
                "name": "Toilet (Master)",
                "x": round(master["x"] + master["w"] - toilet_w, 2),
                "y": master["y"],
                "w": toilet_w,
                "h": toilet_h,
                "door": {"wall": "W", "pos": 0.5, "width": 0.75},
                "window": None
            })
            master["w"] = round(master["w"] - toilet_w, 2)

        other_beds = [r for r in rooms if "Bedroom" in r["name"] and "Master" not in r["name"]]
        
        if pref == "all_attached":
            for bed in other_beds:
                toilet_w = min(round(random.uniform(1.2, toilet_w_max), 2), round(bed["w"] * 0.30, 2))
                toilet_w = max(toilet_w, 1.2)
                toilet_h = round(random.uniform(toilet_h_min, 2.4), 2)
                rooms.append({
                    "name": f"Toilet ({bed['name']})",
                    "x": round(bed["x"] + bed["w"] - toilet_w, 2),
                    "y": bed["y"],
                    "w": toilet_w,
                    "h": toilet_h,
                    "door": {"wall": "W", "pos": 0.5, "width": 0.75},
                    "window": None
                })
                bed["w"] = round(bed["w"] - toilet_w, 2)
        
        elif pref == "common" and other_beds:
            toilet_w = 1.5
            toilet_h = 2.1
            bed_col_start = bed_x if pattern == "LR_right" else WALL
            common_door_wall = "W" if pattern == "LR_right" else "E"
            rooms.append({
                "name": "Common Toilet",
                "x": round(bed_col_start + bed_col_w - toilet_w, 2),
                "y": WALL,
                "w": toilet_w,
                "h": toilet_h,
                "door": {"wall": common_door_wall, "pos": 0.5, "width": 0.75},
                "window": None
            })
            for bed in other_beds:
                bed["w"] = round(bed["w"] - toilet_w, 2)

        # Pooja Room (Optional)
        if include_pooja and plot_area_sqft >= 500:
            pooja_w = 1.2
            pooja_h = 1.2
            
            # Place pooja in NE corner of living zone
            # Not in bedroom zone at all
            pooja_x = round(plot_w - WALL - pooja_w, 2)
            pooja_y = WALL
            
            # Shrink living room height to fit pooja
            living = next(
                (r for r in rooms 
                 if "Living" in r["name"]), None
            )
            if living and living["h"] > pooja_h + 2.5 and living["w"] - pooja_w >= 1.8:
                rooms.append({
                    "name": "Pooja",
                    "x": pooja_x,
                    "y": pooja_y,
                    "w": pooja_w,
                    "h": pooja_h,
                    "door": {"wall": "S", "pos": 0.5, 
                             "width": 0.75},
                    "window": None
                })
                # Adjust living room to not overlap pooja
                living["w"] = round(
                    living["w"] - pooja_w, 2)
            # If living room too small, skip pooja silently

        # Gap-fix pass (LR_front / LR_right)
        if pattern == "LR_front":
            bed_right_edge = round(WALL + bed_col_w, 2)
        elif pattern == "LR_right":
            bed_right_edge = round(WALL + living_col_w, 2)
        else:
            bed_right_edge = None

        if bed_right_edge is not None:
            for r in rooms:
                if abs(r["x"] - bed_right_edge) < 0.05:
                    r["x"] = bed_right_edge
                bed_room_right = round(r["x"] + r["w"], 2)
                if abs(bed_room_right - bed_right_edge) < 0.05:
                    r["w"] = round(bed_right_edge - r["x"], 2)
                room_right = round(r["x"] + r["w"], 2)
                plot_right = round(plot_w - WALL, 2)
                if abs(room_right - plot_right) < 0.05:
                    r["w"] = round(plot_right - r["x"], 2)
                room_bottom = round(r["y"] + r["h"], 2)
                plot_bottom = round(plot_d - WALL, 2)
                if abs(room_bottom - plot_bottom) < 0.05:
                    r["h"] = round(plot_bottom - r["y"], 2)
                if abs(r["y"] - WALL) < 0.05:
                    r["y"] = WALL
                if abs(r["x"] - WALL) < 0.05:
                    r["x"] = WALL

        # Validation
        valid = True
        total_area = 0
        for r in rooms:
            if "Toilet" in r["name"]:
                if r["w"] < 0.9 or r["h"] < 1.5:
                    valid = False
                    break
            elif r["name"] == "Pooja":
                if r["w"] < 0.9 or r["h"] < 0.9:
                    valid = False
                    break
            else:
                min_room_w = max(1.8, inner_w * 0.20)
                min_room_h = max(2.0, inner_d * 0.15)
                if r["w"] < min_room_w or r["h"] < min_room_h:
                    valid = False
                    break
            total_area += r["w"] * r["h"]
            
        min_area_factor = 0.50 if bhk_num == 1 else 0.65
        if total_area < (inner_w * inner_d * min_area_factor):
            valid = False
            
        if valid:
            return {
                "plot_w_m": plot_w,
                "plot_d_m": plot_d,
                "plot_w_ft": plot_w_ft,
                "plot_d_ft": plot_d_ft,
                "bhk_type": bhk_type,
                "style": style,
                "rooms": rooms,
                "engine": "LAYOUT-V2",
                "seed": seed,
                "layout_pattern": pattern_selected,
                "toilet_pref": pref,
                "layout_variant": f"{pattern_selected}_{split_style}",
                "row_style": row_style,
                "dining_mode": dining_mode,
                "plot_area_sqft": plot_area_sqft,
                "vastu_mode": vastu_mode if vastu_mode else "modern",
                "templates_used": blended["templates_used"] if blended else [],
                "blend_source": blended["source"] if blended else "random"
            }
            
    return {"error": "Failed to generate valid layout after 3 retries."}

