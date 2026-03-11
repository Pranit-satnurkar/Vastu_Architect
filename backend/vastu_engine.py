import ezdxf
from ezdxf.enums import TextEntityAlignment
import math
import io
import os
import tempfile
from datetime import date

# --- 1. CONFIGURATION & LAYERS ---

def setup_layers(doc):
    """Creates AIA National CAD Standard layers with precise properties."""
    # Lineweights are in 0.01mm units (50 = 0.50mm)
    layers = [
        ("A-WALL",       7, "CONTINUOUS", 50), # White, 0.50mm
        ("A-WALL-PATT",  8, "CONTINUOUS", 15), # Grey, 0.15mm
        ("A-DOOR",       4, "CONTINUOUS", 25), # Cyan, 0.25mm
        ("A-DOOR-SWING", 3, "DASHED",     13), # Green, 0.13mm
        ("A-GLAZ",       4, "CONTINUOUS", 25), # Cyan, 0.25mm
        ("A-ANNO-DIMS",  6, "CONTINUOUS", 15), # Magenta, 0.15mm
        ("A-ANNO-TEXT",  2, "CONTINUOUS", 18), # Yellow, 0.18mm
        ("A-ANNO-NRTH",  2, "CONTINUOUS", 18), # Yellow
        ("A-DOOR-ENTR",  1, "CONTINUOUS", 35), # Red, 0.35mm — entrance marker
    ]
    for name, color, ltype, lweight in layers:
        if name not in doc.layers:
            doc.layers.add(name, color=color, linetype=ltype, lineweight=lweight)

# --- 2. DRAFTING TOOLS ---

def draw_wall_with_hatch(msp, p1, p2, thickness, offset_dir=None):
    """Draws two lines and an ANSI31 hatch between them on AIA layers."""
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    L = math.sqrt(dx**2 + dy**2)
    if L < 0.001: return
    ux, uy = dx/L, dy/L
    nx, ny = -uy, ux
    
    if offset_dir is None: # Centered (Interior)
        o1 = (p1[0] + nx*thickness/2, p1[1] + ny*thickness/2)
        o2 = (p2[0] + nx*thickness/2, p2[1] + ny*thickness/2)
        i1 = (p1[0] - nx*thickness/2, p1[1] - ny*thickness/2)
        i2 = (p2[0] - nx*thickness/2, p2[1] - ny*thickness/2)
    else: # Directional (Exterior)
        o1, o2 = p1, p2
        i1 = (p1[0] + offset_dir[0]*thickness, p1[1] + offset_dir[1]*thickness)
        i2 = (p2[0] + offset_dir[0]*thickness, p2[1] + offset_dir[1]*thickness)

    msp.add_line(o1, o2, dxfattribs={'layer': 'A-WALL'})
    msp.add_line(i1, i2, dxfattribs={'layer': 'A-WALL'})
    
    hatch = msp.add_hatch(dxfattribs={'layer': 'A-WALL-PATT'})
    hatch.set_pattern_fill('ANSI31', scale=0.01)
    hatch.paths.add_polyline_path([o1, o2, i2, i1, o1])

def add_door_swing(msp, p1, p2, width=0.9):
    """Adds a door opening and dashed arc swing."""
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    L = math.sqrt(dx**2 + dy**2)
    if L < width + 0.2: return False
    
    mx, my = (p1[0]+p2[0])/2, (p1[1]+p2[1])/2
    ux, uy = dx/L, dy/L
    p_start = (mx - ux*width/2, my - uy*width/2)
    
    nx, ny = -uy, ux
    leaf_end = (p_start[0] + nx*width, p_start[1] + ny*width)
    
    # Door frame/leaf on A-DOOR
    msp.add_line(p_start, leaf_end, dxfattribs={'layer': 'A-DOOR'})
    
    # Dashed swing arc on A-DOOR-SWING
    angle_leaf = math.degrees(math.atan2(ny, nx))
    angle_open = math.degrees(math.atan2(uy, ux))
    msp.add_arc(p_start, radius=width, start_angle=angle_open, end_angle=angle_leaf, 
                dxfattribs={'layer': 'A-DOOR-SWING', 'linetype': 'DASHED'})
    return True


