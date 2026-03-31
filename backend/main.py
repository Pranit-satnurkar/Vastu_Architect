from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from src.core.spatial_optimizer import optimize_layout
from src.export.vastu_engine import generate_clean_dxf
from src.export.dxf_exporter import generate_professional_dxf

import google.generativeai as genai
import json
import os
import requests as http_requests
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_model = genai.GenerativeModel("gemini-3.1-flash-lite")


def parse_prompt(prompt: str, defaults: dict) -> dict:
    if not prompt.strip():
        return defaults

    try:
        system_instr = """Extract floor plan parameters from user input.
Return ONLY JSON with these fields:
{
  "bhk_type": "1BHK"|"2BHK"|"3BHK"|"4BHK",
  "plot_w_ft": number,
  "plot_d_ft": number,
  "style": "modern"|"traditional"
}
If a field is not mentioned, use the default values provided."""

        user_input = f"Input: {prompt}\nDefaults: {defaults}"

        response = gemini_model.generate_content(
            f"{system_instr}\n\n{user_input}")

        raw = response.text.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"AI Parse Error: {e}")
        return defaults


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlanRequest(BaseModel):
    bhk_type: str = "3BHK"
    plot_w_ft: float = 30.0
    plot_d_ft: float = 50.0
    style: str = "modern"
    prompt: str = ""
    client_name: str = "Client"


class DXFExportRequest(BaseModel):
    rooms: list
    plot_w_m: float
    plot_d_m: float
    client_name: str = "Client"
    unit_system: str = "metric"  # "metric" or "imperial"


# Seasonal fallback weather for Indian cities (March–April averages)
_CITY_FALLBACK = {
    "Delhi":     {"temp_c": 32.0, "humidity": 30, "wind_speed": 3.5, "wind_deg": 270, "description": "Sunny (fallback)"},
    "Mumbai":    {"temp_c": 30.0, "humidity": 70, "wind_speed": 4.0, "wind_deg": 225, "description": "Humid (fallback)"},
    "Bangalore": {"temp_c": 26.0, "humidity": 55, "wind_speed": 2.5, "wind_deg": 180, "description": "Pleasant (fallback)"},
    "Chennai":   {"temp_c": 33.0, "humidity": 65, "wind_speed": 3.0, "wind_deg": 135, "description": "Hot (fallback)"},
    "Kolkata":   {"temp_c": 33.0, "humidity": 60, "wind_speed": 2.0, "wind_deg": 180, "description": "Warm (fallback)"},
    "Hyderabad": {"temp_c": 34.0, "humidity": 35, "wind_speed": 3.0, "wind_deg": 225, "description": "Hot & Dry (fallback)"},
    "Ahmedabad": {"temp_c": 35.0, "humidity": 25, "wind_speed": 4.0, "wind_deg": 270, "description": "Hot & Dry (fallback)"},
    "Pune":      {"temp_c": 30.0, "humidity": 40, "wind_speed": 2.5, "wind_deg": 225, "description": "Warm (fallback)"},
}

_CITY_COORDS = {
    "Delhi":     (28.6139, 77.2090), "Mumbai":    (19.0760, 72.8777),
    "Bangalore": (12.9716, 77.5946), "Chennai":   (13.0827, 80.2707),
    "Kolkata":   (22.5726, 88.3639), "Hyderabad": (17.3850, 78.4867),
    "Ahmedabad": (23.0225, 72.5714), "Pune":      (18.5204, 73.8567),
}


