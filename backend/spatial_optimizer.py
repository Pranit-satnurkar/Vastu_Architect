from templates import get_plan

def optimize_layout(bhk_type, plot_w_ft, plot_d_ft,
                    style="modern", user_preferences=None):

  result = get_plan(bhk_type, plot_w_ft, plot_d_ft, style)

  ppm = 20
  for r in result["rooms"]:
    r["x_px"] = round(r["x"] * ppm)
    r["y_px"] = round(r["y"] * ppm)
    r["w_px"] = round(r["w"] * ppm)
    r["h_px"] = round(r["h"] * ppm)

  return result
