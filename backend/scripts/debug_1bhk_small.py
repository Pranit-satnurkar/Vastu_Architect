import sys

with open('c:/Data Analyst/Vastu Architect tool/backend/layout_engine.py', 'r') as f:
    src = f.read()

src = src.replace('valid = False', 'print("Invalid:", r, "total_area:", total_area); valid = False')
exec(src, globals())

print('--- 1BHK 20x30 Debug ---')
res = generate_layout('1BHK', 20, 30, seed=42)
if 'error' in res:
    print('ERROR:', res['error'])
else:
    print('OK')
