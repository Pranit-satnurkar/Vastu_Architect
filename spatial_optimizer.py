import networkx as nx
from shapely.geometry import Polygon, Point, box
from shapely import affinity
import random
import math

# --- 1. DATA MODELS ---

class Room:
    def __init__(self, name, min_dim, max_dim, priority=1, layer="A-WALL"):
        self.name = name
        self.min_w, self.min_d = min_dim
        self.max_w, self.max_d = max_dim
        self.priority = priority  # 1 (Critical) to 5 (Optional)
        self.layer = layer
        self.current_poly = None  # Shapely Polygon
        self.center = None        # (x, y) tuple

class VastuConstraint:
    def __init__(self, room_name, allowed_quadrants, forbidden_quadrants=[]):
        self.room_name = room_name
        self.allowed = allowed_quadrants  # ["NE", "SW", etc.]
        self.forbidden = forbidden_quadrants


# --- 2. ZONING LOGIC (Vastu Purusha Mandala) ---

def get_quadrant_centers(plot_width, plot_depth):
    """
    Divides plot into 3x3 grid (9 zones).
    Returns a dict of { 'NE': (x,y), ... }
    """
    w_step = plot_width / 3
    d_step = plot_depth / 3
    
    zones = {
        "SW": (w_step * 0.5, d_step * 0.5),
        "S":  (w_step * 1.5, d_step * 0.5),
        "SE": (w_step * 2.5, d_step * 0.5),
        
        "W":  (w_step * 0.5, d_step * 1.5),
        "C":  (w_step * 1.5, d_step * 1.5), # Brahmasthan
        "E":  (w_step * 2.5, d_step * 1.5),
        
        "NW": (w_step * 0.5, d_step * 2.5),
        "N":  (w_step * 1.5, d_step * 2.5),
        "NE": (w_step * 2.5, d_step * 2.5),
    }
    return zones

# --- 3. SPATIAL OPTIMIZER (The Brain) ---

def generate_layout(plot_size, requirements, constraints):
    """
    Generates a layout with proportional width sizing and Open Area filling.
    """
    p_w, p_d = plot_size
    placed_rooms = []
    
    # 1. Classification (Top vs Bottom)
    top_rooms = []
    bottom_rooms = []
    
    for room in requirements:
        name = room.name.lower()
        if "living" in name or "hall" in name or "toilet" in name or "bath" in name or "north" in name or "nw" in name or "ne" in name:
            top_rooms.append(room)
        else:
            bottom_rooms.append(room)

    # 2. Sort order (Left to Right)
    def sort_key(r):
        n = r.name.lower()
        if "toilet" in n: return 0
        if "living" in n: return 1
        if "master" in n: return 0
        if "kitchen" in n: return 1
        return 2
        
    top_rooms.sort(key=sort_key)
    bottom_rooms.sort(key=sort_key)

    # 3. Calculate Heights Proportionally to fill total Plot Depth
    avg_d_top = sum([(r.min_d + r.max_d)/2 for r in top_rooms]) / len(top_rooms) if top_rooms else 0
    avg_d_bottom = sum([(r.min_d + r.max_d)/2 for r in bottom_rooms]) / len(bottom_rooms) if bottom_rooms else 0
    
    total_avg_d = avg_d_top + avg_d_bottom
    if total_avg_d == 0: total_avg_d = 1 # avoid div/0
    
    # Scale row heights to exactly fill Plot Depth
    h_top = (avg_d_top / total_avg_d) * p_d
    h_bottom = p_d - h_top # Entire plot depth is now covered
        
    # --- Process Bottom Row (anchored to y=0) ---
    current_x = 0
    total_w_bottom = sum([(r.min_w + r.max_w)/2 for r in bottom_rooms]) if bottom_rooms else 1
    
    for i, room in enumerate(bottom_rooms):
        w_req = (room.min_w + room.max_w)/2
        render_w = (w_req / total_w_bottom) * p_w
        
        # Snap last room to full plot width to avoid rounding gaps
        end_x = current_x + render_w
        if i == len(bottom_rooms) - 1:
            end_x = p_w
            
        poly = box(current_x, 0, end_x, h_bottom)
        room.current_poly = poly
        room.center = (poly.centroid.x, poly.centroid.y)
        placed_rooms.append(room)
        current_x = end_x
        
    # --- Process Top Row (anchored to y=p_d) ---
    current_x = 0
    total_w_top = sum([(r.min_w + r.max_w)/2 for r in top_rooms]) if top_rooms else 1
    
    for i, room in enumerate(top_rooms):
        w_req = (room.min_w + room.max_w)/2
        render_w = (w_req / total_w_top) * p_w
        
        # Snap last room to full plot width
        end_x = current_x + render_w
        if i == len(top_rooms) - 1:
            end_x = p_w
            
        # Anchored to Top, starting exactly where bottom row ends
        poly = box(current_x, h_bottom, end_x, p_d)
        room.current_poly = poly
        room.center = (poly.centroid.x, poly.centroid.y)
        placed_rooms.append(room)
        current_x = end_x

    return placed_rooms

# --- 4. DXF CONVERSION UTILS ---

def get_walls_from_rooms(rooms):
    """
    Extracts shared walls and outer boundaries.
    Returns: List of line segments [(x1,y1,x2,y2), ...]
    """
    # This is complex in Shapely.
    # Simplified: Just return the boundary lines of each room
    lines = []
    for r in rooms:
        x, y = r.current_poly.exterior.coords.xy
        for i in range(len(x)-1):
            lines.append(((x[i], y[i]), (x[i+1], y[i+1])))
    return lines
