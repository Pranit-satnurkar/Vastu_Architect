import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.core.layout_engine import generate_layout

for i in range(8):
    seed = i * 12345
    r = generate_layout("3BHK", 30, 50, seed=seed)
    if "rooms" in r:
        v = r.get("layout_variant", "?")
        s = r.get("row_style", "?")
        print(seed, v, s, len(r["rooms"]),"rooms")
    else:
        print(seed, "ERROR", r)



