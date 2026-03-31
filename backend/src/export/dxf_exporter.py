import ezdxf
from ezdxf.enums import TextEntityAlignment
from datetime import datetime
from io import StringIO
import math


# ─── Unit helpers ─────────────────────────────────────────────────────────────
def meters_to_feet_inches(meters: float) -> str:
    total_inches = meters * 39.3701
    feet = int(total_inches // 12)
    inches = round(total_inches % 12, 1)
    if inches == 12.0:
        feet += 1
        inches = 0.0
    s = f"{inches:.1f}".rstrip("0").rstrip(".")
    return f"{feet}'{s}\""


def fmt_dim(val_m: float, unit_system: str) -> str:
    if unit_system == "imperial":
        return meters_to_feet_inches(val_m)
    return f"{val_m:.2f}m"


def is_outer_wall(val, plot_max, tolerance=300):
    return val <= tolerance or val >= (plot_max - tolerance)


# ─── Main generator ───────────────────────────────────────────────────────────
def generate_professional_dxf(
    rooms_data, plot_w_m, plot_d_m, client_name, unit_system="metric"
):
    """
    Professional architectural DXF with:
    - Double-line walls (outer 230 mm / inner 150 mm), deduplicated
    - Linear dimension entities for overall plot + per-room dimensions
    - All windows drawn (not just outer-wall ones)
    - Door arcs on correct wall positions
    - North arrow
    - Room labels with area
    - Structured title block
    """
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    doc.units = ezdxf.units.MM

    W = plot_w_m * 1000.0   # mm
    D = plot_d_m * 1000.0   # mm

    # ── Layers ────────────────────────────────────────────────────────
    for name, color, lw in [
        ("A-WALL-EXT",  7, 70),   # white, heavy
        ("A-WALL-INT",  7, 25),   # white, light
        ("A-WALL-PLOT", 7, 70),
        ("A-ANNO",      3, 18),   # green
        ("A-AREA",      8, 18),   # gray
        ("A-DIMS",      2, 18),   # yellow
        ("A-GLAZ",      4, 35),   # cyan
        ("A-DOOR",      5, 25),   # blue
        ("A-TITLEBLK",  7, 35),
        ("A-NORTH",     1, 35),   # red
    ]:
        if name not in doc.layers:
            doc.layers.new(name=name, dxfattribs={"color": color, "lineweight": lw})

    # ── Dimension style ────────────────────────────────────────────────
    ds_name = "VASTU"
    if ds_name not in doc.dimstyles:
        ds = doc.dimstyles.new(ds_name)
        ds.set_arrows(blk=ezdxf.entities.dimstyle.ARROWS.closed_filled)
        ds.dxf.dimtxt  = 180    # text height mm
        ds.dxf.dimasz  = 130    # arrow size mm
        ds.dxf.dimexo  = 60     # ext line offset from point
        ds.dxf.dimexe  = 80     # ext line beyond dim line
        ds.dxf.dimgap  = 60     # gap between dim line and text
        ds.dxf.dimdec  = 2      # decimal places
        ds.dxf.dimclrd = 2      # dim line color: yellow
        ds.dxf.dimclre = 2      # ext line color: yellow
        ds.dxf.dimclrt = 2      # text color: yellow

    # ── Y-flip: data is top-left origin, DXF is bottom-left ───────────
    def fy(y_m, h_m=0.0):
        return (plot_d_m - y_m - h_m) * 1000.0

    # ── STEP 1: collect & deduplicate wall segments ────────────────────
    OUTER_GAP = 115   # half of 230 mm wall
    INNER_GAP = 75    # half of 150 mm wall
    SCALE     = 1000

    wall_segments: dict = {}

    def add_seg(x1, y1, x2, y2):
        if (x1, y1) > (x2, y2):
            x1, y1, x2, y2 = x2, y2, x1, y1
        key = (round(x1 / 10) * 10, round(y1 / 10) * 10,
               round(x2 / 10) * 10, round(y2 / 10) * 10)
        outer = (
            is_outer_wall(x1, W) or is_outer_wall(x2, W) or
            is_outer_wall(y1, D) or is_outer_wall(y2, D)
        )
        wall_segments[key] = wall_segments.get(key, False) or outer

    for r in rooms_data:
        x1 = r["x"] * SCALE
        y1 = fy(r["y"], r["h"])
        x2 = x1 + r["w"] * SCALE
        y2 = y1 + r["h"] * SCALE
        add_seg(x1, y1, x2, y1)
        add_seg(x2, y1, x2, y2)
        add_seg(x2, y2, x1, y2)
        add_seg(x1, y2, x1, y1)

    # ── STEP 2: draw double-line walls ────────────────────────────────
    for (wx1, wy1, wx2, wy2), is_outer in wall_segments.items():
        gap   = OUTER_GAP if is_outer else INNER_GAP
        layer = "A-WALL-EXT" if is_outer else "A-WALL-INT"
        lw    = 70 if is_outer else 25

        if abs(wy2 - wy1) < 10:   # horizontal wall
            for dy in (gap, -gap):
                msp.add_line((wx1, wy1 + dy), (wx2, wy1 + dy),
                             dxfattribs={"layer": layer, "lineweight": lw})
        else:                       # vertical wall
            for dx in (gap, -gap):
                msp.add_line((wx1 + dx, wy1), (wx1 + dx, wy2),
                             dxfattribs={"layer": layer, "lineweight": lw})

    # ── STEP 3: plot boundary ──────────────────────────────────────────
    msp.add_lwpolyline(
        [(0, 0), (W, 0), (W, D), (0, D)],
        close=True,
        dxfattribs={"layer": "A-WALL-PLOT", "lineweight": 70},
    )

    # ── STEP 4: overall plot dimension lines ───────────────────────────
    DIM_OFF = 900   # mm offset from boundary

    # Width — below plot
    try:
        d = msp.add_linear_dim(
            base=(W / 2, -DIM_OFF),
            p1=(0, 0), p2=(W, 0),
            angle=0,
            dimstyle=ds_name,
            override={"dimpost": f" {fmt_dim(plot_w_m, unit_system)}"},
            dxfattribs={"layer": "A-DIMS"},
        )
        d.render()
    except Exception:
        # Fallback plain text if dim fails
        msp.add_text(
            fmt_dim(plot_w_m, unit_system),
            dxfattribs={"layer": "A-DIMS", "height": 180,
                        "insert": (W / 2, -DIM_OFF)},
        )

    # Depth — right of plot
    try:
        d = msp.add_linear_dim(
            base=(W + DIM_OFF, D / 2),
            p1=(W, 0), p2=(W, D),
            angle=90,
            dimstyle=ds_name,
            override={"dimpost": f" {fmt_dim(plot_d_m, unit_system)}"},
            dxfattribs={"layer": "A-DIMS"},
        )
        d.render()
    except Exception:
        msp.add_text(
            fmt_dim(plot_d_m, unit_system),
            dxfattribs={"layer": "A-DIMS", "height": 180,
                        "insert": (W + DIM_OFF, D / 2)},
        )

    # ── STEP 5: rooms — labels, area, per-room dims, doors, windows ───
    for room in rooms_data:
        rx = room["x"] * 1000.0
        ry = fy(room["y"], room["h"])
        rw = room["w"] * 1000.0
        rh = room["h"] * 1000.0
        cx = rx + rw / 2
        cy = ry + rh / 2
        area = room["w"] * room["h"]

        # ── Room name ────────────────────────────────────────────────
        name_h = max(150.0, min(rw * 0.07, 380.0))
        t = msp.add_text(
            room.get("name", "").upper(),
            dxfattribs={"layer": "A-ANNO", "height": name_h},
        )
        t.set_placement((cx, cy + name_h * 0.6),
                        align=TextEntityAlignment.MIDDLE_CENTER)

        # ── Dimension text (WxH + area) ──────────────────────────────
        dim_h = max(110.0, min(rw * 0.05, 260.0))
        dim_str = (
            f"{fmt_dim(room['w'], unit_system)} × {fmt_dim(room['h'], unit_system)}"
            f"  |  {area:.1f} m²"
        )
        t2 = msp.add_text(
            dim_str,
            dxfattribs={"layer": "A-DIMS", "height": dim_h},
        )
        t2.set_placement((cx, cy - name_h * 0.6),
                         align=TextEntityAlignment.MIDDLE_CENTER)

        # ── Per-room linear dimensions (below & right) ───────────────
        R_OFF = 400   # offset from room edge
        try:
            d = msp.add_linear_dim(
                base=(cx, ry - R_OFF),
                p1=(rx, ry), p2=(rx + rw, ry),
                angle=0, dimstyle=ds_name,
                dxfattribs={"layer": "A-DIMS"},
            )
            d.render()
        except Exception:
            pass

        try:
            d = msp.add_linear_dim(
                base=(rx + rw + R_OFF, cy),
                p1=(rx + rw, ry), p2=(rx + rw, ry + rh),
                angle=90, dimstyle=ds_name,
                dxfattribs={"layer": "A-DIMS"},
            )
            d.render()
        except Exception:
            pass

        # ── Door ─────────────────────────────────────────────────────
        door = room.get("door")
        if door:
            dw  = door["wall"]
            pos = door.get("pos", 0.5)
            dr  = door.get("width", 0.9) * 1000.0

            if dw == "N":
                hx, hy = rx + rw * pos, ry + rh
                msp.add_arc(center=(hx, hy), radius=dr,
                            start_angle=270, end_angle=360,
                            dxfattribs={"layer": "A-DOOR"})
                msp.add_line((hx, hy), (hx, hy - dr),
                             dxfattribs={"layer": "A-DOOR"})
            elif dw == "S":
                hx, hy = rx + rw * pos, ry
                msp.add_arc(center=(hx, hy), radius=dr,
                            start_angle=0, end_angle=90,
                            dxfattribs={"layer": "A-DOOR"})
                msp.add_line((hx, hy), (hx, hy + dr),
                             dxfattribs={"layer": "A-DOOR"})
            elif dw == "E":
                hx, hy = rx + rw, ry + rh * pos
                msp.add_arc(center=(hx, hy), radius=dr,
                            start_angle=90, end_angle=180,
                            dxfattribs={"layer": "A-DOOR"})
                msp.add_line((hx, hy), (hx - dr, hy),
                             dxfattribs={"layer": "A-DOOR"})
            elif dw == "W":
                hx, hy = rx, ry + rh * pos
                msp.add_arc(center=(hx, hy), radius=dr,
                            start_angle=0, end_angle=90,
                            dxfattribs={"layer": "A-DOOR"})
                msp.add_line((hx, hy), (hx + dr, hy),
                             dxfattribs={"layer": "A-DOOR"})

        # ── Window — 3 parallel lines (ALL windows, not just outer) ──
        win = room.get("window")
        if win:
            hw   = win.get("width", 1.2) * 500.0   # half-width mm
            wp   = win.get("pos", 0.5)
            ww   = win["wall"]
            WALL = 230.0
            gattr = {"layer": "A-GLAZ", "lineweight": 35}

            if ww == "N":
                wx = rx + rw * wp
                wy_base = ry + rh
                for t in (0.15, 0.5, 0.85):
                    msp.add_line((wx - hw, wy_base + WALL * t),
                                 (wx + hw, wy_base + WALL * t), dxfattribs=gattr)
            elif ww == "S":
                wx = rx + rw * wp
                wy_base = ry
                for t in (0.15, 0.5, 0.85):
                    msp.add_line((wx - hw, wy_base - WALL * t),
                                 (wx + hw, wy_base - WALL * t), dxfattribs=gattr)
            elif ww == "E":
                wy = ry + rh * wp
                wx_base = rx + rw
                for t in (0.15, 0.5, 0.85):
                    msp.add_line((wx_base + WALL * t, wy - hw),
                                 (wx_base + WALL * t, wy + hw), dxfattribs=gattr)
            elif ww == "W":
                wy = ry + rh * wp
                wx_base = rx
                for t in (0.15, 0.5, 0.85):
                    msp.add_line((wx_base - WALL * t, wy - hw),
                                 (wx_base - WALL * t, wy + hw), dxfattribs=gattr)

    # ── STEP 6: North arrow (top-right of drawing) ────────────────────
    na_cx = W + DIM_OFF + 600
    na_cy = D - 400
    R = 350   # radius mm

    msp.add_circle(
        center=(na_cx, na_cy), radius=R,
        dxfattribs={"layer": "A-NORTH"},
    )
    # Arrow pointing up (North)
    tip = (na_cx, na_cy + R * 0.85)
    bl  = (na_cx - R * 0.28, na_cy - R * 0.35)
    br  = (na_cx + R * 0.28, na_cy - R * 0.35)
    msp.add_solid([bl, br, (na_cx, na_cy + R * 0.05), tip],
                  dxfattribs={"layer": "A-NORTH"})
    msp.add_text(
        "N",
        dxfattribs={"layer": "A-NORTH", "height": 260,
                    "insert": (na_cx, na_cy + R + 80)},
    ).set_placement((na_cx, na_cy + R + 80),
                    align=TextEntityAlignment.BOTTOM_CENTER)

    # ── STEP 7: Title block ────────────────────────────────────────────
    TB_H   = 2800   # total title block height mm
    TB_Y   = -TB_H - DIM_OFF   # below dim line space
    tb_lw  = {"layer": "A-TITLEBLK", "lineweight": 35}

    # Outer border
    msp.add_lwpolyline(
        [(0, TB_Y), (W, TB_Y), (W, TB_Y + TB_H), (0, TB_Y + TB_H)],
        close=True, dxfattribs=tb_lw,
    )

    # Header stripe
    HEADER_H = 600
    msp.add_lwpolyline(
        [(0, TB_Y + TB_H - HEADER_H), (W, TB_Y + TB_H - HEADER_H)],
        dxfattribs=tb_lw,
    )
    # Company / project name
    msp.add_text(
        "VASTU ARCHITECT AI  ·  AI-POWERED FLOOR PLAN",
        dxfattribs={"layer": "A-TITLEBLK", "height": 280,
                    "insert": (W / 2, TB_Y + TB_H - HEADER_H / 2)},
    ).set_placement((W / 2, TB_Y + TB_H - HEADER_H / 2),
                    align=TextEntityAlignment.MIDDLE_CENTER)

    # Two columns: left = project info, right = drawing info
    BODY_Y  = TB_Y + TB_H - HEADER_H
    COL_DIV = W * 0.55
    msp.add_line((COL_DIV, BODY_Y), (COL_DIV, TB_Y), dxfattribs=tb_lw)

    row_h = (TB_H - HEADER_H) / 5
    left_fields = [
        ("CLIENT",    client_name),
        ("PLOT SIZE", f"{plot_w_m:.1f}m × {plot_d_m:.1f}m"
                      f"  ({meters_to_feet_inches(plot_w_m)} × {meters_to_feet_inches(plot_d_m)})"),
        ("SCALE",     "1:100"),
        ("STYLE",     "Vastu Shastra Compliant"),
        ("ENGINE",    "Vastu Architect AI — Demo Mode"),
    ]
    right_fields = [
        ("DRAWING NO",  "VA-001"),
        ("DATE",        datetime.now().strftime("%d %b %Y")),
        ("DRAWN BY",    "Vastu Architect AI"),
        ("CHECKED BY",  "—"),
        ("REVISION",    "A"),
    ]

    label_h = 130
    value_h = 200
    pad = 120   # left padding

    for i, (label, value) in enumerate(left_fields):
        row_y = BODY_Y - (i + 0.5) * row_h
        if i > 0:
            msp.add_line((0, BODY_Y - i * row_h), (COL_DIV, BODY_Y - i * row_h),
                         dxfattribs=tb_lw)
        msp.add_text(label, dxfattribs={"layer": "A-AREA", "height": label_h,
                     "insert": (pad, row_y + value_h * 0.5)})
        t = msp.add_text(value, dxfattribs={"layer": "A-TITLEBLK",
                         "height": value_h, "insert": (pad, row_y - value_h * 0.1)})

    for i, (label, value) in enumerate(right_fields):
        row_y = BODY_Y - (i + 0.5) * row_h
        if i > 0:
            msp.add_line((COL_DIV, BODY_Y - i * row_h), (W, BODY_Y - i * row_h),
                         dxfattribs=tb_lw)
        msp.add_text(label, dxfattribs={"layer": "A-AREA", "height": label_h,
                     "insert": (COL_DIV + pad, row_y + value_h * 0.5)})
        msp.add_text(value, dxfattribs={"layer": "A-TITLEBLK",
                     "height": value_h,
                     "insert": (COL_DIV + pad, row_y - value_h * 0.1)})

    # ── Serialize ──────────────────────────────────────────────────────
    sio = StringIO()
    doc.write(sio)
    sio.seek(0)
    return sio.read().encode("utf-8")
