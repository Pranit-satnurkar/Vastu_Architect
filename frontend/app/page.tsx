"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Home,
  Ruler,
  Map,
  Palette,
  Sparkles,
  Download,
  Layout,
  Maximize2,
  AlertCircle,
  Loader2,
  Box,
  Link2,
  Check,
  Pencil,
} from "lucide-react";
import FloorPlanCanvas from "../components/FloorPlanCanvas";
import SunAnalysis from "../components/SunAnalysis";
import HeatSignature from "../components/HeatSignature";
import AirCirculation from "../components/AirCirculation";
import RiskAnalysis from "../components/RiskAnalysis";
import CrowdSimulation from "../components/CrowdSimulation";
import FireSafety from "../components/FireSafety";
import { generatePlanReport } from "../lib/reportGenerator";
const FloorPlan3D  = dynamic(() => import("../components/FloorPlan3D"),  { ssr: false });
const PlanEditor   = dynamic(() => import("../components/PlanEditor"),   { ssr: false });
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getURLParam(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

const BHK_TYPES = ["1BHK", "2BHK", "3BHK", "4BHK"];
const STYLES = ["modern", "traditional"];
const QUICK_SIZES = [
  { w: "20", d: "30" },
  { w: "30", d: "40" },
  { w: "30", d: "50" },
  { w: "40", d: "60" },
  { w: "50", d: "80" },
];

function FireSafetyToggle({ data }: { data: any }) {
  const [show, setShow] = useState(false);
  return show ? (
    <FireSafety data={data} />
  ) : (
    <button
      onClick={() => setShow(true)}
      className="w-full py-2.5 rounded-xl border border-dashed border-border/40 text-xs text-gray-600 hover:text-gray-400 hover:border-border/70 transition-colors"
    >
      🔥 Show Fire Safety & Evacuation Analysis
    </button>
  );
}

export default function VastuArchitectPage() {
  const [bhkType, setBhkType] = useState(() => getURLParam("bhk", "3BHK"));
  const [plotW, setPlotW] = useState(() => getURLParam("w", "30"));
  const [plotD, setPlotD] = useState(() => getURLParam("d", "50"));
  const [style, setStyle] = useState(() => getURLParam("style", "modern"));
  const [prompt, setPrompt] = useState(() => getURLParam("prompt", ""));
  const [units, setUnits] = useState<"ft" | "m">("ft");
  const [loading, setLoading] = useState(false);
  const [dxfLoading, setDxfLoading] = useState(false);
  const [planData, setPlanData] = useState<any>(null);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("Vastu Architect");
  const [view3D, setView3D] = useState(false);
  const [city, setCity] = useState(() => getURLParam("city", "Delhi"));
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const stageRef = useRef<any>(null);

  // ── URL state sync ──────────────────────────────────────────────────────────
  const updateURL = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.set("bhk",   bhkType);
    params.set("w",     plotW);
    params.set("d",     plotD);
    params.set("style", style);
    params.set("city",  city);
    if (prompt.trim()) params.set("prompt", prompt.trim());
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    window.history.replaceState({}, "", `?${params.toString()}`);
  };

  const copyShareLink = async () => {
    updateURL();
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Auto-generate if URL has params (shared link)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("bhk")) {
      generatePlan();
    }
  }, []);

  const grade = planData?.compliance?.grade ?? "-";
  const score = Math.round(planData?.compliance?.overall ?? 0);
  let gradeColor = "#888888";
  if (grade.startsWith("A")) gradeColor = "#16a34a";
  else if (grade.startsWith("B")) gradeColor = "#d97706";
  else if (grade.startsWith("C") || grade.startsWith("D"))
    gradeColor = "#dc2626";

  const generatePlan = async () => {
    setLoading(true);
    setError("");
    try {
      // First, verify backend is reachable
      const healthCheck: any = await Promise.race([
        fetch("http://localhost:8000/health"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Backend timeout")), 3000),
        ),
      ]);

      if (!(("ok" in healthCheck) as any) || !(healthCheck as any).ok) {
        throw new Error("Backend health check failed");
      }

      // Now make the actual plan request
      const res = await fetch("http://localhost:8000/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bhk_type: bhkType,
          plot_w_ft: parseFloat(plotW),
          plot_d_ft: parseFloat(plotD),
          style: style,
          prompt: prompt,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Backend error:", errText);
        throw new Error(
          `Backend returned ${res.status}: ${errText.substring(0, 100)}`,
        );
      }

      const data = await res.json();
      setPlanData(data);
      setError("");
      updateURL();
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error("Plan generation error:", errorMsg);

      // Provide helpful error messages
      let friendlyError = "Failed to generate plan.";
      if (
        errorMsg.includes("timeout") ||
        errorMsg.includes("Failed to connect")
      ) {
        friendlyError +=
          " Backend is not running. Start it with: uvicorn main:app --reload --port 8000";
      } else if (errorMsg.includes("JSON")) {
        friendlyError +=
          " Backend returned invalid data. Check console for details.";
      } else if (errorMsg.includes("500")) {
        friendlyError += " Server error. Check backend logs.";
      }

      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  const downloadPNG = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL({
        pixelRatio: 2,
        mimeType: "image/png",
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `Vastu_Plan_${bhkType}_${plotW}x${plotD}.png`;
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadPDF = async () => {
    const stage = stageRef.current;
    if (!stage || !planData) return;

    const dataURL = stage.toDataURL({ pixelRatio: 3, mimeType: "image/png", quality: 1 });
    await generatePlanReport(planData, dataURL, city);
  };

  const downloadDXF = async () => {
    try {
      if (!planData || !planData.rooms || planData.rooms.length === 0) {
        alert("No plan generated yet. Generate a plan first.");
        return;
      }

      const res = await fetch("http://localhost:8000/export-dxf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: planData.rooms,
          plot_w_m: planData.plot_w_m,
          plot_d_m: planData.plot_d_m,
          client_name: clientName || "Client",
          unit_system: units === "m" ? "metric" : "ft",
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error("DXF Export Error:", error);
        throw new Error("Failed to download DXF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${clientName || "VastuPlan"}_${planData.plot_w_m.toFixed(1)}x${planData.plot_d_m.toFixed(1)}m.dxf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("DXF download failed:", e);
      alert("Failed to download DXF file. Is the backend running?");
    }
  };

  return (
    <div className="min-h-screen bg-background text-white font-sans selection:bg-accent/30">
      <div className="max-w-[1600px] mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-8">
        {/* LEFT PANEL: INPUT FORM */}
        <aside className="bg-panel border border-border rounded-2xl p-6 h-fit sticky top-8 shadow-2xl">
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-accent p-2 rounded-lg">
                <Home className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Vastu Architect AI
              </h1>
            </div>
            <p className="text-gray-400 text-sm">
              Generate Vastu-compliant floor plans instantly
            </p>
          </header>

          <div className="space-y-6">
            {/* BHK TYPE */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-3 block">
                BHK Type
              </label>
              <div className="grid grid-cols-4 gap-2">
                {BHK_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setBhkType(type)}
                    className={cn(
                      "py-2 px-1 rounded-lg text-sm font-medium transition-all duration-200 border",
                      bhkType === type
                        ? "bg-accent border-accent text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                        : "bg-border/20 border-border text-gray-500 hover:text-gray-300 hover:border-gray-600",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* DIMENSIONS */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block flex items-center gap-2">
                  <Ruler className="w-4 h-4" /> Plot Width (ft)
                </label>
                <input
                  type="number"
                  value={plotW}
                  onChange={(e) => setPlotW(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full bg-[#111] border border-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block flex items-center gap-2">
                  <Maximize2 className="w-4 h-4" /> Plot Depth (ft)
                </label>
                <input
                  type="number"
                  value={plotD}
                  onChange={(e) => setPlotD(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full bg-[#111] border border-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                />
              </div>
            </div>

            {/* QUICK SIZES */}
            <div className="flex flex-wrap gap-2">
              {QUICK_SIZES.map((size) => (
                <button
                  key={`${size.w}x${size.d}`}
                  onClick={() => {
                    setPlotW(size.w);
                    setPlotD(size.d);
                  }}
                  className="text-[10px] uppercase tracking-wider font-bold px-3 py-1 bg-border/40 hover:bg-border/60 rounded-full text-gray-400 transition-colors"
                >
                  {size.w}×{size.d}
                </button>
              ))}
            </div>

            {/* STYLE */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-3 block flex items-center gap-2">
                <Palette className="w-4 h-4" /> Architectural Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={cn(
                      "py-2 px-4 rounded-lg text-sm font-medium capitalize transition-all border",
                      style === s
                        ? "bg-accent border-accent text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                        : "bg-border/20 border-border text-gray-500 hover:text-gray-300",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* PROMPT */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Additional Requirements
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. north facing, large kitchen, double height living room..."
                rows={3}
                className="w-full bg-[#111] border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all text-sm resize-none"
              />
            </div>

            {/* LOCATION */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block flex items-center gap-2">
                <Map className="w-4 h-4" /> Location
              </label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full bg-[#111] border border-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all text-sm"
              >
                {["Delhi","Mumbai","Bangalore","Chennai","Kolkata","Hyderabad","Ahmedabad","Pune"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-600 mt-1">Used for sun, heat, air & risk analysis</p>
            </div>

            {/* GENERATE BUTTON */}
            <button
              onClick={generatePlan}
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-300",
                loading
                  ? "bg-gray-700 cursor-not-allowed opacity-50"
                  : "bg-accent hover:bg-accent-hover text-white shadow-[0_10px_20px_-10px_rgba(99,102,241,0.6)]",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Floor Plan
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">{error}</p>
                  {error.includes("Backend") && (
                    <div className="text-xs text-red-400 mt-2 bg-black/20 p-2 rounded font-mono">
                      <p className="mb-1">To fix, run in two terminals:</p>
                      <p className="opacity-75">
                        Terminal 1: cd backend &amp;&amp; python -m uvicorn
                        main:app --reload --port 8000
                      </p>
                      <p className="opacity-75">
                        Terminal 2: cd frontend &amp;&amp; npm run dev
                      </p>
                      <p className="mt-2 opacity-75">
                        Or simply run: START_SERVERS.bat
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {planData && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Plan Details
                </h3>

                <div className="space-y-2">
                  {/* Vastu Score */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Vastu Score</span>
                    <span
                      className="font-bold text-lg"
                      style={{ color: gradeColor }}
                    >
                      {score}/100
                    </span>
                  </div>

                  {/* Grade */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Grade</span>
                    <span
                      className="px-2 py-0.5 rounded text-white text-sm font-bold"
                      style={{ backgroundColor: gradeColor }}
                    >
                      {grade}
                    </span>
                  </div>

                  {/* Plot Size */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Plot</span>
                    <span className="text-sm font-medium text-gray-900">
                      {planData.plot_w_ft}ft × {planData.plot_d_ft}ft
                    </span>
                  </div>

                  {/* BHK Type */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Type</span>
                    <span className="text-sm font-medium text-gray-900">
                      {planData.bhk_type}
                    </span>
                  </div>

                  {/* Room Count */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Rooms</span>
                    <span className="text-sm font-medium text-gray-900">
                      {planData.room_count}
                    </span>
                  </div>

                  {/* Engine */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Engine</span>
                    <span className="text-sm font-medium text-indigo-600">
                      {planData.engine || "BSP"}
                    </span>
                  </div>

                  {/* Style */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Style</span>
                    <span className="text-sm font-medium capitalize text-gray-900">
                      {planData.style}
                    </span>
                  </div>
                </div>

                {/* VASTU SUMMARY */}
                {planData.compliance?.summary && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 italic leading-relaxed line-clamp-3">
                      "{planData.compliance.summary}"
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT PANEL: OUTPUT */}
        <main className="flex flex-col gap-6">
          <div className="bg-panel border border-border rounded-2xl p-6 min-h-[600px] flex flex-col relative overflow-hidden">
            {planData ? (
              <>
                <div className="flex flex-wrap items-center justify-between mb-6 gap-4 border-b border-border pb-6">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
                        Variant
                      </span>
                      <span className="text-white font-medium capitalize">
                        {planData.layout_variant ?? "Standard"}
                        <span className="text-gray-500 text-xs ml-2">
                          #{planData.seed ?? planData.seed_used ?? "—"}
                        </span>
                      </span>
                      <span className="text-[9px] text-gray-600 mt-0.5">
                        Click Generate for a new variation
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
                        Room Count
                      </span>
                      <span className="text-white font-medium">
                        {planData.room_count} Rooms
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
                        Plot Dimensions
                      </span>
                      <span className="text-white font-medium">
                        {units === "m"
                          ? `${planData.plot_w_m.toFixed(1)}m × ${planData.plot_d_m.toFixed(1)}m`
                          : `${Math.round(planData.plot_w_m * 3.28084)}'0" × ${Math.round(planData.plot_d_m * 3.28084)}'0"`}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setUnits("ft")}
                        className={cn(
                          "px-3 py-1 rounded text-sm font-semibold transition-colors",
                          units === "ft"
                            ? "bg-accent text-white"
                            : "bg-border/40 text-gray-400 hover:text-gray-300",
                        )}
                      >
                        ft
                      </button>
                      <button
                        onClick={() => setUnits("m")}
                        className={cn(
                          "px-3 py-1 rounded text-sm font-semibold transition-colors",
                          units === "m"
                            ? "bg-accent text-white"
                            : "bg-border/40 text-gray-400 hover:text-gray-300",
                        )}
                      >
                        m
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => { setEditMode((v) => !v); setView3D(false); }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors",
                        editMode
                          ? "bg-amber-600 text-white hover:bg-amber-700"
                          : "bg-border/40 text-gray-300 hover:bg-border/60",
                      )}
                      title="Edit floor plan"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => { setView3D((v) => !v); setEditMode(false); }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors",
                        view3D
                          ? "bg-purple-600 text-white hover:bg-purple-700"
                          : "bg-border/40 text-gray-300 hover:bg-border/60",
                      )}
                    >
                      <Box className="w-4 h-4" /> {view3D ? "3D" : "2D"}
                    </button>
                    <button
                      onClick={copyShareLink}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-all",
                        copied
                          ? "bg-green-600 text-white"
                          : "bg-border/40 text-gray-300 hover:bg-border/60",
                      )}
                      title="Copy shareable link"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                      {copied ? "Copied!" : "Share"}
                    </button>
                    <button
                      onClick={downloadPNG}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Download className="w-4 h-4" /> PNG
                    </button>
                    <button
                      onClick={downloadPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" /> PDF
                    </button>
                    <button
                      onClick={downloadDXF}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-white font-semibold rounded-lg hover:bg-border/40 transition-colors"
                    >
                      <Map className="w-4 h-4" /> DXF
                    </button>
                  </div>
                </div>

                <div className={cn(
                  "flex-1 shadow-inner relative group overflow-hidden rounded-xl",
                  editMode ? "bg-[#0f172a]" : "bg-white",
                )}>
                  {editMode ? (
                    <PlanEditor
                      data={planData}
                      onApply={(newData) => { setPlanData(newData); setEditMode(false); }}
                      onClose={() => setEditMode(false)}
                    />
                  ) : view3D ? (
                    <FloorPlan3D data={planData} city={city} />
                  ) : (
                    <FloorPlanCanvas
                      key={planData?.template_used ?? planData?.room_count}
                      data={planData}
                      units={units}
                      onStageRef={(ref) => (stageRef.current = ref)}
                    />
                  )}
                  {!editMode && (
                    <div className="absolute inset-x-0 bottom-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-black/80 px-4 py-2 rounded-full text-[10px] font-bold tracking-tighter text-white/50 backdrop-blur-md">
                        {view3D ? "Three.js 3D Engine — drag to orbit, scroll to zoom" : "Interactive Konva Rendering Engine"}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-20 h-20 bg-border/30 rounded-full flex items-center justify-center mb-6">
                  <Layout className="w-10 h-10 text-gray-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">
                  Architectural Blueprint Output
                </h2>
                <p className="text-gray-500 max-w-sm">
                  Configure your requirements on the left to generate an
                  AI-optimized, Vastu-compliant floor plan.
                </p>

                <div className="mt-12 w-full max-w-md border border-dashed border-border rounded-xl aspect-[4/3] flex items-center justify-center text-gray-700 font-mono text-xs">
                  READY_FOR_CALCULATION
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-accent animate-spin" />
                    <Sparkles className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">
                      Consulting Vastu Sastras...
                    </p>
                    <p className="text-sm text-gray-500 mt-1 animate-pulse">
                      This usually takes 2-3 seconds
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SUN ANALYSIS — shown once a plan is generated */}
          {planData && <SunAnalysis data={planData} city={city} />}

          {/* HEAT SIGNATURE — collapsible */}
          {planData && <HeatSignature data={planData} city={city} />}

          {/* AIR CIRCULATION — collapsible */}
          {planData && <AirCirculation data={planData} city={city} />}

          {/* CROWD SIMULATION */}
          {planData && <CrowdSimulation data={planData} />}

          {/* FIRE SAFETY — opt-in */}
          {planData && <FireSafetyToggle data={planData} />}

          {/* DISASTER RISK */}
          {planData && <RiskAnalysis city={city} />}
        </main>
      </div>
    </div>
  );
}
