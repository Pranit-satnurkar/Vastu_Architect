import ezdxf
from ezdxf import units
import datetime
import io
import math

# --- CLEAN DXF GENERATOR ---


def generate_clean_dxf(rooms_data, plot_w, plot_d, client_name="Client"):
    """
    Generate clean DXF from rooms_data JSON.
    rooms_data is the same list sent to frontend:
    [{'name': str, 'x': float, 'y': float, 
      'width': float, 'height': float, 'zone': str}]

    NO Shapely. NO polygon conversion.
    Clean rectangles directly from x,y,w,h values.
    """

    doc = ezdxf.new(dxfversion='R2010')
    doc.units = units.M  # Meters
    msp = doc.modelspace()

    # ── LAYERS ──────────────────────────────────────────
    doc.layers.add('A-WALL',      color=7,  lineweight=50)
    doc.layers.add('A-WALL-PLOT', color=7,  lineweight=70)
    doc.layers.add('A-ANNO-TEXT', color=2,  lineweight=13)
    doc.layers.add('A-ANNO-DIMS', color=3,  lineweight=13)
    doc.layers.add('A-GRID',      color=8,  lineweight=9)
    doc.layers.add('A-AREA',      color=5,  lineweight=13)
    doc.layers.add('A-TITLEBLK',  color=7,  lineweight=25)

    # ── GRID (background reference) ──────────────────────
    grid_spacing = 1.0  # 1 meter grid
    for gx in range(int(plot_w) + 1):
        msp.add_line(
            (gx, 0), (gx, plot_d),
            dxfattribs={'layer': 'A-GRID'}
        )
    for gy in range(int(plot_d) + 1):
        msp.add_line(
            (0, gy), (plot_w, gy),
            dxfattribs={'layer': 'A-GRID'}
        )

    # ── PLOT BOUNDARY ────────────────────────────────────
    plot_pts = [
        (0,      0),
        (plot_w, 0),
        (plot_w, plot_d),
        (0,      plot_d),
        (0,      0)
    ]
    msp.add_lwpolyline(
        plot_pts,
        dxfattribs={
            'layer': 'A-WALL-PLOT',
            'lineweight': 70,
            'closed': True
        }
    )

    # ── NORTH ARROW ──────────────────────────────────────
    arrow_x = plot_w + 0.5
    arrow_y = plot_d - 1.0
    msp.add_line(
        (arrow_x, arrow_y),
        (arrow_x, arrow_y + 1.0),
        dxfattribs={'layer': 'A-ANNO-TEXT'}
    )
    msp.add_text(
        'N',
        dxfattribs={
            'layer': 'A-ANNO-TEXT',
            'height': 0.3,
            'insert': (arrow_x - 0.1, arrow_y + 1.1),
        }
    )

    # ── ROOMS ────────────────────────────────────────────
    for room in rooms_data:
        # Get coordinates — round to 3 decimal places
        x = round(float(room['x']), 3)
        y = round(float(room['y']), 3)
        w = round(float(room['width']), 3)
        h = round(float(room['height']), 3)
        name = room['name']
        zone = room.get('zone', '')

        # Validate — skip invalid rooms
        if w <= 0 or h <= 0:
            continue
        if x < -0.01 or y < -0.01:
            continue
        if x + w > plot_w + 0.1 or y + h > plot_d + 0.1:
            continue

        # Clamp to plot bounds
        x = max(0.0, x)
        y = max(0.0, y)
        w = min(w, plot_w - x)
        h = min(h, plot_d - y)

        # Flip Y axis — DXF origin is bottom-left, Konva is top-left
        dxf_y = round(plot_d - y - h, 3)

        # Room boundary as closed polyline
        room_pts = [
            (x,     dxf_y),
            (x + w, dxf_y),
            (x + w, dxf_y + h),
            (x,     dxf_y + h),
        ]
        msp.add_lwpolyline(
            room_pts,
            dxfattribs={
                'layer': 'A-WALL',
                'lineweight': 50,
                'closed': True
            }
        )

        # Room name — centered
        msp.add_mtext(
            name,
            dxfattribs={
                'layer': 'A-ANNO-TEXT',
                'char_height': 0.22,
                'insert': (x + w/2, dxf_y + h/2 + 0.15),
                'attachment_point': 5,  # Middle center
                'width': w * 0.9,
            }
        )

        # Room dimensions below name
        dim_text = f'{w:.1f}m x {h:.1f}m'
        msp.add_mtext(
            dim_text,
            dxfattribs={
                'layer': 'A-ANNO-DIMS',
                'char_height': 0.16,
                'insert': (x + w/2, dxf_y + h/2 - 0.1),
                'attachment_point': 5,
                'width': w * 0.9,
            }
        )

        # Zone label small — bottom right of room
        if zone:
            msp.add_text(
                zone,
                dxfattribs={
                    'layer': 'A-AREA',
                    'height': 0.14,
                    'insert': (x + w - 0.2, dxf_y + 0.1),
                }
            )

        # Linear dimensions on room edges
        try:
            # Width dimension below room
            msp.add_linear_dim(
                base=(x, dxf_y - 0.4),
                p1=(x, dxf_y),
                p2=(x + w, dxf_y),
                dxfattribs={'layer': 'A-ANNO-DIMS'}
            ).render()

            # Height dimension right of room
            msp.add_linear_dim(
                base=(x + w + 0.4, dxf_y),
                p1=(x + w, dxf_y),
                p2=(x + w, dxf_y + h),
                angle=90,
                dxfattribs={'layer': 'A-ANNO-DIMS'}
            ).render()
        except Exception:
            pass  # Skip dimension if it fails

    # ── TITLE BLOCK ──────────────────────────────────────
    tb_y = -2.5

    # Title block border
    msp.add_lwpolyline(
        [(0, tb_y), (plot_w, tb_y),
         (plot_w, tb_y - 2.5), (0, tb_y - 2.5), (0, tb_y)],
        dxfattribs={'layer': 'A-TITLEBLK', 'closed': True}
    )

    # Title
    msp.add_text(
        'VASTU ARCHITECT AI — FLOOR PLAN',
        dxfattribs={
            'layer': 'A-TITLEBLK',
            'height': 0.35,
            'insert': (0.3, tb_y - 0.5),
        }
    )

    # Client name
    msp.add_text(
        f'Client: {client_name}',
        dxfattribs={
            'layer': 'A-TITLEBLK',
            'height': 0.22,
            'insert': (0.3, tb_y - 1.0),
        }
    )

    # Plot info
    msp.add_text(
        f'Plot Size: {plot_w}m x {plot_d}m  |  Area: {plot_w * plot_d:.0f} sqm',
        dxfattribs={
            'layer': 'A-TITLEBLK',
            'height': 0.22,
            'insert': (0.3, tb_y - 1.4),
        }
    )

    # Scale and date
    msp.add_text(
        f'Scale: 1:100  |  Date: {datetime.date.today().strftime("%d %b %Y")}',
        dxfattribs={
            'layer': 'A-TITLEBLK',
            'height': 0.18,
            'insert': (0.3, tb_y - 1.8),
        }
    )

    # Disclaimer
    msp.add_text(
        'Generated by Vastu Architect AI — pranit-vision.vercel.app',
        dxfattribs={
            'layer': 'A-TITLEBLK',
            'height': 0.16,
            'insert': (0.3, tb_y - 2.2),
        }
    )

    # Write to bytes
    stream = io.BytesIO()
    doc.write(stream)
    return stream.getvalue()
