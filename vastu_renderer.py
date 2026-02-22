import matplotlib.pyplot as plt
import matplotlib.patches as patches
from shapely.geometry import Polygon

def render_preview_plan(rooms, plot_width, plot_height, client_name):
    """
    Renders the optimized layout from Room objects.
    """
    fig, ax = plt.subplots(figsize=(10, 8))
    ax.set_facecolor('#f0f0f0')

    # Draw Plot Boundary
    # plot_rect = patches.Rectangle((0, 0), plot_width, plot_height, linewidth=2, edgecolor='black', facecolor='white')
    # ax.add_patch(plot_rect)
    # Double border fix: We rely on room polygons to define the boundary now.


    # Colors for different room types
    colors = {
        'Living': '#FFD700', 'Kitchen': '#FF6347', 
        'Bedroom': '#87CEEB', 'Toilet': '#D3D3D3',
        'Puja': '#FFDAB9'
    }

    for room in rooms:
        if not room.current_poly:
            continue
            
        # Get coordinates
        x, y = room.current_poly.exterior.coords.xy
        
        # Determine color
        c = colors.get(room.name, '#ADD8E6')
        if "Bed" in room.name: c = colors['Bedroom']
        
        # Draw Polygon
        poly_patch = patches.Polygon(list(zip(x, y)), closed=True,
                                     linewidth=2, edgecolor='black', facecolor=c, alpha=0.7)
        ax.add_patch(poly_patch)
        
        # Add Label
        # Use dynamic centroid in case room.center is stale
        cx, cy = room.current_poly.centroid.x, room.current_poly.centroid.y
        ax.text(cx, cy, room.name, ha='center', va='center', fontsize=9, weight='bold')

    plt.xlim(-1, plot_width + 1)
    plt.ylim(-1, plot_height + 1)
    plt.title(f"AI Vastu Plan: {client_name}", fontsize=14)
    ax.set_aspect('equal')
    
    return fig
