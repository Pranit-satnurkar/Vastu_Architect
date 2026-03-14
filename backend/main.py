from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from spatial_optimizer import optimize_layout
from vastu_engine import generate_clean_dxf
from dxf_exporter import generate_professional_dxf

import google.generativeai as genai
import json
import os
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


@app.get("/health")
def health():
    return {"status": "ok"}


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
        from spatial_optimizer import compute_vastu_compliance
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
