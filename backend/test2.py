import layout_engine
import sys

def debug_layout():
    for attempt in range(4):
        res = layout_engine.generate_layout('2BHK', 30, 50, toilet_pref='common', include_pooja=False, seed=42+attempt)
        if 'error' in res:
            print("Attempt", attempt, "failed.")
        else:
            print("Attempt", attempt, "succeeded!")

debug_layout()

# Let's see why it failed by running exactly the logic for attempt 0
import random
random.seed(42)
plot_w_ft, plot_d_ft = 30, 50
WALL = 0.23
plot_w = round(plot_w_ft * 0.3048, 2)
plot_d = round(plot_d_ft * 0.3048, 2)
inner_w = round(plot_w - 2 * WALL, 2)
inner_d = round(plot_d - 2 * WALL, 2)
plot_area_sqft = plot_w_ft * plot_d_ft

pattern = random.choices(["LR_front", "LR_left", "LR_right"], weights=[50, 25, 25])[0]
if pattern in ["LR_left", "LR_right"]:
    pattern = "LR_front"

bhk_num = 2
north_h = round(random.uniform(inner_d * 0.38, inner_d * 0.50), 2)
south_h = round(inner_d - north_h, 2)
bed_col_w = round(random.uniform(inner_w * 0.42, inner_w * 0.55), 2)
living_col_w = round(inner_w - bed_col_w, 2)
living_x = round(WALL + bed_col_w, 2)

dining_h = round(min(inner_d * 0.25, 4.0), 2)
dining_h = max(dining_h, 3.0)
dining_w = round(living_col_w * 0.55, 2)
dining_w = max(dining_w, 2.5)

kitchen_y = round(WALL + north_h + dining_h, 2)
kitchen_h = round(plot_d - WALL - kitchen_y, 2)
kitchen_h = max(kitchen_h, 3.0)

master_h = round(inner_d * random.uniform(0.30, 0.38), 2)
master_h = max(master_h, 4.0)
num_other_beds = 1
other_bed_h = round((inner_d - master_h) / num_other_beds, 2)
other_bed_h = max(other_bed_h, 3.5)
master_h = round(inner_d - (other_bed_h * num_other_beds), 2)
master_h = max(master_h, 4.0)

rooms = [
    {"name": "Living Room", "w": living_col_w, "h": north_h},
    {"name": "Dining", "w": dining_w, "h": dining_h},
    {"name": "Kitchen", "w": round(living_col_w - dining_w, 2), "h": round(plot_d - WALL - (WALL + north_h), 2)},
    {"name": "Bedroom", "w": bed_col_w, "h": other_bed_h, "x": WALL, "y": WALL},
    {"name": "Master Bedroom", "w": bed_col_w, "h": round(inner_d - (WALL + other_bed_h - WALL), 2), "x": WALL, "y": WALL + other_bed_h}
]

# Attached
master = rooms[4]
toilet_w = min(round(random.uniform(1.2, 1.4), 2), round(master["w"] * 0.35, 2))
toilet_w = max(toilet_w, 1.2)
toilet_h = round(random.uniform(2.1, 2.4), 2)
rooms.append({"name": "Attached Toilet", "w": toilet_w, "h": toilet_h, "x": master["x"] + master["w"] - toilet_w, "y": master["y"]})
master["w"] = round(master["w"] - toilet_w, 2)

other_beds = [rooms[3]]
toilet_w = 1.5
toilet_h = 2.1
rooms.append({
    "name": "Common Toilet",
    "x": round(WALL + bed_col_w - toilet_w, 2),
    "y": WALL,
    "w": toilet_w,
    "h": toilet_h
})
for bed in other_beds:
    bed["w"] = round(bed["w"] - toilet_w, 2)

total_area = sum(r["w"] * r["h"] for r in rooms)
print("Total Area:", total_area, "Min Area:", inner_w * inner_d * 0.65)
for r in rooms:
    print(r)
    n = r["name"]
    w, h = r["w"], r["h"]
    if "Toilet" in n:
        if w < 1.0 or h < 1.5: print("INVALID TOILET", n, w, h)
    elif "Pooja" in n:
        if w < 1.0 or h < 1.0: print("INVALID POOJA", n, w, h)
    else:
        if w < 2.0 or h < 2.5: print("INVALID ROOM", n, w, h)
