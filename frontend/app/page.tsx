"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import FloorPlanCanvas from "../components/FloorPlanCanvas";
import SunAnalysis from "../components/SunAnalysis";
import HeatSignature from "../components/HeatSignature";
import AirCirculation from "../components/AirCirculation";
import RiskAnalysis from "../components/RiskAnalysis";
import CrowdSimulation from "../components/CrowdSimulation";
import FireSafety from "../components/FireSafety";
import { generatePlanReport } from "../lib/reportGenerator";

const FloorPlan3D = dynamic(() => import("../components/FloorPlan3D"), { ssr: false });
const PlanEditor  = dynamic(() => import("../components/PlanEditor"),  { ssr: false });

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Vastu directional scoring ─────────────────────────────────────────────────
const VASTU_PREFS: Record<string, { x: string; y: string }> = {
  "Living Room":    { x: "east",  y: "north" },
  "Kitchen":        { x: "east",  y: "south" },
  "Master Bedroom": { x: "west",  y: "south" },
  "Bedroom 1":      { x: "west",  y: "south" },
  "Bedroom 2":      { x: "west",  y: "south" },
  "Bedroom 3":      { x: "west",  y: "south" },
  "Bedroom":        { x: "west",  y: "south" },
  "Dining":         { x: "east",  y: "south" },
  "Pooja":          { x: "east",  y: "north" },
  "Toilet 1":       { x: "west",  y: "north" },
  "Toilet 2":       { x: "west",  y: "north" },
  "Toilet":         { x: "west",  y: "north" },
  "Store":          { x: "west",  y: "north" },
};

function computeDirectionalScores(rooms: any[], plotW: number, plotD: number) {
  const buckets: Record<string, number[]> = { N: [], E: [], S: [], W: [] };
  for (const r of rooms) {
    const pref = VASTU_PREFS[r.name];
    if (!pref) continue;
    const cx = (r.x + r.w / 2) / plotW;
    const cy = (r.y + r.h / 2) / plotD;
    const xZone = cx < 0.33 ? "west" : cx > 0.67 ? "east" : "center";
    const yZone = cy < 0.33 ? "north" : cy > 0.67 ? "south" : "center";
    const xs = pref.x === xZone ? 1 : xZone === "center" ? 0.5 : 0;
    const ys = pref.y === yZone ? 1 : yZone === "center" ? 0.5 : 0;
    const s = (xs + ys) / 2;
    if (pref.y === "north") buckets.N.push(s);
    if (pref.x === "east")  buckets.E.push(s);
    if (pref.y === "south") buckets.S.push(s);
    if (pref.x === "west")  buckets.W.push(s);
  }
  const avg = (arr: number[]) =>
    arr.length ? Math.round(100 * arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  return { N: avg(buckets.N), E: avg(buckets.E), S: avg(buckets.S), W: avg(buckets.W) };
}

type ObsType = "excellent" | "suggestion" | "critical";
function computeObservations(rooms: any[], plotW: number, plotD: number, compliance: any) {
  const obs: { type: ObsType; title: string; text: string }[] = [];

  const kitchen = rooms.find(r => r.name === "Kitchen");
  if (kitchen) {
    const cx = (kitchen.x + kitchen.w / 2) / plotW;
    const cy = (kitchen.y + kitchen.h / 2) / plotD;
    if (cx > 0.5 && cy > 0.5)
      obs.push({ type: "excellent", title: "Agni Zone — Kitchen", text: "Kitchen in SE promotes health and prosperity per Vastu Shastra." });
    else
      obs.push({ type: "suggestion", title: "Kitchen Placement", text: "Move kitchen toward South-East for optimal Agni (fire) alignment." });
  }

  const pooja = rooms.find(r => r.name?.toLowerCase().includes("pooja") || r.name?.toLowerCase().includes("puja"));
  if (pooja) {
    const cx = (pooja.x + pooja.w / 2) / plotW;
    const cy = (pooja.y + pooja.h / 2) / plotD;
    if (cx > 0.5 && cy < 0.5)
      obs.push({ type: "excellent", title: "Ishanya — Pooja Room", text: "Pooja room in NE corner maximises divine energy (Ishanya zone)." });
  }

  const master = rooms.find(r => r.name === "Master Bedroom");
  if (master) {
    const cx = (master.x + master.w / 2) / plotW;
    const cy = (master.y + master.h / 2) / plotD;
    if (cx < 0.5 && cy > 0.5)
      obs.push({ type: "excellent", title: "SW — Master Bedroom", text: "Master bedroom in SW provides grounding and restful sleep." });
    else
      obs.push({ type: "suggestion", title: "Master Bedroom", text: "Shift master bedroom toward South-West for Vastu stability." });
  }

  const grade = compliance?.grade ?? "";
  if (grade === "A+" || grade === "A")
    obs.push({ type: "excellent", title: "Overall Harmony", text: compliance?.summary ?? "Strong Vastu compliance across all key rooms." });
  else if (grade.startsWith("B"))
    obs.push({ type: "suggestion", title: "Room for Improvement", text: compliance?.summary ?? "A few placements can be optimised for better balance." });
  else if (grade)
    obs.push({ type: "critical",   title: "Layout Needs Review", text: compliance?.summary ?? "Several rooms deviate from preferred Vastu zones." });

  return obs.slice(0, 4);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BHK_TYPES   = ["1BHK", "2BHK", "3BHK", "4BHK"];
const STYLE_OPTS  = [
  { label: "Modern Minimalist",      value: "modern"      },
  { label: "Contemporary Indian",    value: "modern"      },
  { label: "Traditional Haveli",     value: "traditional" },
  { label: "Vernacular/Sustainable", value: "traditional" },
];
const CITIES  = ["Delhi","Mumbai","Bangalore","Chennai","Kolkata","Hyderabad","Ahmedabad","Pune"];
const FACINGS = ["N","NE","E","SE","S","SW","W","NW"];
const QUICK_SIZES = [
  { w: "20", d: "30" },{ w: "30", d: "40" },
  { w: "30", d: "50" },{ w: "40", d: "60" },{ w: "50", d: "80" },
];

// ── Saved project helpers (localStorage) ─────────────────────────────────────
interface SavedProject {
  id: string;
  savedAt: number;
  bhkType: string;
  plotW: string;
  plotD: string;
  city: string;
  styleName: string;
  score: number;
  grade: string;
  roomCount: number;
  planData: any;
}

const LS_KEY = "vastu_projects";

function loadProjects(): SavedProject[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch { return []; }
}

function saveProject(p: SavedProject) {
  const all = loadProjects().filter(x => x.id !== p.id);
  all.unshift(p);
  localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 20)));
}