@app.get("/weather")
def get_weather(city: str = "Delhi"):
    api_key = os.getenv("OPENWEATHER_API_KEY", "")
    fallback = _CITY_FALLBACK.get(city, _CITY_FALLBACK["Delhi"])

    if not api_key or api_key == "your_api_key_here":
        return {**fallback, "city": city, "source": "fallback"}

    lat, lon = _CITY_COORDS.get(city, _CITY_COORDS["Delhi"])
    try:
        resp = http_requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric"},
            timeout=5,
        )
        resp.raise_for_status()
        d = resp.json()
        return {
            "city":        city,
            "temp_c":      d["main"]["temp"],
            "feels_like":  d["main"]["feels_like"],
            "humidity":    d["main"]["humidity"],
            "wind_speed":  d["wind"]["speed"],
            "wind_deg":    d["wind"].get("deg", 0),
            "description": d["weather"][0]["description"].title(),
            "source":      "live",
        }
    except Exception:
        return {**fallback, "city": city, "source": "fallback"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Seismic zone data (IS 1893:2016, Bureau of Indian Standards) ──────────────
_SEISMIC_ZONE = {
    "Delhi":     {"zone": "IV",  "risk": "High",      "pga": "0.24g"},
    "Mumbai":    {"zone": "III", "risk": "Moderate",  "pga": "0.16g"},
    "Bangalore": {"zone": "II",  "risk": "Low",       "pga": "0.10g"},
    "Chennai":   {"zone": "III", "risk": "Moderate",  "pga": "0.16g"},
    "Kolkata":   {"zone": "III", "risk": "Moderate",  "pga": "0.16g"},
    "Hyderabad": {"zone": "II",  "risk": "Low",       "pga": "0.10g"},
    "Ahmedabad": {"zone": "III", "risk": "Moderate",  "pga": "0.16g"},
    "Pune":      {"zone": "III", "risk": "Moderate",  "pga": "0.16g"},
}

# Seismic foundation recommendations per zone
_SEISMIC_ADVICE = {
    "II":  "Isolated footings adequate. Standard RCC framing sufficient.",
    "III": "Raft or strip footing recommended. Ductile detailing required for RCC.",
    "IV":  "Raft foundation strongly advised. Full seismic-resistant framing (IS 13920) mandatory.",
    "V":   "Pile/raft foundation only. Strict IS 13920 compliance. Avoid soft soil sites.",
}

# ── Flood risk data (NDMA / CWC published flood-prone areas) ─────────────────
_FLOOD_RISK = {
    "Delhi":     {"level": "High",   "reason": "Yamuna floodplain, monsoon inundation"},
    "Mumbai":    {"level": "High",   "reason": "Coastal city, low-lying areas, heavy monsoon"},
    "Bangalore": {"level": "Low",    "reason": "Elevated plateau, good natural drainage"},
    "Chennai":   {"level": "High",   "reason": "Coastal + Adyar/Cooum river flooding"},
    "Kolkata":   {"level": "High",   "reason": "Hooghly river delta, low elevation"},
    "Hyderabad": {"level": "Medium", "reason": "Musi river, localised low-lying areas"},
    "Ahmedabad": {"level": "Medium", "reason": "Sabarmati river floodplain"},
    "Pune":      {"level": "Medium", "reason": "Mula-Mutha river confluence"},
}

_FLOOD_ADVICE = {
    "Low":    "Standard plinth height (450 mm) adequate. Normal waterproofing.",
    "Medium": "Plinth height ≥ 600 mm above road level. Waterproof basement walls.",
    "High":   "Plinth ≥ 900 mm. No basement recommended. Flood vents + waterproofing mandatory.",
}


@app.get("/risk")
def get_risk(city: str = "Delhi"):
    seismic = _SEISMIC_ZONE.get(city, _SEISMIC_ZONE["Delhi"])
    flood   = _FLOOD_RISK.get(city, _FLOOD_RISK["Delhi"])
    lat, lon = _CITY_COORDS.get(city, _CITY_COORDS["Delhi"])

    # Recent earthquakes — USGS public API (global coverage)
    recent_quakes = []
    try:
        resp = http_requests.get(
            "https://earthquake.usgs.gov/fdsnws/event/1/query",
            params={
                "format":       "geojson",
                "latitude":     lat,
                "longitude":    lon,
                "maxradiuskm":  800,
                "minmagnitude": 2.5,
                "limit":        5,
                "orderby":      "time",
            },
            timeout=6,
        )
        resp.raise_for_status()
        for f in resp.json().get("features", []):
            p = f["properties"]
            recent_quakes.append({
                "place": p.get("place", "Unknown"),
                "mag":   p.get("mag"),
                "time":  p.get("time"),      # ms epoch
                "depth": f["geometry"]["coordinates"][2] if f.get("geometry") else None,
            })
    except Exception:
        pass  # live data optional — degrade gracefully

    return {
        "city":    city,
        "seismic": {
            **seismic,
            "advice": _SEISMIC_ADVICE.get(seismic["zone"], ""),
        },
        "flood": {
            **flood,
            "advice": _FLOOD_ADVICE.get(flood["level"], ""),
        },
        "recent_quakes": recent_quakes,
    }


@app.post("/generate-plan")
def generate_plan(req: PlanRequest):
    params = {
        "bhk_type": req.bhk_type,
        "plot_w_ft": req.plot_w_ft,
        "plot_d_ft": req.plot_d_ft,
        "style": req.style
    }

    if req.prompt.strip():
        params = parse_prompt(req.prompt, params)

    result = optimize_layout(
        params["bhk_type"],
        params["plot_w_ft"],
        params["plot_d_ft"],
        params["style"],
        req.prompt
    )

    if "compliance" not in result:
        from src.core.spatial_optimizer import compute_vastu_compliance
        try:
            result["compliance"] = compute_vastu_compliance(
                result.get("rooms", []),
                float(result.get("plot_w_m", 0)),
                float(result.get("plot_d_m", 0)),
            )
        except Exception:
            pass

    # Cache rooms_data for DXF export
    if "rooms" in result:
        result["room_count"] = len(result["rooms"])
        app.state.last_rooms_data = result["rooms"]
        app.state.last_client_name = req.client_name
        app.state.last_plot_w = result.get(
            "plot_w_m", params["plot_w_ft"] * 0.3048)
        app.state.last_plot_d = result.get(
            "plot_d_m", params["plot_d_ft"] * 0.3048)

    return result


@app.post("/api/download-dxf")
def download_dxf(req: PlanRequest):
    # Use last generated rooms_data stored in app.state
    rooms_data = getattr(app.state, 'last_rooms_data', None)
    client_name = getattr(app.state, 'last_client_name', req.client_name)
    plot_w = getattr(app.state, 'last_plot_w', req.plot_w_ft * 0.3048)
    plot_d = getattr(app.state, 'last_plot_d', req.plot_d_ft * 0.3048)

    if not rooms_data:
        # Fallback — regenerate if no cached data
        result = optimize_layout(
            req.bhk_type,
            req.plot_w_ft,
            req.plot_d_ft,
            req.style
        )
        rooms_data = result.get("rooms", [])
        plot_w = result.get("plot_w_m", req.plot_w_ft * 0.3048)
        plot_d = result.get("plot_d_m", req.plot_d_ft * 0.3048)

    dxf_content = generate_clean_dxf(
        rooms_data,
        plot_w,
        plot_d,
        client_name
    )

    return Response(
        content=dxf_content,
        media_type='application/dxf',
        headers={
            'Content-Disposition':
            f'attachment; filename={client_name}_VastuPlan.dxf'
        }
    )


@app.post("/export-dxf")
def export_dxf(req: DXFExportRequest):
    """
    Export floor plan as professional DXF with dual unit support.

    Args:
      req.rooms: List of room data from generated plan
      req.plot_w_m: Plot width in meters
      req.plot_d_m: Plot depth in meters
      req.client_name: Client name for title block
      req.unit_system: "metric" for mm/m display or "imperial" for feet/inches

    Returns:
      DXF file as attachment
    """
    try:
        # Determine unit system from frontend (converted from "ft" -> "imperial", "m" -> "metric")
        unit_system = "imperial" if req.unit_system == "ft" else "metric"

        dxf_bytes = generate_professional_dxf(
            rooms_data=req.rooms,
            plot_w_m=req.plot_w_m,
            plot_d_m=req.plot_d_m,
            client_name=req.client_name,
            unit_system=unit_system
        )

        return Response(
            content=dxf_bytes,
            media_type='application/dxf',
            headers={
                'Content-Disposition': f'attachment; filename={req.client_name}_VastuPlan.dxf'
            }
        )
    except Exception as e:
        print(f"DXF Export Error: {e}")
        return {"error": str(e)}, 500