def _draw_door_in_gap(msp, gap_start, gap_end):
    """Draws a door leaf and 90° arc swing directly within a pre-measured gap."""
    dx, dy = gap_end[0]-gap_start[0], gap_end[1]-gap_start[1]
    L = math.sqrt(dx**2 + dy**2)
    if L < 0.1: return
    ux, uy = dx/L, dy/L
    nx, ny = -uy, ux  # 90° CCW normal (inward side for S/W/E walls)

    leaf_end = (gap_start[0] + nx*L, gap_start[1] + ny*L)
    msp.add_line(gap_start, leaf_end, dxfattribs={'layer': 'A-DOOR'})

    angle_open = math.degrees(math.atan2(uy, ux))
    angle_leaf = math.degrees(math.atan2(ny, nx))
    msp.add_arc(gap_start, radius=L, start_angle=angle_open, end_angle=angle_leaf,
                dxfattribs={'layer': 'A-DOOR-SWING', 'linetype': 'DASHED'})


def draw_entrance_marker(msp, gap_start, gap_end, offset_dir):
    """
    Draws a main-entrance marker for a door on an exterior wall:
      - A bold threshold line across the outer face of the opening
      - A small filled inward-pointing arrow at the midpoint
      - An "ENTRY" text label outside the building
    Called in addition to the door swing when the wall is exterior (offset_dir != None).
    """
    LA = {'layer': 'A-DOOR-ENTR'}
    ARROW = 0.28    # arrow size in metres
    TEXT_OFFSET = 0.55  # distance outside wall for "ENTRY" label

    # Threshold line across the full opening on the outer face
    msp.add_line(gap_start, gap_end, dxfattribs={**LA, 'lineweight': 35})

    # Midpoint on the outer face
    mx = (gap_start[0] + gap_end[0]) / 2
    my = (gap_start[1] + gap_end[1]) / 2
    ox, oy = offset_dir  # inward direction

    # Filled arrow: tip points inward, base spans perpendicular to wall
    tip = (mx + ox * ARROW, my + oy * ARROW)
    gdx = gap_end[0] - gap_start[0]
    gdy = gap_end[1] - gap_start[1]
    gL = math.sqrt(gdx**2 + gdy**2)
    if gL > 0.01:
        px, py = gdx / gL * ARROW * 0.4, gdy / gL * ARROW * 0.4  # half-base
        base_l = (mx - px, my - py)
        base_r = (mx + px, my + py)
        msp.add_solid([tip, base_l, base_r, tip], dxfattribs=LA)

    # "ENTRY" text placed outside the building
    tx = mx - ox * TEXT_OFFSET
    ty = my - oy * TEXT_OFFSET
    msp.add_text("ENTRY", height=0.30, dxfattribs=LA).set_placement(
        (tx, ty), align=TextEntityAlignment.MIDDLE_CENTER)


def draw_window_glazing(msp, gap_start, gap_end, thickness, offset_dir):
    """Draws two parallel glazing lines representing a window pane."""
    gdx, gdy = gap_end[0]-gap_start[0], gap_end[1]-gap_start[1]
    gL = math.sqrt(gdx**2 + gdy**2)
    if gL < 0.05: return

    if offset_dir:
        # Exterior wall: glazing at 1/3 and 2/3 depth from outer face
        ox, oy = offset_dir
        t1, t2 = thickness / 3, 2 * thickness / 3
        g1s = (gap_start[0] + ox*t1, gap_start[1] + oy*t1)
        g1e = (gap_end[0]   + ox*t1, gap_end[1]   + oy*t1)
        g2s = (gap_start[0] + ox*t2, gap_start[1] + oy*t2)
        g2e = (gap_end[0]   + ox*t2, gap_end[1]   + oy*t2)
    else:
        # Interior wall: symmetric glazing at ±t/4 from centre line
        gnx, gny = -gdy/gL, gdx/gL
        t_off = thickness / 4
        g1s = (gap_start[0] + gnx*t_off, gap_start[1] + gny*t_off)
        g1e = (gap_end[0]   + gnx*t_off, gap_end[1]   + gny*t_off)
        g2s = (gap_start[0] - gnx*t_off, gap_start[1] - gny*t_off)
        g2e = (gap_end[0]   - gnx*t_off, gap_end[1]   - gny*t_off)

    msp.add_line(g1s, g1e, dxfattribs={'layer': 'A-GLAZ'})
    msp.add_line(g2s, g2e, dxfattribs={'layer': 'A-GLAZ'})