function deleteProject(id: string) {
  const all = loadProjects().filter(x => x.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

// ── Vastu guide content ───────────────────────────────────────────────────────
const VASTU_GUIDE = [
  {
    direction: "North (Kubera / Soma)",
    color: "#81d6c0",
    element: "Water",
    icon: "water_drop",
    rooms: ["Living Room", "Drawing Room", "Entrance (preferred)"],
    avoid: ["Kitchen", "Master Bedroom", "Toilet"],
    tip: "Keep North open and uncluttered. Water features, aquariums and green plants here attract wealth and positive energy.",
  },
  {
    direction: "North-East (Ishanya)",
    color: "#93c5fd",
    element: "Ether (Akash)",
    icon: "temple_buddhist",
    rooms: ["Pooja / Prayer Room", "Meditation Space", "Entrance"],
    avoid: ["Toilet", "Kitchen", "Master Bedroom", "Staircase"],
    tip: "Most sacred zone. Keep light and airy. Pooja room here enhances spiritual energy and divine blessings.",
  },
  {
    direction: "East (Indra / Surya)",
    color: "#fcd34d",
    element: "Air",
    icon: "wb_sunny",
    rooms: ["Living Room", "Children's Room", "Verandah"],
    avoid: ["Master Bedroom", "Toilet"],
    tip: "East-facing windows welcome morning sunlight (Surya Shakti). Living rooms and study rooms thrive here.",
  },
  {
    direction: "South-East (Agni)",
    color: "#f97316",
    element: "Fire",
    icon: "local_fire_department",
    rooms: ["Kitchen", "Electrical Panels", "Generator Room"],
    avoid: ["Bedroom", "Pooja Room", "Entrance"],
    tip: "Ideal kitchen placement — Agni (fire) energy here supports healthy cooking and digestion for residents.",
  },
  {
    direction: "South (Yama)",
    color: "#ef4444",
    element: "Earth (Prithvi)",
    icon: "landscape",
    rooms: ["Master Bedroom", "Guest Bedroom", "Heavy Storage"],
    avoid: ["Kitchen", "Living Room", "Entrance"],
    tip: "South carries weight and authority. Master bedroom here grants stability, sound sleep, and financial security.",
  },
  {
    direction: "South-West (Nairuti)",
    color: "#a78bfa",
    element: "Earth",
    icon: "anchor",
    rooms: ["Master Bedroom", "Locker / Safe", "Heavy Furniture"],
    avoid: ["Entrance", "Pooja Room", "Kitchen"],
    tip: "Southwest is the most stable corner. Place the main bedroom and heavy elements here to ground the household.",
  },
  {
    direction: "West (Varuna)",
    color: "#60a5fa",
    element: "Water",
    icon: "waves",
    rooms: ["Dining Room", "Children's Bedroom", "Study Room"],
    avoid: ["Kitchen", "Pooja Room"],
    tip: "West supports learning and growth. Children's rooms here foster discipline and academic excellence.",
  },
  {
    direction: "North-West (Vayu)",
    color: "#86efac",
    element: "Air",
    icon: "air",
    rooms: ["Guest Bedroom", "Garage", "Toilet", "Storeroom"],
    avoid: ["Master Bedroom", "Pooja Room"],
    tip: "Governed by Vayu (wind). Ideal for guest rooms — guests don't overstay. Good for storage and utilities.",
  },
  {
    direction: "Centre (Brahmasthan)",
    color: "#ffc08d",
    element: "Space (Akash)",
    icon: "center_focus_strong",
    rooms: ["Open Courtyard", "Skylight", "Void Space"],
    avoid: ["Toilets", "Kitchen", "Columns / Pillars", "Walls"],
    tip: "The sacred centre should remain open and unobstructed. A courtyard here allows cosmic energy to flow through the entire home.",
  },
];

const ANALYSIS_TABS = [
  { id: "sun",   icon: "wb_sunny",              label: "Sun"   },
  { id: "heat",  icon: "thermostat",            label: "Heat"  },
  { id: "air",   icon: "air",                   label: "Air"   },
  { id: "crowd", icon: "groups",                label: "Crowd" },
  { id: "fire",  icon: "local_fire_department", label: "Fire"  },
  { id: "risk",  icon: "crisis_alert",          label: "Risk"  },
] as const;

const GAUGE_R   = 70;
const GAUGE_C   = 2 * Math.PI * GAUGE_R; // ≈ 440

// ── Component ─────────────────────────────────────────────────────────────────
export default function VastuArchitectPage() {
  // Form state
  const [bhkType,   setBhkType]   = useState("3BHK");
  const [plotW,     setPlotW]     = useState("30");
  const [plotD,     setPlotD]     = useState("50");
  const [styleIdx,  setStyleIdx]  = useState(1);   // Contemporary Indian default
  const [city,      setCity]      = useState("Delhi");
  const [prompt,    setPrompt]    = useState("");
  const [facing,    setFacing]    = useState("NE");
  const [units,     setUnits]     = useState<"ft" | "m">("ft");
  const [clientName, setClientName] = useState("Vastu Architect");

  // UI state
  const [loading,     setLoading]     = useState(false);
  const [planData,    setPlanData]    = useState<any>(null);
  const [error,       setError]       = useState("");
  const [view3D,      setView3D]      = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [analysisTab, setAnalysisTab] = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [fabHover,    setFabHover]    = useState(false);
  const [navPanel,    setNavPanel]    = useState<"projects" | "guide" | null>(null);
  const [projects,    setProjects]    = useState<SavedProject[]>([]);

  const stageRef = useRef<any>(null);

  // Load saved projects on mount
  useEffect(() => { setProjects(loadProjects()); }, []);

  // ── Derived compliance data ──────────────────────────────────────────────────
  const compliance = planData?.compliance ?? null;
  const score      = Math.round(compliance?.overall ?? 0);
  const grade      = compliance?.grade ?? "—";
  const dashOffset = planData ? GAUGE_C - (score / 100) * GAUGE_C : GAUGE_C;

  const gradeColor =
    grade.startsWith("A") ? "#81d6c0" :
    grade.startsWith("B") ? "#f0c77c" : "#ffb4ab";

  const dirScores = planData
    ? computeDirectionalScores(planData.rooms ?? [], planData.plot_w_m ?? 1, planData.plot_d_m ?? 1)
    : null;

  const observations = planData
    ? computeObservations(planData.rooms ?? [], planData.plot_w_m ?? 1, planData.plot_d_m ?? 1, compliance)
    : [];

  // ── API calls ────────────────────────────────────────────────────────────────
  const generatePlan = async () => {
    setLoading(true);
    setError("");
    const builtPrompt = [prompt.trim(), facing ? `Entrance facing ${facing}` : ""]
      .filter(Boolean).join(". ");
    try {
      const health: any = await Promise.race([
        fetch("http://localhost:8000/health"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
      if (!health.ok) throw new Error("Backend unreachable");

      const res = await fetch("http://localhost:8000/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bhk_type:  bhkType,
          plot_w_ft: parseFloat(plotW),
          plot_d_ft: parseFloat(plotD),
          style:     STYLE_OPTS[styleIdx].value,
          prompt:    builtPrompt,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setPlanData(data);
      // Auto-save to My Projects
      const project: SavedProject = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
        bhkType,
        plotW,
        plotD,
        city,
        styleName: STYLE_OPTS[styleIdx].label,
        score:     Math.round(data.compliance?.overall ?? 0),
        grade:     data.compliance?.grade ?? "—",
        roomCount: data.room_count ?? 0,
        planData:  data,
      };
      saveProject(project);
      setProjects(loadProjects());
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      setError(
        msg.includes("timeout") || msg.includes("unreachable")
          ? "Backend not running — start with: uvicorn main:app --reload --port 8000"
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const downloadPNG = () => {
    if (!stageRef.current) return;
    const uri = stageRef.current.toDataURL({ pixelRatio: 2, mimeType: "image/png", quality: 1 });
    const a = document.createElement("a");
    a.download = `Vastu_${bhkType}_${plotW}x${plotD}.png`;
    a.href = uri;
    a.click();
  };

  const downloadPDF = async () => {
    if (!stageRef.current || !planData) return;
    const url = stageRef.current.toDataURL({ pixelRatio: 3, mimeType: "image/png", quality: 1 });
    await generatePlanReport(planData, url, city);
  };

  const downloadDXF = async () => {
    if (!planData?.rooms?.length) return alert("Generate a plan first.");
    try {
      const res = await fetch("http://localhost:8000/export-dxf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms:       planData.rooms,
          plot_w_m:    planData.plot_w_m,
          plot_d_m:    planData.plot_d_m,
          client_name: clientName,
          unit_system: units === "m" ? "metric" : "ft",
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${clientName}_${planData.plot_w_m?.toFixed(1)}x${planData.plot_d_m?.toFixed(1)}m.dxf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch { alert("DXF download failed. Is the backend running?"); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-surface font-body text-on-surface selection:bg-primary-container/20">

      {/* ═══════════════════════════════════════════════════════════════════════
          TOP NAV
      ═══════════════════════════════════════════════════════════════════════ */}
      <header className="bg-surface/95 backdrop-blur-xl border-b border-on-surface/5 flex justify-between items-center w-full px-8 py-4 z-50 fixed top-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary-container text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
            </div>
            <span className="text-lg font-black text-primary tracking-tight font-headline">Vastu AI</span>
          </div>
          <nav className="hidden md:flex gap-6 ml-6">
            <button onClick={() => setNavPanel(null)}
              className={cn("font-headline font-bold pb-0.5 transition-colors",
                navPanel === null ? "text-primary border-b border-primary/50" : "text-on-surface/50 hover:text-primary"
              )}>Dashboard</button>
            <button onClick={() => setNavPanel(p => p === "projects" ? null : "projects")}
              className={cn("font-headline font-bold pb-0.5 transition-colors flex items-center gap-1.5",
                navPanel === "projects" ? "text-primary border-b border-primary/50" : "text-on-surface/50 hover:text-primary"
              )}>
              My Projects
              {projects.length > 0 && (
                <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-body">
                  {projects.length}
                </span>
              )}
            </button>
            <button onClick={() => setNavPanel(p => p === "guide" ? null : "guide")}
              className={cn("font-headline font-bold pb-0.5 transition-colors",
                navPanel === "guide" ? "text-primary border-b border-primary/50" : "text-on-surface/50 hover:text-primary"
              )}>Vastu Guide</button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {planData && (
            <div className="flex items-center gap-1 mr-2">
              <button onClick={downloadPNG}  title="PNG" className="p-2 text-on-surface/50 hover:text-primary transition-all rounded-lg hover:bg-surface-container-high">
                <span className="material-symbols-outlined text-lg">image</span>
              </button>
              <button onClick={downloadPDF}  title="PDF" className="p-2 text-on-surface/50 hover:text-primary transition-all rounded-lg hover:bg-surface-container-high">
                <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
              </button>
              <button onClick={downloadDXF}  title="DXF (AutoCAD)" className="p-2 text-on-surface/50 hover:text-primary transition-all rounded-lg hover:bg-surface-container-high">
                <span className="material-symbols-outlined text-lg">draw</span>
              </button>
              <div className="w-px h-5 bg-outline-variant/40 mx-1" />
            </div>
          )}
          <button className="p-2 text-on-surface/50 hover:text-primary transition-all rounded-lg hover:bg-surface-container-high">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <div className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center ml-1">
            <span className="material-symbols-outlined text-primary text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN BODY — 3-column layout
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex pt-[65px] h-screen overflow-hidden jali-pattern">

        {/* ═══════════════════════════════════════════════════════════════════
            LEFT SIDEBAR — Project Input
        ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-80 bg-surface-container-low border-r border-on-surface/5 flex flex-col overflow-y-auto z-40 flex-shrink-0">
          <div className="p-6 flex flex-col flex-1">
            <div className="mb-5">
              <h2 className="font-headline text-base font-bold text-primary mb-0.5">Project Input</h2>
              <p className="text-[11px] text-on-surface-variant/80">Describe your vision or use technical specs</p>
            </div>

            <div className="flex flex-col gap-5 flex-1">
              {/* AI Prompt */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface/40 mb-2">
                  Dream Home Vision
                </label>
                <div className="relative group">
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={5}
                    placeholder="e.g., A warm home for a family of four, high ceilings, spacious kitchen facing sunrise, natural light in all bedrooms, central courtyard..."
                    className="w-full p-4 bg-surface-container-lowest border border-outline-variant/20 rounded-xl text-sm focus:ring-1 focus:ring-primary/50 focus:border-primary/50 outline-none transition-all resize-none placeholder:text-on-surface-variant/30 text-on-surface leading-relaxed"
                  />
                  <span className="material-symbols-outlined absolute bottom-3 right-3 text-sm text-on-surface-variant/20 group-hover:text-on-surface-variant/40 transition-opacity">
                    edit_note
                  </span>
                </div>
              </div>

              {/* Advanced Parameters */}
              <details className="group border border-outline-variant/20 rounded-xl overflow-hidden bg-surface-container-lowest">
                <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-container-high/30 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-lg">tune</span>
                    <span className="text-sm font-bold text-on-surface/80">Advanced Parameters</span>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant text-lg group-open:rotate-180 transition-transform duration-200">
                    expand_more
                  </span>
                </summary>

                <div className="p-4 pt-3 space-y-5 border-t border-outline-variant/10">
                  {/* BHK */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">BHK Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BHK_TYPES.map(t => (
                        <button key={t} onClick={() => setBhkType(t)}
                          className={cn(
                            "py-2 rounded-lg border text-xs font-medium transition-all",
                            bhkType === t
                              ? "bg-primary/10 border-primary/40 text-primary font-bold"
                              : "border-outline-variant/20 text-on-surface/50 hover:bg-surface-container-high hover:text-on-surface/80"
                          )}>
                          {t === "4BHK" ? "4+ BHK" : t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">Plot Dimensions (ft)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "W", val: plotW, set: setPlotW },
                        { label: "D", val: plotD, set: setPlotD },
                      ].map(({ label, val, set }) => (
                        <div key={label} className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">{label}</span>
                          <input type="number" value={val} onChange={e => set(e.target.value)}
                            className="w-full pl-7 pr-2 py-2 bg-surface-container-high border border-outline-variant/10 rounded-lg text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary/40" />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {QUICK_SIZES.map(s => (
                        <button key={`${s.w}x${s.d}`}
                          onClick={() => { setPlotW(s.w); setPlotD(s.d); }}
                          className="text-[9px] px-2.5 py-1 bg-surface-container-high rounded-full text-on-surface/40 hover:text-primary hover:bg-primary/10 transition-all font-medium">
                          {s.w}×{s.d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">Style Preference</label>
                    <select value={styleIdx} onChange={e => setStyleIdx(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/10 rounded-lg text-xs text-on-surface cursor-pointer outline-none focus:ring-1 focus:ring-primary/40">
                      {STYLE_OPTS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                    </select>
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">Location</label>
                    <select value={city} onChange={e => setCity(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/10 rounded-lg text-xs text-on-surface cursor-pointer outline-none focus:ring-1 focus:ring-primary/40">
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <p className="text-[9px] text-on-surface/30 mt-1">Used for sun, heat & risk analysis</p>
                  </div>

                  {/* Facing / Orientation */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">Main Entrance Facing</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {FACINGS.map(f => (
                        <button key={f} onClick={() => setFacing(f)}
                          className={cn(
                            "py-1.5 rounded-lg border text-[10px] font-bold transition-all",
                            facing === f
                              ? "bg-primary text-on-primary border-primary shadow-glow-primary"
                              : "border-outline-variant/20 text-on-surface/40 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                          )}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Client name */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-2">Project / Client Name</label>
                    <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/10 rounded-lg text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary/40" />
                    <p className="text-[9px] text-on-surface/30 mt-1">Used in DXF / PDF title block</p>
                  </div>
                </div>
              </details>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-xl bg-error-container/15 border border-error/20 text-error">
                  <p className="text-xs font-bold mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">error</span> Generation Failed
                  </p>
                  <p className="text-[11px] text-error/80 leading-relaxed">{error}</p>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <div className="mt-6 flex-shrink-0">
              <button onClick={generatePlan} disabled={loading}
                className={cn(
                  "w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl group",
                  loading ? "opacity-60 cursor-not-allowed" : "hover:bg-primary-container/85 shadow-primary-container/15"
                )}>
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-xl animate-spin">autorenew</span>
                    Consulting Vastus...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">architecture</span>
                    Generate AI Plan
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════════════════
            CENTER — Canvas
        ═══════════════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col p-6 overflow-hidden min-w-0 bg-surface">

          {/* Plan header */}
          {planData && (
            <div className="flex justify-between items-start mb-5 flex-shrink-0 gap-4">
              <div className="min-w-0">
                <h1 className="font-headline text-2xl font-black text-on-surface leading-tight truncate">
                  Active Plan:{" "}
                  <span className="text-primary">{planData.bhk_type} · {planData.template_used ?? "Layout"}</span>
                </h1>
                <p className="text-on-surface-variant/70 text-xs mt-0.5">
                  {units === "m"
                    ? `${planData.plot_w_m?.toFixed(1)}m × ${planData.plot_d_m?.toFixed(1)}m`
                    : `${plotW}ft × ${plotD}ft`}
                  {" "}· {planData.room_count} rooms · {planData.engine ?? "BSP"} engine
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Units toggle */}
                <div className="flex bg-surface-container-highest rounded-lg overflow-hidden border border-outline-variant/10">
                  {(["ft", "m"] as const).map(u => (
                    <button key={u} onClick={() => setUnits(u)}
                      className={cn("px-3 py-1.5 text-xs font-bold transition-all",
                        units === u ? "bg-primary text-on-primary" : "text-on-surface/40 hover:text-on-surface/70"
                      )}>
                      {u}
                    </button>
                  ))}
                </div>

                {/* Share */}
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true); setTimeout(() => setCopied(false), 2500);
                  }}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 text-xs hover:bg-primary-fixed-dim transition-all">
                  <span className="material-symbols-outlined text-sm"
                    style={{ fontVariationSettings: copied ? "'FILL' 1" : "'FILL' 0" }}>
                    {copied ? "check" : "share"}
                  </span>
                  {copied ? "Copied!" : "Share"}
                </button>
              </div>
            </div>
          )}

          {/* Canvas card — always dark container; FloorPlanCanvas/3D render their own backgrounds */}
          <div className={cn(
            "flex-1 rounded-3xl overflow-hidden relative floorplan-shadow flex items-center justify-center",
            editMode ? "bg-[#0f172a]" : "bg-surface-container"
          )}>
            {/* Subtle dot grid (light dots on dark) */}
            {!editMode && (
              <div className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(rgba(226,226,226,0.055) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }} />
            )}

            {planData ? (
              editMode ? (
                <PlanEditor
                  data={planData}
                  onApply={(newData: any) => { setPlanData(newData); setEditMode(false); }}
                  onClose={() => setEditMode(false)}
                />
              ) : view3D ? (
                <FloorPlan3D data={planData} city={city} />
              ) : (
                <FloorPlanCanvas
                  key={planData?.template_used ?? planData?.room_count}
                  data={planData}
                  units={units}
                  onStageRef={ref => (stageRef.current = ref)}
                />
              )
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center text-center p-12 select-none">
                <div className="w-24 h-24 bg-surface-container rounded-full flex items-center justify-center mb-6 border border-outline-variant/10">
                  <span className="material-symbols-outlined text-5xl text-on-surface/15"
                    style={{ fontVariationSettings: "'FILL' 1" }}>home_work</span>
                </div>
                <h2 className="text-xl font-headline font-black text-on-surface/40 mb-2">Awaiting Blueprint</h2>
                <p className="text-on-surface-variant/40 text-sm max-w-xs leading-relaxed">
                  Configure your requirements on the left panel and generate a Vastu-optimised floor plan.
                </p>
                <div className="mt-12 w-full max-w-sm border border-dashed border-outline-variant/25 rounded-2xl aspect-[4/3] flex items-center justify-center text-on-surface/15 font-mono text-xs tracking-[0.3em]">
                  READY_FOR_CALCULATION
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-surface/85 backdrop-blur-sm z-50 flex items-center justify-center rounded-3xl">
                <div className="flex flex-col items-center gap-5">
                  <div className="relative w-20 h-20">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#333535" strokeWidth="4" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#ffc08d" strokeWidth="4"
                        strokeDasharray="213" strokeDashoffset="53"
                        style={{ animation: "spin 1.4s linear infinite", transformOrigin: "center" }} />
                    </svg>
                    <span className="material-symbols-outlined text-primary absolute inset-0 m-auto flex items-center justify-center text-2xl w-8 h-8"
                      style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
                  </div>
                  <div className="text-center">
                    <p className="font-headline font-black text-xl text-on-surface">Consulting Vastu Shastra</p>
                    <p className="text-sm text-on-surface-variant/60 mt-1 animate-pulse">Optimising room placements...</p>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom toolbar pill — hidden in 3D (FloorPlan3D has its own sun controls there) */}
            {planData && !editMode && !view3D && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-surface-container-highest/90 backdrop-blur-xl px-6 py-3 rounded-full flex items-center gap-5 border border-outline-variant/10 shadow-2xl">
                  <button
                    onClick={() => { setView3D(false); }}
                    className={cn("flex items-center gap-1.5 text-xs font-bold transition-all",
                      !view3D ? "text-primary" : "text-on-surface-variant hover:text-primary"
                    )}>
                    <span className="material-symbols-outlined text-lg">layers</span>
                    2D
                  </button>
                  <div className="w-px h-4 bg-outline-variant/30" />
                  <button
                    onClick={() => { setView3D(v => !v); setEditMode(false); }}
                    className={cn("flex items-center gap-1.5 text-xs font-bold transition-all",
                      view3D ? "text-primary" : "text-on-surface-variant hover:text-primary"
                    )}>
                    <span className="material-symbols-outlined text-lg">view_in_ar</span>
                    3D
                  </button>
                  <div className="w-px h-4 bg-outline-variant/30" />
                  <button
                    onClick={() => { setEditMode(v => !v); setView3D(false); }}
                    className={cn("flex items-center gap-1.5 text-xs font-bold transition-all",
                      editMode ? "text-primary" : "text-on-surface-variant hover:text-primary"
                    )}>
                    <span className="material-symbols-outlined text-lg">edit</span>
                    Edit
                  </button>
                  <div className="w-px h-4 bg-outline-variant/30" />
                  <button
                    onClick={() => setUnits(u => u === "ft" ? "m" : "ft")}
                    className="text-on-surface-variant hover:text-primary transition-all flex items-center gap-1.5 text-xs font-bold">
                    <span className="material-symbols-outlined text-lg">straighten</span>
                    {units}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ═══════════════════════════════════════════════════════════════════
            RIGHT PANEL — Score & Analysis
        ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-96 bg-surface-container-low border-l border-on-surface/5 flex flex-col overflow-y-auto z-40 flex-shrink-0">

          {/* Compliance gauge */}
          <div className="p-6 pb-4 flex-shrink-0">
            <h3 className="font-headline text-base font-bold text-on-surface mb-5 text-center">
              Vastu Compliance Score
            </h3>
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center mb-6">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r={GAUGE_R} fill="transparent"
                  stroke="#333535" strokeWidth="10" />
                <circle cx="80" cy="80" r={GAUGE_R} fill="transparent"
                  stroke={gradeColor} strokeWidth="10"
                  strokeDasharray={GAUGE_C}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-black leading-none" style={{ color: gradeColor }}>
                  {planData ? score : "—"}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mt-1">
                  {planData ? `Grade ${grade}` : "No Plan Yet"}
                </span>
              </div>
            </div>

            {/* Directional balance */}
            {dirScores ? (
              <div className="mb-5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-on-surface/40 mb-3">
                  Directional Balance
                </h4>
                <div className="space-y-3">
                  {[
                    { label: "North (Water)", key: "N", color: "#81d6c0" },
                    { label: "East (Air)",    key: "E", color: "#81d6c0" },
                    { label: "South (Fire)",  key: "S", color: "#ffc08d" },
                    { label: "West (Earth)",  key: "W", color: "#f0c77c" },
                  ].map(({ label, key, color }) => {
                    const val = dirScores[key as keyof typeof dirScores];
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-on-surface/60 font-medium">{label}</span>
                          <span className="font-bold" style={{ color }}>{val}%</span>
                        </div>
                        <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${val}%`, backgroundColor: color, transition: "width 1s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-on-surface/20">
                <span className="material-symbols-outlined text-4xl mb-2 block"
                  style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
                <p className="text-xs font-medium">Generate a plan to see Vastu analysis</p>
              </div>
            )}

            {/* AI Observations */}
            {observations.length > 0 && (
              <div className="mb-5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-on-surface/40 mb-3">
                  AI Observations
                </h4>
                <div className="space-y-2.5">
                  {observations.map((obs, i) => {
                    const C = {
                      excellent:  { border: "#81d6c0", title: "#81d6c0" },
                      suggestion: { border: "#f0c77c", title: "#f0c77c" },
                      critical:   { border: "#ffb4ab", title: "#ffb4ab" },
                    }[obs.type];
                    return (
                      <div key={i} className="p-3 rounded-xl bg-surface-container-highest"
                        style={{ borderLeft: `3px solid ${C.border}` }}>
                        <p className="text-xs font-bold mb-1" style={{ color: C.title }}>{obs.title}</p>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">{obs.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pro tip */}
            {planData && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15 mb-2">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5"
                  style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                <div>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-tight">Pro Tip</p>
                  <p className="text-[11px] text-on-surface/70 mt-0.5 leading-relaxed">
                    {grade === "A+"
                      ? "Perfect harmony! A Brahmasthan (central void) would elevate this plan further."
                      : grade.startsWith("A")
                      ? "Strong layout. A water feature near NE can boost positive energy."
                      : "Try regenerating — the engine uses random seeds for different variants."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Analysis Tabs ──────────────────────────────────────────────── */}
          {planData && (
            <div className="border-t border-on-surface/5 flex-shrink-0">
              <div className="px-4 pt-4 pb-3 bg-surface-container-lowest/40">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-on-surface/40 mb-3">
                  Environmental Analysis
                </h4>
                <div className="grid grid-cols-6 gap-1">
                  {ANALYSIS_TABS.map(tab => (
                    <button key={tab.id}
                      onClick={() => setAnalysisTab(prev => prev === tab.id ? null : tab.id)}
                      title={tab.label}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-[9px] font-bold transition-all",
                        analysisTab === tab.id
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "text-on-surface/40 hover:text-on-surface/70 hover:bg-surface-container-highest border border-transparent"
                      )}>
                      <span className="material-symbols-outlined text-base">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Analysis panel content */}
              {analysisTab && (
                <div className="border-t border-on-surface/5">
                  {analysisTab === "sun"   && <SunAnalysis data={planData} city={city} />}
                  {analysisTab === "heat"  && <HeatSignature data={planData} city={city} />}
                  {analysisTab === "air"   && <AirCirculation data={planData} city={city} />}
                  {analysisTab === "crowd" && <CrowdSimulation data={planData} />}
                  {analysisTab === "fire"  && <FireSafety data={planData} />}
                  {analysisTab === "risk"  && <RiskAnalysis city={city} />}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MY PROJECTS PANEL
      ═══════════════════════════════════════════════════════════════════════ */}
      {navPanel === "projects" && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setNavPanel(null)} />
          <div className="w-[460px] bg-surface-container-low border-l border-on-surface/8 flex flex-col h-full overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-on-surface/8 flex-shrink-0">
              <div>
                <h2 className="font-headline text-lg font-black text-on-surface">My Projects</h2>
                <p className="text-xs text-on-surface-variant/70 mt-0.5">{projects.length} saved plan{projects.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setNavPanel(null)}
                className="p-2 text-on-surface/40 hover:text-on-surface transition-all rounded-lg hover:bg-surface-container-high">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-on-surface/25">
                  <span className="material-symbols-outlined text-5xl mb-3"
                    style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                  <p className="text-sm font-medium">No saved projects yet</p>
                  <p className="text-xs mt-1">Generate a plan to save it automatically</p>
                </div>
              ) : (
                projects.map(p => {
                  const gColor =
                    p.grade.startsWith("A") ? "#81d6c0" :
                    p.grade.startsWith("B") ? "#f0c77c" : "#ffb4ab";
                  const date = new Date(p.savedAt);
                  const dateStr = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                  const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={p.id}
                      className="bg-surface-container-highest rounded-2xl p-4 border border-outline-variant/15 hover:border-primary/30 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-headline font-bold text-on-surface">{p.bhkType}</span>
                            <span className="text-on-surface/30">·</span>
                            <span className="text-xs text-on-surface-variant">{p.plotW}×{p.plotD} ft</span>
                            <span className="text-on-surface/30">·</span>
                            <span className="text-xs text-on-surface-variant">{p.city}</span>
                          </div>
                          <p className="text-[11px] text-on-surface/40">{p.styleName} · {p.roomCount} rooms</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xl font-black" style={{ color: gColor }}>{p.score}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                            style={{ color: gColor, borderColor: gColor + "40", backgroundColor: gColor + "15" }}>
                            Grade {p.grade}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-on-surface/30">{dateStr} at {timeStr}</span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setPlanData(p.planData);
                              setBhkType(p.bhkType);
                              setPlotW(p.plotW);
                              setPlotD(p.plotD);
                              setCity(p.city);
                              setNavPanel(null);
                            }}
                            className="text-[11px] font-bold px-3 py-1.5 bg-primary/15 text-primary rounded-lg hover:bg-primary/25 transition-all flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            Load
                          </button>
                          <button
                            onClick={() => { deleteProject(p.id); setProjects(loadProjects()); }}
                            className="p-1.5 text-error/50 hover:text-error hover:bg-error/10 rounded-lg transition-all">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {projects.length > 0 && (
              <div className="px-4 py-3 border-t border-on-surface/8 flex-shrink-0">
                <button
                  onClick={() => { if (confirm("Delete all saved projects?")) { localStorage.removeItem(LS_KEY); setProjects([]); } }}
                  className="w-full py-2 text-xs font-bold text-error/50 hover:text-error hover:bg-error/10 rounded-lg transition-all">
                  Clear all projects
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VASTU GUIDE PANEL
      ═══════════════════════════════════════════════════════════════════════ */}
      {navPanel === "guide" && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setNavPanel(null)} />
          <div className="w-[520px] bg-surface-container-low border-l border-on-surface/8 flex flex-col h-full overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-on-surface/8 flex-shrink-0">
              <div>
                <h2 className="font-headline text-lg font-black text-on-surface">Vastu Shastra Guide</h2>
                <p className="text-xs text-on-surface-variant/70 mt-0.5">Room placement rules by direction</p>
              </div>
              <button onClick={() => setNavPanel(null)}
                className="p-2 text-on-surface/40 hover:text-on-surface transition-all rounded-lg hover:bg-surface-container-high">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Compass overview */}
            <div className="px-6 py-4 bg-surface-container-lowest/50 border-b border-on-surface/5 flex-shrink-0">
              <p className="text-xs text-on-surface-variant/70 leading-relaxed">
                Vastu Shastra is an ancient Indian science of architecture that aligns living spaces with the five
                elements — Earth, Water, Fire, Air, and Ether — and the eight cardinal directions to promote
                health, prosperity, and harmony.
              </p>
            </div>

            {/* Direction cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {VASTU_GUIDE.map((entry) => (
                <details key={entry.direction} className="group rounded-2xl overflow-hidden border border-outline-variant/15 bg-surface-container-highest">
                  <summary className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-container-high/50 transition-all">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: entry.color + "20", border: `1px solid ${entry.color}30` }}>
                      <span className="material-symbols-outlined text-lg" style={{ color: entry.color,
                        fontVariationSettings: "'FILL' 1" }}>{entry.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-headline font-bold text-sm text-on-surface">{entry.direction}</p>
                      <p className="text-[10px] text-on-surface/40 font-medium">Element: {entry.element}</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface/30 text-lg group-open:rotate-180 transition-transform duration-200">
                      expand_more
                    </span>
                  </summary>

                  <div className="px-4 pb-4 pt-1 border-t border-outline-variant/10 space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-1.5">Ideal Rooms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.rooms.map(r => (
                          <span key={r} className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                            style={{ backgroundColor: entry.color + "15", color: entry.color, border: `1px solid ${entry.color}25` }}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-1.5">Avoid Placing</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.avoid.map(r => (
                          <span key={r} className="text-[11px] px-2.5 py-1 rounded-full bg-error/10 text-error/70 border border-error/15 font-medium">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10">
                      <span className="material-symbols-outlined text-base mt-0.5 flex-shrink-0"
                        style={{ color: entry.color, fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">{entry.tip}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          FAB — Ask Vastu AI Expert
      ═══════════════════════════════════════════════════════════════════════ */}
      <button
        onMouseEnter={() => setFabHover(true)}
        onMouseLeave={() => setFabHover(false)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl shadow-primary/20 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[100]">
        <span className="material-symbols-outlined text-2xl"
          style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
        {fabHover && (
          <span className="absolute right-full mr-4 bg-surface-container-highest text-on-surface text-xs px-3 py-2 rounded-xl whitespace-nowrap shadow-xl border border-outline-variant/20 font-medium">
            Ask Vastu AI Expert
          </span>
        )}
      </button>

      {/* Spin keyframe for loading */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
