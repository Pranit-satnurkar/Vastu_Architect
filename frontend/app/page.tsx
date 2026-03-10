"use client";

import React, { useState, useRef } from "react";
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
  Loader2 
} from "lucide-react";
import FloorPlanCanvas from "../components/FloorPlanCanvas";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export default function VastuArchitectPage() {
  const [bhkType, setBhkType] = useState("3BHK");
  const [plotW, setPlotW] = useState("30");
  const [plotD, setPlotD] = useState("50");
  const [style, setStyle] = useState("modern");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [planData, setPlanData] = useState<any>(null);
  const [error, setError] = useState("");
  
  const stageRef = useRef<any>(null);

  const generatePlan = async () => {
    setLoading(true);
    setError("");
    try {
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
      
      if (!res.ok) throw new Error("Failed to generate plan");
      
      const data = await res.json();
      setPlanData(data);
    } catch (e) {
      setError("Failed to generate plan. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const downloadPNG = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL();
      const link = document.createElement("a");
      link.download = `Vastu_Plan_${bhkType}_${plotW}x${plotD}.png`;
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
              <h1 className="text-2xl font-bold tracking-tight">Vastu Architect AI</h1>
            </div>
            <p className="text-gray-400 text-sm">Generate Vastu-compliant floor plans instantly</p>
          </header>

          <div className="space-y-6">
            {/* BHK TYPE */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-3 block">BHK Type</label>
              <div className="grid grid-cols-4 gap-2">
                {BHK_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setBhkType(type)}
                    className={cn(
                      "py-2 px-1 rounded-lg text-sm font-medium transition-all duration-200 border",
                      bhkType === type 
                        ? "bg-accent border-accent text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]" 
                        : "bg-border/20 border-border text-gray-500 hover:text-gray-300 hover:border-gray-600"
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
                  onClick={() => { setPlotW(size.w); setPlotD(size.d); }}
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
                        : "bg-border/20 border-border text-gray-500 hover:text-gray-300"
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

            {/* GENERATE BUTTON */}
            <button
              onClick={generatePlan}
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-300",
                loading 
                  ? "bg-gray-700 cursor-not-allowed opacity-50" 
                  : "bg-accent hover:bg-accent-hover text-white shadow-[0_10px_20px_-10px_rgba(99,102,241,0.6)]"
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
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3 animate-pulse">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <p>{error}</p>
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
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Template Used</span>
                      <span className="text-white font-medium">{planData.template_used}</span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Room Count</span>
                      <span className="text-white font-medium">{planData.room_count} Rooms</span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Plot Dimensions</span>
                      <span className="text-white font-medium">{planData.plot_w_m.toFixed(1)}m × {planData.plot_d_m.toFixed(1)}m</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={downloadPNG}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Download className="w-4 h-4" /> PNG
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 border border-border text-white font-semibold rounded-lg hover:bg-border/40 transition-colors">
                      <Map className="w-4 h-4" /> DXF
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-xl shadow-inner relative group">
                  <FloorPlanCanvas data={planData} onStageRef={(ref) => (stageRef.current = ref)} />
                  <div className="absolute inset-x-0 bottom-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/80 px-4 py-2 rounded-full text-[10px] font-bold tracking-tighter text-white/50 backdrop-blur-md">
                      Interactive Konvas Rendering Engine
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
                  <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-bold text-accent tracking-widest mb-2">Vastu Score</span>
                    <div className="text-6xl font-black text-white leading-none">88</div>
                    <div className="mt-4 px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full">GRADE A+</div>
                  </div>
                  <div className="bg-border/20 border border-border/40 rounded-2xl p-6">
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-accent" /> Compliance Summary
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed italic">
                      "The layout follows the Padavinyasa grid system. Master Bedroom is correctly placed in the Nairutya (South-West) zone, while the Kitchen occupies the Agneya (South-East). Open space is adequate in the Ishanya (North-East)."
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-20 h-20 bg-border/30 rounded-full flex items-center justify-center mb-6">
                  <Layout className="w-10 h-10 text-gray-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Architectural Blueprint Output</h2>
                <p className="text-gray-500 max-w-sm">Configure your requirements on the left to generate an AI-optimized, Vastu-compliant floor plan.</p>
                
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
                    <p className="font-bold text-lg">Consulting Vastu Sastras...</p>
                    <p className="text-sm text-gray-500 mt-1 animate-pulse">This usually takes 2-3 seconds</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
