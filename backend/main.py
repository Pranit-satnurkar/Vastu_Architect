from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from spatial_optimizer import optimize_layout
from vastu_engine import generate_dxf_from_template_rooms
from vastu_scorer import score_plan

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
    
    response = gemini_model.generate_content(f"{system_instr}\n\n{user_input}")
    
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

@app.get("/health")
def health():
  return {"status": "ok"}

@app.post("/generate-dxf")
def generate_dxf(req: PlanRequest):
  params = {
    "bhk_type": req.bhk_type,
    "plot_w_ft": req.plot_w_ft,
    "plot_d_ft": req.plot_d_ft,
    "style": req.style
  }
  if req.prompt.strip():
    params = parse_prompt(req.prompt, params)

  result = optimize_layout(
    params["bhk_type"], params["plot_w_ft"], params["plot_d_ft"], params["style"]
  )
  dxf_bytes = generate_dxf_from_template_rooms(
    result["rooms"], result["plot_w_m"], result["plot_d_m"],
    client_name=params["bhk_type"], bhk_type=params["bhk_type"]
  )
  filename = f"{params['bhk_type']}_VastuPlan.dxf"
  return Response(
    content=dxf_bytes,
    media_type="application/dxf",
    headers={"Content-Disposition": f"attachment; filename={filename}"}
  )


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
    params["style"]
  )
  result["compliance"] = score_plan(
    result["rooms"], result["plot_w_m"], result["plot_d_m"]
  )
  return result
