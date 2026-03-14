import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.core.layout_engine import generate_layout

tests = [
    ("1BHK", 20, 30),
    ("1BHK", 30, 50),
    ("2BHK", 30, 50),
]

for bhk, w, d in tests:
    r = generate_layout(bhk, w, d, seed=42)
    if "error" in r:
        print(f"{bhk} {w}x{d}: FAIL - {r['error']}")
    else:
        pattern = r.get('layout_pattern', 'unknown')
        print(f"{bhk} {w}x{d}: OK - {len(r['rooms'])} rooms (Pattern: {pattern})")
        for room in r["rooms"]:
            print(f"  {room['name']:20} w={room['w']:.2f} h={room['h']:.2f}")
    print("-" * 30)
