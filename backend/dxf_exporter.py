import ezdxf
from ezdxf.enums import TextEntityAlignment
from ezdxf.enums import TextEntityAlignment
from datetime import datetime
from io import StringIO


def meters_to_feet_inches(meters):
    """Convert meters to feet and inches string format."""
    total_inches = meters * 39.3701
    feet = int(total_inches // 12)
    inches = round(total_inches % 12, 1)
    if inches == 12.0:
        feet += 1
        inches = 0.0
    inches_str = f"{inches:.1f}".rstrip('0').rstrip('.')
    return f"{feet}'{inches_str}\""


def is_outer_wall(val, plot_max, tolerance=300):
    return val <= tolerance or val >= (plot_max - tolerance)


def wall_touches_boundary(room, wall, plot_w, plot_d, tol=0.35):
    if wall == "N":
        return room["y"] <= tol
    if wall == "S":
        return (room["y"] + room["h"]) >= (plot_d - tol)
    if wall == "W":
        return room["x"] <= tol
    if wall == "E":
        return (room["x"] + room["w"]) >= (plot_w - tol)
    return False


def generate_professional_dxf(rooms_data, plot_w_m, plot_d_m, client_name, unit_system="metric"):
    """
    Generate professional architectural DXF.
    - Deduplicates shared wall segments (no double lines)
    - No background grid
    - AutoCAD dark-background layer colours
    Compatible with ezdxf 1.4.x (StringIO write, doc.units for mm).

    Returns:
        bytes (UTF-8 encoded DXF text)
    """
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    doc.units = ezdxf.units.MM

    # ── Layers (AutoCAD dark-bg palette) ─────────────────────────────
    layer_specs = {
        'A-WALL-EXT':  7,   # white  — outer walls
        'A-WALL-INT':  7,   # white  — inner walls
        'A-WALL-PLOT': 7,   # white  — plot boundary (heavier)
        'A-ANNO':      3,   # green  — room names
        'A-DIMS':      2,   # yellow — dimension text
        'A-GLAZ':      4,   # cyan   — windows
        'A-DOOR':      5,   # blue   — door arcs
        'A-TITLEBLK':  7,   # white  — title block
    }
    for name, color in layer_specs.items():
        if name not in doc.layers:
            doc.layers.new(name=name, dxfattribs={'color': color})

    # ── Y-flip helper (top-left data → DXF bottom-left, mm) ──────────
    W = plot_w_m * 1000.0
    D = plot_d_m * 1000.0

    def fy(y_m, h_m=0.0):
        return (plot_d_m - y_m - h_m) * 1000.0

    # ── STEP 1: Collect unique wall segments ──────────────────────────
    OUTER_GAP = 115   # mm (represents 0.23m wall)
    INNER_GAP = 75    # mm (represents 0.15m wall)
    SCALE = 1000      # meters to mm

    wall_segments = {}  # key = normalized segment, value = isOuter bool

    def add_wall_segment(x1, y1, x2, y2, plot_w_mm, plot_d_mm):
        # Normalize direction
        if (x1, y1) > (x2, y2):
            x1, y1, x2, y2 = x2, y2, x1, y1
        
        key = (round(x1/10)*10, round(y1/10)*10,
               round(x2/10)*10, round(y2/10)*10)
        
        # Wall is outer if either endpoint touches boundary
        outer = (
            is_outer_wall(x1, plot_w_mm) or
            is_outer_wall(x2, plot_w_mm) or
            is_outer_wall(y1, plot_d_mm) or
            is_outer_wall(y2, plot_d_mm)
        )
        
        # Once marked outer, keep it outer
        if key in wall_segments:
            wall_segments[key] = wall_segments[key] or outer
        else:
            wall_segments[key] = outer

    for room in rooms_data:
        x1 = room["x"] * SCALE
        y1 = fy(room["y"], room["h"])
        x2 = x1 + room["w"] * SCALE
        y2 = y1 + room["h"] * SCALE
        
        plot_w_mm = plot_w_m * SCALE
        plot_d_mm = plot_d_m * SCALE
        
        add_wall_segment(x1, y1, x2, y1, plot_w_mm, plot_d_mm)
        add_wall_segment(x2, y1, x2, y2, plot_w_mm, plot_d_mm)
        add_wall_segment(x2, y2, x1, y2, plot_w_mm, plot_d_mm)
        add_wall_segment(x1, y2, x1, y1, plot_w_mm, plot_d_mm)

    # ── STEP 2: Draw each wall as two parallel lines ────────────────────
    for (wx1, wy1, wx2, wy2), is_outer in wall_segments.items():
        gap = OUTER_GAP / 2 if is_outer else INNER_GAP / 2
        layer = "A-WALL-EXT" if is_outer else "A-WALL-INT"
        lw = 70 if is_outer else 25
        
        is_horizontal = abs(wy2 - wy1) < 10
        
        if is_horizontal:
            # Two lines above and below center
            msp.add_line(
                (wx1, wy1 + gap), (wx2, wy1 + gap),
                dxfattribs={"layer": layer, "lineweight": lw}
            )
            msp.add_line(
                (wx1, wy1 - gap), (wx2, wy1 - gap),
                dxfattribs={"layer": layer, "lineweight": lw}
            )
        else:
            # Two lines left and right of center
            msp.add_line(
                (wx1 + gap, wy1), (wx1 + gap, wy2),
                dxfattribs={"layer": layer, "lineweight": lw}
            )
            msp.add_line(
                (wx1 - gap, wy1), (wx1 - gap, wy2),
                dxfattribs={"layer": layer, "lineweight": lw}
            )

    # ── STEP 3: Plot boundary — heavier, separate layer ──────────────
    msp.add_lwpolyline(
        [(0, 0), (plot_w_m * 1000, 0), (plot_w_m * 1000, plot_d_m * 1000), (0, plot_d_m * 1000)],
        close=True,
        dxfattribs={"layer": "A-WALL-PLOT", "lineweight": 70}
    )

    # ── STEP 4: Room labels + dimensions ─────────────────────────────
    for room in rooms_data:
        rx = room['x'] * 1000.0
        rw = room['w'] * 1000.0
        rh = room['h'] * 1000.0
        ry = fy(room['y'], room['h'])

        cx = rx + rw / 2
        cy = ry + rh / 2

        text_x = (rx + (rx + rw)) / 2
        text_y = (ry + (ry + rh)) / 2

        # Name — size relative to smaller room dimension
        name_h = min(rw, rh) * 0.07
        name_h = max(150.0, min(name_h, 400.0))
        
        name_attribs = {
            "layer": "A-ANNO",
            "height": name_h,
            "halign": 2,   # center horizontal
            "valign": 2,   # center vertical
            "align_point": (text_x, text_y + name_h)
        }
        t = msp.add_text(room.get("name", "").upper(), dxfattribs=name_attribs)
        t.set_placement((text_x, text_y + name_h), align=TextEntityAlignment.MIDDLE_CENTER)

        # Dimensions under name
        dim_h = min(rw, rh) * 0.05
        dim_h = max(100.0, min(dim_h, 280.0))
        
        if unit_system == "metric":
            dim_txt = f"{room['w']:.2f}m x {room['h']:.2f}m"
        else:
            dim_txt = (f"{meters_to_feet_inches(room['w'])} x "
                       f"{meters_to_feet_inches(room['h'])}")
                       
        dim_attribs = {
            "layer": "A-DIMS",
            "height": dim_h,
            "halign": 2,
            "valign": 2,
            "align_point": (text_x, text_y - name_h)
        }
        t2 = msp.add_text(dim_txt, dxfattribs=dim_attribs)
        t2.set_placement((text_x, text_y - name_h), align=TextEntityAlignment.MIDDLE_CENTER)

        # ── Doors ────────────────────────────────────────────────────
        door = room.get('door')
        if door:
            door_width_mm  = door.get('width', 0.9) * 1000.0
            pos = door.get('pos', 0.5)
            dw  = door['wall']
            
            x1 = rx
            y1 = ry
            x2 = rx + rw
            y2 = ry + rh
            
            if dw == 'N':
                hinge_x = x1 + (x2-x1) * pos
                hinge_y = y2
                msp.add_arc(center=(hinge_x, hinge_y), radius=door_width_mm,
                            start_angle=270, end_angle=360, dxfattribs={'layer': 'A-DOOR'})
                msp.add_line((hinge_x, hinge_y), (hinge_x, hinge_y - door_width_mm),
                             dxfattribs={'layer': 'A-DOOR'})
                             
            elif dw == 'S':
                hinge_x = x1 + (x2-x1) * pos
                hinge_y = y1
                msp.add_arc(center=(hinge_x, hinge_y), radius=door_width_mm,
                            start_angle=0, end_angle=90, dxfattribs={'layer': 'A-DOOR'})
                msp.add_line((hinge_x, hinge_y), (hinge_x, hinge_y + door_width_mm),
                             dxfattribs={'layer': 'A-DOOR'})
                             
            elif dw == 'E':
                hinge_x = x2
                hinge_y = y1 + (y2-y1) * pos
                msp.add_arc(center=(hinge_x, hinge_y), radius=door_width_mm,
                            start_angle=90, end_angle=180, dxfattribs={'layer': 'A-DOOR'})
                msp.add_line((hinge_x, hinge_y), (hinge_x - door_width_mm, hinge_y),
                             dxfattribs={'layer': 'A-DOOR'})
                             
            elif dw == 'W':
                hinge_x = x1
                hinge_y = y1 + (y2-y1) * pos
                msp.add_arc(center=(hinge_x, hinge_y), radius=door_width_mm,
                            start_angle=0, end_angle=90, dxfattribs={'layer': 'A-DOOR'})
                msp.add_line((hinge_x, hinge_y), (hinge_x + door_width_mm, hinge_y),
                             dxfattribs={'layer': 'A-DOOR'})

        # ── Windows ──────────────────────────────────────────────────
        win = room.get('window')
        if win:
            if not wall_touches_boundary(room, win["wall"], plot_w_m, plot_d_m):
                continue
            
            hw = win.get('width', 1.2) * 500.0
            wp = win.get('pos', 0.5)
            ww = win['wall']
            if ww == 'N':
                wx = rx + rw * wp
                msp.add_line((wx - hw, ry + rh), (wx + hw, ry + rh),
                             dxfattribs={'layer': 'A-GLAZ', 'lineweight': 40})
            elif ww == 'S':
                wx = rx + rw * wp
                msp.add_line((wx - hw, ry), (wx + hw, ry),
                             dxfattribs={'layer': 'A-GLAZ', 'lineweight': 40})
            elif ww == 'E':
                wy = ry + rh * wp
                msp.add_line((rx + rw, wy - hw), (rx + rw, wy + hw),
                             dxfattribs={'layer': 'A-GLAZ', 'lineweight': 40})
            elif ww == 'W':
                wy = ry + rh * wp
                msp.add_line((rx, wy - hw), (rx, wy + hw),
                             dxfattribs={'layer': 'A-GLAZ', 'lineweight': 40})

    # ── Title block ───────────────────────────────────────────────────
    tb_y = -2500
    msp.add_lwpolyline(
        [(0, tb_y), (W, tb_y),
         (W, tb_y + 2000), (0, tb_y + 2000), (0, tb_y)],
        dxfattribs={'layer': 'A-TITLEBLK', 'lineweight': 35}
    )
    for txt, ty in [
        ("VASTU ARCHITECT AI",                         tb_y + 1700),
        (f"Client: {client_name}",                     tb_y + 1300),
        (f"Plot: {plot_w_m:.1f}m x {plot_d_m:.1f}m",  tb_y + 900),
        ("Scale: 1:100",                               tb_y + 500),
        (f"Date: {datetime.now():%Y-%m-%d}",           tb_y + 100),
    ]:
        msp.add_text(
            txt,
            dxfattribs={'layer': 'A-TITLEBLK', 'height': 250,
                        'insert': (500, ty)}
        )

    # ── Serialize (ezdxf 1.x: write to StringIO, encode to bytes) ────
    sio = StringIO()
    doc.write(sio)
    sio.seek(0)
    return sio.read().encode('utf-8')