def draw_wall_with_openings(msp, p1, p2, thickness, offset_dir, openings):
    """
    Draws a wall segment with any number of openings (doors/windows).
    openings: list of (opening_type, {"pos": 0-1, "width": metres})
    With 0 openings this is identical to draw_wall_with_hatch.
    """
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    L = math.sqrt(dx**2 + dy**2)
    if L < 0.001: return
    ux, uy = dx/L, dy/L

    # Convert openings to wall-space spans and sort by start position
    spans = []
    for otype, odata in openings:
        centre = odata['pos'] * L
        half_w = odata['width'] / 2
        ostart = max(0.0, centre - half_w)
        oend   = min(L,   centre + half_w)
        spans.append((ostart, oend, otype, odata))
    spans.sort(key=lambda s: s[0])

    prev_end = 0.0
    for ostart, oend, otype, odata in spans:
        # Solid wall before this opening
        if ostart - prev_end > 0.01:
            ep1 = (p1[0] + ux*prev_end, p1[1] + uy*prev_end)
            ep2 = (p1[0] + ux*ostart,   p1[1] + uy*ostart)
            draw_wall_with_hatch(msp, ep1, ep2, thickness, offset_dir)

        gap_s = (p1[0] + ux*ostart, p1[1] + uy*ostart)
        gap_e = (p1[0] + ux*oend,   p1[1] + uy*oend)

        if otype == 'door':
            _draw_door_in_gap(msp, gap_s, gap_e)
        elif otype == 'window':
            draw_window_glazing(msp, gap_s, gap_e, thickness, offset_dir)

        prev_end = oend

    # Remaining wall after last opening
    if L - prev_end > 0.01:
        ep1 = (p1[0] + ux*prev_end, p1[1] + uy*prev_end)
        draw_wall_with_hatch(msp, ep1, p2, thickness, offset_dir)


def _merge_colinear_segments(seg_map, eps=0.005):
    """
    Remove wall segments that are entirely contained within a longer colinear segment
    (e.g. a corridor wall that spans the full room stack on the other side).
    Door/window openings are transferred to the containing segment with recalculated positions.
    Returns the number of segments removed.
    """
    from collections import defaultdict

    v_groups = defaultdict(list)   # x  → [(y1, y2, seg_key)]
    h_groups = defaultdict(list)   # y  → [(x1, x2, seg_key)]

    for seg in list(seg_map.keys()):
        sp1, sp2 = seg
        if abs(sp1[0] - sp2[0]) < eps:     # vertical
            v_groups[round(sp1[0], 3)].append((sp1[1], sp2[1], seg))
        elif abs(sp1[1] - sp2[1]) < eps:   # horizontal
            h_groups[round(sp1[1], 3)].append((sp1[0], sp2[0], seg))

    segs_to_remove = set()

    for group in list(v_groups.values()) + list(h_groups.values()):
        if len(group) <= 1:
            continue
        for (a1, a2, seg_a) in group:
            if seg_a in segs_to_remove:
                continue
            for (b1, b2, seg_b) in group:
                if seg_a is seg_b or seg_b in segs_to_remove:
                    continue
                if b1 <= a1 + eps and b2 >= a2 - eps:   # seg_a contained in seg_b
                    b_len = b2 - b1
                    for otype, odata in seg_map[seg_a]['openings']:
                        a_len = a2 - a1
                        abs_pos = a1 + odata['pos'] * a_len
                        new_pos = (abs_pos - b1) / b_len
                        seg_map[seg_b]['openings'].append(
                            (otype, {'pos': max(0.01, min(0.99, new_pos)),
                                     'width': odata['width']})
                        )
                    segs_to_remove.add(seg_a)
                    break

    for seg in segs_to_remove:
        del seg_map[seg]
    return len(segs_to_remove)


