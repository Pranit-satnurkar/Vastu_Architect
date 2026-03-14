import layout_engine

orig = layout_engine.generate_layout

with open('c:/Data Analyst/Vastu Architect tool/backend/layout_engine.py') as f:
    src = f.read()

src = src.replace('valid = False', 'print(\"Invalid:\", r, \"total_area:\", total_area); valid = False')
exec(src, globals())

print("Testing Common Toilet without Pooja")
res = generate_layout('2BHK', 30, 50, toilet_pref='common', include_pooja=False)
if 'error' in res:
    print("FAILED")
else:
    print("OK")
    
print("---")
