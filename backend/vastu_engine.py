import ezdxf
from ezdxf.enums import TextEntityAlignment
import math
import io
import os
import tempfile

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
        ("A-ANNO-NRTH",  2, "CONTINUOUS", 18)  # Yellow
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


def generate_dxf_from_template_rooms(rooms, plot_w, plot_d, client_name):
    """
    Generates a professional DXF from the template room dicts
    (name, x, y, w, h, door, window).  Used by the FastAPI /generate-dxf endpoint.
    Doors and windows from template metadata are correctly drawn in the output.
    """
    doc = ezdxf.new(dxfversion='R2010')
    doc.header['$INSUNITS'] = 4
    setup_layers(doc)
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

    # Draw all segments
    for seg, info in seg_map.items():
        draw_wall_with_openings(msp, seg[0], seg[1], WALL_T, info['offset_dir'], info['openings'])

    # Room name annotations
    for room in rooms:
        cx = room['x'] + room['w'] / 2
        cy = room['y'] + room['h'] / 2
        font_h = min(room['w'], room['h']) * 0.08
        msp.add_text(
            room['name'], height=font_h,
            dxfattribs={'layer': 'A-ANNO-TEXT'}
        ).set_placement((cx, cy), align=TextEntityAlignment.MIDDLE_CENTER)

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