def _clean_tjunctions(seg_map, wall_t, eps=0.005):
    """
    Trim wall segment endpoints at T-junctions by WALL_T/2 so perpendicular walls
    meet cleanly without hatch overlap.
    Convention: each wall's endpoint that falls exactly on a perpendicular wall's
    centerline is pulled back by half the wall thickness.
    Opening positions are recalculated after trimming.
    """
    HALF_T = wall_t / 2

    h_ys = set()
    v_xs = set()
    for seg in seg_map:
        sp1, sp2 = seg
        if abs(sp1[1] - sp2[1]) < eps:
            h_ys.add(round(sp1[1], 3))
        elif abs(sp1[0] - sp2[0]) < eps:
            v_xs.add(round(sp1[0], 3))

    for seg, info in seg_map.items():
        sp1, sp2 = seg
        p1x, p1y = sp1
        p2x, p2y = sp2
        original_len = math.dist(sp1, sp2)

        if abs(sp1[1] - sp2[1]) < eps:    # horizontal wall — trim x endpoints
            if round(p1x, 3) in v_xs:
                p1x += HALF_T
            if round(p2x, 3) in v_xs:
                p2x -= HALF_T
        elif abs(sp1[0] - sp2[0]) < eps:  # vertical wall — trim y endpoints
            if round(p1y, 3) in h_ys:
                p1y += HALF_T
            if round(p2y, 3) in h_ys:
                p2y -= HALF_T

        new_p1, new_p2 = (p1x, p1y), (p2x, p2y)
        if new_p1 == sp1 and new_p2 == sp2:
            continue

        new_len = math.dist(new_p1, new_p2)
        if new_len < 0.01:
            continue  # wall trimmed to nothing (degenerate case)

        trim_start = math.dist(sp1, new_p1)   # how far p1 moved inward

        adjusted = []
        for otype, odata in info['openings']:
            abs_pos = odata['pos'] * original_len
            new_pos = (abs_pos - trim_start) / new_len
            adjusted.append((otype, {'pos': max(0.01, min(0.99, new_pos)),
                                     'width': odata['width']}))
        info['openings'] = adjusted
        info['draw_p1'] = new_p1
        info['draw_p2'] = new_p2


def _setup_dimstyle(doc):
    """Creates a named architectural dimension style for floor plans."""
    if 'VASTU_DIM' not in doc.dimstyles:
        doc.dimstyles.new('VASTU_DIM', dxfattribs={
            'dimtxt':  0.35,   # text height (metres)
            'dimasz':  0.18,   # arrowhead size
            'dimexe':  0.10,   # extension line overshoot
            'dimexo':  0.08,   # extension line offset from origin
            'dimgap':  0.08,   # gap between dim line and text
            'dimdec':  2,      # decimal places
            'dimclrd': 6,      # dim line colour  (magenta)
            'dimclre': 6,      # ext line colour
            'dimclrt': 6,      # text colour
        })


def _add_dimension_chains(msp, rooms, plot_w, plot_d, eps):
    """
    Adds two dimension chains on the south and west sides of the plan.
      Chain 1 (1.2 m out): individual room widths / depths for edge rooms.
      Chain 2 (2.2 m out): overall plot width / depth.
    """
    DIM1, DIM2 = 1.2, 2.2
    DS = 'VASTU_DIM'
    LA = {'layer': 'A-ANNO-DIMS'}

    # ── South edge: horizontal dimensions ─────────────────────────────────
    south = sorted([r for r in rooms if r['y'] <= eps], key=lambda r: r['x'])
    for r in south:
        x1, x2 = r['x'], r['x'] + r['w']
        bx = (x1 + x2) / 2
        d = msp.add_linear_dim(base=(bx, -DIM1), p1=(x1, 0), p2=(x2, 0),
                               angle=0, dimstyle=DS, dxfattribs=LA)
        d.render()

    # Overall plot width
    d = msp.add_linear_dim(base=(plot_w / 2, -DIM2), p1=(0, 0), p2=(plot_w, 0),
                           angle=0, dimstyle=DS, dxfattribs=LA)
    d.render()

    # ── West edge: vertical dimensions ────────────────────────────────────
    west = sorted([r for r in rooms if r['x'] <= eps], key=lambda r: r['y'])
    for r in west:
        y1, y2 = r['y'], r['y'] + r['h']
        by = (y1 + y2) / 2
        d = msp.add_linear_dim(base=(-DIM1, by), p1=(0, y1), p2=(0, y2),
                               angle=90, dimstyle=DS, dxfattribs=LA)
        d.render()

    # Overall plot depth
    d = msp.add_linear_dim(base=(-DIM2, plot_d / 2), p1=(0, 0), p2=(0, plot_d),
                           angle=90, dimstyle=DS, dxfattribs=LA)
    d.render()


