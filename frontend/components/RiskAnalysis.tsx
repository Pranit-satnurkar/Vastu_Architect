"use client";

import React, { useState, useEffect } from "react";

const CITIES = ["Delhi","Mumbai","Bangalore","Chennai","Kolkata","Hyderabad","Ahmedabad","Pune"];

// ─── Colour helpers ───────────────────────────────────────────────────────────
const ZONE_COLOR: Record<string, string> = {
  II:  "text-green-400 bg-green-500/10 border-green-500/30",
  III: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  IV:  "text-orange-400 bg-orange-500/10 border-orange-500/30",
  V:   "text-red-400 bg-red-500/10 border-red-500/30",
};

const FLOOD_COLOR: Record<string, string> = {
  Low:    "text-green-400 bg-green-500/10 border-green-500/30",
  Medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  High:   "text-red-400 bg-red-500/10 border-red-500/30",
};

const RISK_DOT: Record<string, string> = {
  Low: "#22c55e", Moderate: "#eab308", High: "#f97316", "Very High": "#ef4444",
};

function fmtQuakeTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function magColor(mag: number): string {
  if (mag < 3.5) return "#22c55e";
  if (mag < 5.0) return "#eab308";
  if (mag < 6.0) return "#f97316";
  return "#ef4444";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RiskAnalysis({ city }: { city: string }) {
  const [open, setOpen] = useState(true);
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`http://localhost:8000/risk?city=${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [city]);

  const seismic = data?.seismic;
  const flood   = data?.flood;
  const quakes: any[] = data?.recent_quakes ?? [];

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">⚠️</span>
          <span className="font-semibold text-white text-sm">Disaster Risk Analysis</span>
          {seismic && (
            <span className="text-gray-400 text-xs">
              Seismic {seismic.zone} · Flood {flood?.level}
            </span>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-gray-600 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-5 space-y-4">

          {loading && (
            <p className="text-xs text-gray-600 text-center py-4">Loading risk data…</p>
          )}

          {!loading && data && (
            <>
              {/* ── Two-column risk badges ── */}
              <div className="grid grid-cols-2 gap-3">

                {/* Seismic */}
                <div className="bg-border/10 rounded-xl p-3 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Seismic</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${ZONE_COLOR[seismic.zone] ?? "text-gray-400"}`}>
                      Zone {seismic.zone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0"
                         style={{ background: RISK_DOT[seismic.risk] ?? "#888" }} />
                    <span className="text-sm font-bold text-white">{seismic.risk} Risk</span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">{seismic.pga} peak ground acceleration</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed border-t border-border/30 pt-2">
                    {seismic.advice}
                  </p>
                </div>

                {/* Flood */}
                <div className="bg-border/10 rounded-xl p-3 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Flood</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${FLOOD_COLOR[flood.level] ?? "text-gray-400"}`}>
                      {flood.level}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0"
                         style={{ background: RISK_DOT[flood.level === "Low" ? "Low" : flood.level === "Medium" ? "Moderate" : "High"] ?? "#888" }} />
                    <span className="text-sm font-bold text-white">{flood.level} Risk</span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">{flood.reason}</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed border-t border-border/30 pt-2">
                    {flood.advice}
                  </p>
                </div>
              </div>

              {/* ── Recent earthquakes ── */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">
                  Recent Earthquakes · 800 km radius
                  <span className="ml-2 text-[10px] text-green-500 normal-case font-normal">● USGS live</span>
                </p>

                {quakes.length === 0 ? (
                  <p className="text-xs text-gray-600 py-2">No M2.5+ earthquakes recorded nearby recently.</p>
                ) : (
                  <div className="space-y-1.5">
                    {quakes.map((q, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-border/10 border border-border/30">
                        {/* Magnitude */}
                        <span
                          className="text-sm font-bold w-10 shrink-0"
                          style={{ color: magColor(q.mag) }}
                        >
                          M{q.mag?.toFixed(1)}
                        </span>

                        {/* Place */}
                        <span className="text-xs text-gray-300 flex-1 truncate">{q.place}</span>

                        {/* Depth */}
                        {q.depth != null && (
                          <span className="text-[10px] text-gray-600 shrink-0">{q.depth.toFixed(0)} km deep</span>
                        )}

                        {/* Date */}
                        {q.time && (
                          <span className="text-[10px] text-gray-600 shrink-0 w-20 text-right">
                            {fmtQuakeTime(q.time)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Data sources ── */}
              <p className="text-[10px] text-gray-600 pt-2 border-t border-border/30 leading-relaxed">
                Seismic zones: IS 1893:2016 (BIS) · Flood risk: NDMA published data ·
                Earthquakes: USGS Earthquake Hazards Program
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
