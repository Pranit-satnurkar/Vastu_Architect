import layout_engine
import sys

def debug_failures():
    with open('c:/Data Analyst/Vastu Architect tool/backend/layout_engine.py', 'r') as f:
        src = f.read()

    src = src.replace('valid = False', 'print(\"Invalid:\", r, \"total_area:\", total_area); valid = False')
    exec(src, globals())

    print("--- 1BHK Debug ---")
    res1 = generate_layout('1BHK', 30, 50, seed=42)
    print("1BHK ERROR:", res1.get('error'))

    print("--- 4BHK Debug ---")
    res4 = generate_layout('4BHK', 30, 50, seed=42)
    print("4BHK ERROR:", res4.get('error'))

debug_failures()