def _draw_title_block(msp, plot_w, plot_d, bhk_type, client_name):
    """
    Draws a simple title block to the right of the floor plan.
    Placed at x = plot_w + 3.5 to clear the north arrow.
    """
    TB_X  = plot_w + 3.5
    TB_W  = 6.0
    TB_H  = plot_d
    LA_T  = {'layer': 'A-ANNO-TEXT'}
    LA_D  = {'layer': 'A-ANNO-DIMS'}

    rows = [
        ("PROJECT",  "Vastu Architect AI"),
        ("CLIENT",   client_name),
        ("TYPE",     bhk_type),
        ("PLOT",     f"{plot_w:.2f} \u00d7 {plot_d:.2f} m"),
        ("SCALE",    "1 : 100"),
        ("DATE",     date.today().strftime("%d-%b-%Y")),
        ("DRAWN BY", "AI Generated"),
    ]

    row_h = TB_H / len(rows)

    # Outer border
    border = [(TB_X, 0), (TB_X + TB_W, 0),
              (TB_X + TB_W, TB_H), (TB_X, TB_H), (TB_X, 0)]
    msp.add_lwpolyline(border, dxfattribs={**LA_T, 'lineweight': 50})

    for i, (label, value) in enumerate(rows):
        y_top = TB_H - i * row_h
        y_mid = y_top - row_h / 2

        # Row separator
        if i > 0:
            msp.add_line((TB_X, y_top), (TB_X + TB_W, y_top), dxfattribs=LA_D)

        # Vertical split between label and value
        x_split = TB_X + 1.8
        msp.add_line((x_split, y_top), (x_split, y_top - row_h), dxfattribs=LA_D)

        # Label (small, left column)
        msp.add_text(label, height=0.25, dxfattribs=LA_D).set_placement(
            (TB_X + 0.15, y_mid), align=TextEntityAlignment.MIDDLE_LEFT)

        # Value (larger, right column)
        msp.add_text(value, height=0.38, dxfattribs=LA_T).set_placement(
            ((x_split + TB_X + TB_W) / 2, y_mid), align=TextEntityAlignment.MIDDLE_CENTER)


