import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.core.layout_engine import generate_layout

r = generate_layout("1BHK", 20, 30)
if "error" in r:
    print("FAIL:", r["error"])
else:
    print("OK:", len(r["rooms"]), "rooms")
    for room in r["rooms"]:
        print(f"  {room['name']:20} w={room['w']:.2f} h={room['h']:.2f}")