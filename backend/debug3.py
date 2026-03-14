import layout_engine

orig = layout_engine.generate_layout

with open('c:/Data Analyst/Vastu Architect tool/backend/layout_engine.py') as f:
    src = f.read()

src = src.replace('valid = False', 'print(\"Invalid:\", r, \"total_area:\", total_area); valid = False')
src = src.replace('if total_area < (inner_w * inner_d * 0.65):', 'if total_area < (inner_w * inner_d * 0.65):\n            print(\"Invalid area:\", total_area)\n')

exec(src, globals())

print("Testing 2BHK pooja=True dining=False without explicit seed")
for i in range(10):
    print("Run", i)
    res = generate_layout('2BHK', 30, 50, include_pooja=True, include_dining=False)
    if 'error' in res:
        print("FAILED")
    else:
        print("OK")
    print("---")