def generate_dxf_from_template_rooms(rooms, plot_w, plot_d, client_name, bhk_type=""):
    """
    Generates a professional DXF from the template room dicts
    (name, x, y, w, h, door, window).  Used by the FastAPI /generate-dxf endpoint.
    Includes doors, windows, dimension chains, area annotations, and a title block.
    """
    doc = ezdxf.new(dxfversion='R2010')
    doc.header['$INSUNITS'] = 4
    setup_layers(doc)
    _setup_dimstyle(doc)
    msp = doc.modelspace()

    WALL_T = 0.23
    EPS = 0.02

    def _wall_pts(room, wall_id):
        x, y, w, h = room['x'], room['y'], room['w'], room['h']
        return {'S': ((x, y), (x+w, y)),
                'N': ((x, y+h), (x+w, y+h)),
                'W': ((x, y), (x, y+h)),
                'E': ((x+w, y), (x+w, y+h))}[wall_id]

    # Collect all wall segments with exterior/interior status and openings
    seg_map = {}  # normalised_seg -> {offset_dir, openings: list}

    for room in rooms:
        for wall_id in ('S', 'N', 'W', 'E'):
            p1, p2 = _wall_pts(room, wall_id)
            seg = tuple(sorted([
                (round(p1[0], 3), round(p1[1], 3)),
                (round(p2[0], 3), round(p2[1], 3))
            ]))

            # Determine exterior offset direction
            sp1, sp2 = seg
            offset_dir = None
            if abs(sp1[0]) <= EPS and abs(sp2[0]) <= EPS:
                offset_dir = (1, 0)   # West wall → inward = right
            elif abs(sp1[0] - plot_w) <= EPS and abs(sp2[0] - plot_w) <= EPS:
                offset_dir = (-1, 0)  # East wall → inward = left
            elif abs(sp1[1]) <= EPS and abs(sp2[1]) <= EPS:
                offset_dir = (0, 1)   # South wall → inward = up
            elif abs(sp1[1] - plot_d) <= EPS and abs(sp2[1] - plot_d) <= EPS:
                offset_dir = (0, -1)  # North wall → inward = down

            if seg not in seg_map:
                seg_map[seg] = {'offset_dir': offset_dir, 'openings': []}
            elif offset_dir is not None:
                # Exterior status takes priority if seen from another room
                seg_map[seg]['offset_dir'] = offset_dir

            # Attach door/window from this room (first claim per type wins)
            existing_types = {o[0] for o in seg_map[seg]['openings']}
            if room.get('door') and room['door']['wall'] == wall_id and 'door' not in existing_types:
                seg_map[seg]['openings'].append(
                    ('door', {'pos': room['door']['pos'], 'width': room['door']['width']})
                )
            if room.get('window') and room['window']['wall'] == wall_id and 'window' not in existing_types:
                seg_map[seg]['openings'].append(
                    ('window', {'pos': room['window']['pos'], 'width': room['window']['width']})
                )

    # Clean up geometry before drawing
    _merge_colinear_segments(seg_map)
    _clean_tjunctions(seg_map, WALL_T)

    # Draw all segments (use trimmed endpoints if set)
    for seg, info in seg_map.items():
        p1 = info.get('draw_p1', seg[0])
        p2 = info.get('draw_p2', seg[1])
        draw_wall_with_openings(msp, p1, p2, WALL_T, info['offset_dir'], info['openings'])

    # Entrance marker on the Living Room door
    # inward_dir = direction FROM the arrival side INTO the room
    _WALL_INWARD = {'N': (0, -1), 'S': (0, 1), 'E': (-1, 0), 'W': (1, 0)}
    for room in rooms:
        if 'living' in room['name'].lower() and room.get('door'):
            d = room['door']
            wid = d['wall']
            x, y, w, h = room['x'], room['y'], room['w'], room['h']
            wall_pts_map = {
                'S': ((x, y),       (x+w, y)),
                'N': ((x, y+h),     (x+w, y+h)),
                'W': ((x, y),       (x,   y+h)),
                'E': ((x+w, y),     (x+w, y+h)),
            }
            wp1, wp2 = wall_pts_map[wid]
            wdx, wdy = wp2[0]-wp1[0], wp2[1]-wp1[1]
            wL = math.sqrt(wdx**2 + wdy**2)
            ux, uy = wdx/wL, wdy/wL
            cen = d['pos'] * wL
            hw  = d['width'] / 2
            gap_s = (wp1[0] + ux*(cen-hw), wp1[1] + uy*(cen-hw))
            gap_e = (wp1[0] + ux*(cen+hw), wp1[1] + uy*(cen+hw))
            draw_entrance_marker(msp, gap_s, gap_e, _WALL_INWARD[wid])
            break

    # Room name + area annotations
    for room in rooms:
        cx = room['x'] + room['w'] / 2
        cy = room['y'] + room['h'] / 2
        font_h = min(room['w'], room['h']) * 0.08
        font_h = max(font_h, 0.15)  # floor so tiny rooms stay legible

        msp.add_text(
            room['name'], height=font_h,
            dxfattribs={'layer': 'A-ANNO-TEXT'}
        ).set_placement((cx, cy + font_h * 0.7), align=TextEntityAlignment.MIDDLE_CENTER)

        area = round(room['w'] * room['h'], 2)
        area_label = f"{room['w']:.1f}\u00d7{room['h']:.1f}m  ({area:.1f}m\u00b2)"
        msp.add_text(
            area_label, height=font_h * 0.65,
            dxfattribs={'layer': 'A-ANNO-DIMS'}
        ).set_placement((cx, cy - font_h * 0.5), align=TextEntityAlignment.MIDDLE_CENTER)

    _add_dimension_chains(msp, rooms, plot_w, plot_d, EPS)
    _draw_title_block(msp, plot_w, plot_d, bhk_type, client_name)
    draw_north_arrow(msp, plot_w + 2, plot_d - 1, size=1.5)
    doc.audit()

    temp_path = os.path.join(tempfile.gettempdir(), f"dxf_{client_name}.dxf")
    try:
        doc.saveas(temp_path, encoding='utf-8')
        with open(temp_path, 'rb') as f:
            content = f.read()
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)
    return content


def draw_north_arrow(msp, x, y, size=1.0):
    """Draws a professional North Arrow symbol on A-ANNO-NRTH."""
    dxf_attr = {'layer': 'A-ANNO-NRTH'}
    msp.add_circle((x, y), radius=size/2, dxfattribs=dxf_attr)
    msp.add_text("N", height=size/2, dxfattribs=dxf_attr).set_placement(
        (x, y + size/2 + 0.15), align=TextEntityAlignment.MIDDLE_CENTER)
    arrow_top = (x, y + size/2)
    arrow_left = (x - size/4, y - size/4)
    arrow_right = (x + size/4, y - size/4)
    msp.add_solid([arrow_top, arrow_left, arrow_right], dxfattribs=dxf_attr)

# --- 3. MAIN GENERATION ENGINE ---

def generate_ai_detailed_plan(rooms, plot_width, plot_height, client_name):
    """Generates a professional DXF plan following AIA Standard."""
    doc = ezdxf.new(dxfversion='R2010')
    doc.header['$INSUNITS'] = 4 
    setup_layers(doc)
    msp = doc.modelspace()

    WALL_THICKNESS = 0.23
    drawn_segments = {} # (p1, p2) -> type
    room_segments = {}

    # 1. SEGMENT ANALYSIS
    for room in rooms:
        if not room.current_poly: continue
        points = list(room.current_poly.exterior.coords)
        room_segments[room.name] = []
        
        for i in range(len(points) - 1):
            p1, p2 = points[i], points[i+1]
            seg = tuple(sorted([(round(p1[0], 3), round(p1[1], 3)), (round(p2[0], 3), round(p2[1], 3))]))
            room_segments[room.name].append(seg)
            
            is_ext = False
            if (p1[0] <= 0.01 and p2[0] <= 0.01) or (p1[0] >= plot_width-0.01 and p2[0] >= plot_width-0.01) or \
               (p1[1] <= 0.01 and p2[1] <= 0.01) or (p1[1] >= plot_height-0.01 and p2[1] >= plot_height-0.01):
                is_ext = True
            
            if seg not in drawn_segments:
                drawn_segments[seg] = 'exterior' if is_ext else 'interior'
            elif is_ext: 
                drawn_segments[seg] = 'exterior'

    # 2. DRAW WALLS
    for seg, s_type in drawn_segments.items():
        p1, p2 = seg[0], seg[1]
        if s_type == 'exterior':
            vx, vy = 0, 0
            if p1[0] <= 0.01: vx = 1 
            elif p1[0] >= plot_width-0.01: vx = -1
            elif p1[1] <= 0.01: vy = 1
            elif p1[1] >= plot_height-0.01: vy = -1
            draw_wall_with_hatch(msp, p1, p2, WALL_THICKNESS, offset_dir=(vx, vy))
        else:
            draw_wall_with_hatch(msp, p1, p2, WALL_THICKNESS)

    # 3. INTERIOR DOORS (Exactly one per shared interior segment)
    placed_doors = set()
    for room_name, segments in room_segments.items():
        segments.sort(key=lambda s: math.dist(s[0], s[1]), reverse=True)
        for seg in segments:
            # User Rule: Each wall segment gets exactly ONE door.
            if drawn_segments[seg] == 'interior' and seg not in placed_doors:
                if add_door_swing(msp, seg[0], seg[1], width=0.9):
                    placed_doors.add(seg)
                    break

    # 4. ANNOTATIONS
    for room in rooms:
        if not room.current_poly: continue
        cx, cy = room.center
        minx, miny, maxx, maxy = room.current_poly.bounds
        rw, rd = maxx - minx, maxy - miny
        
        # Room Label on A-ANNO-TEXT
        msp.add_text(room.name, height=min(rw, rd) * 0.08, dxfattribs={'layer': 'A-ANNO-TEXT'}
                    ).set_placement((cx, cy), align=TextEntityAlignment.MIDDLE_CENTER)

        # Dimensions on A-ANNO-DIMS (Fixed 2.5m outside plot)
        # Width @ y=-2.5 (Bottom rooms only)
        if miny <= 0.01:
            msp.add_text(
                f"{rw:.2f}m",
                dxfattribs={'height': 0.4, 'layer': 'A-ANNO-DIMS', 'color': 6}
            ).set_placement((cx, -2.5), align=TextEntityAlignment.MIDDLE_CENTER)
            
        # Depth @ x=-2.5 (Left side rooms only)
        if minx <= 0.01:
            msp.add_text(
                f"{rd:.2f}m",
                dxfattribs={'height': 0.4, 'layer': 'A-ANNO-DIMS', 'color': 6}
            ).set_placement((-2.5, cy), align=TextEntityAlignment.MIDDLE_CENTER)

    draw_north_arrow(msp, plot_width + 2, plot_height - 1, size=1.5)
    doc.audit()

    temp_path = os.path.join(tempfile.gettempdir(), f"temp_{client_name}.dxf")
    try:
        doc.saveas(temp_path, encoding='utf-8')
        with open(temp_path, 'rb') as f:
            dxf_content = f.read()
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)
    return dxf_content
