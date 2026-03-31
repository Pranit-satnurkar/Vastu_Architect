"use client";

import React, { useState, useEffect, useMemo } from "react";
import SunCalc from "suncalc";

const CITIES: Record<string, { lat: number; lng: number }> = {
  Delhi:     { lat: 28.6139, lng: 77.2090 },
  Mumbai:    { lat: 19.0760, lng: 72.8777 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Chennai:   { lat: 13.0827, lng: 80.2707 },
  Kolkata:   { lat: 22.5726, lng: 88.3639 },
  Hyderabad: { lat: 17.3850, lng: 78.4867 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Pune:      { lat: 18.5204, lng: 73.8567 },
};

const ADJ: Record<string, string[]> = { N:["E","W"], E:["N","S"], S:["E","W"], W:["N","S"] };

function azToBearing(az: number) { return ((az * 180 / Math.PI) + 180) % 360; }
function bearingToFace(b: number): string {
  if (b >= 315 || b < 45)  return "N";
  if (b >= 45  && b < 135) return "E";
  if (b >= 135 && b < 225) return "S";
  return "W";
}

function computeRoomTemp(room: any, w: any, lat: number, lng: number): number {
  const pos = SunCalc.getPosition(new Date(), lat, lng);
  const sunFace = pos.altitude > 0 ? bearingToFace(azToBearing(pos.azimuth)) : null;
  const win = room.window?.wall ?? null;
  let solar = 0;
  if (win && sunFace) {
    if (win === sunFace) solar = 4.5;
    else if (ADJ[win]?.includes(sunFace)) solar = 1.5;
  }
  const windCool = win === bearingToFace(w.wind_deg) ? Math.min(w.wind_speed * 0.25, 3.5) : 0;
  return w.temp_c + solar - windCool + (win ? 0 : 1.5);
}

function heatColor(temp: number): string {
  if (temp < 22) return "#3b82f6";
  if (temp < 26) return "#22c55e";
  if (temp < 30) return "#eab308";
  if (temp < 34) return "#f97316";
  return "#ef4444";
}

function heatLabel(temp: number): string {
  if (temp < 22) return "Cool";
  if (temp < 26) return "Comfortable";
  if (temp < 30) return "Warm";
  if (temp < 34) return "Hot";
  return "Very Hot";
}

function windDir(deg: number) {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}

export default function HeatSignature({ data, city }: { data: any; city: string }) {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8000/weather?city=${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => { setWeather(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [city]);

  const { lat, lng } = CITIES[city];

  const rooms = useMemo(() => {
    if (!weather || !data?.rooms) return [];
    return [...data.rooms]
      .map((r: any) => ({ name: r.name, temp: computeRoomTemp(r, weather, lat, lng) }))
      .sort((a, b) => b.temp - a.temp);
  }, [weather, data, lat, lng]);

  const maxT = rooms[0]?.temp ?? 35;
  const minT = rooms[rooms.length - 1]?.temp ?? 20;
  const range = maxT - minT || 1;

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">🌡️</span>
          <span className="font-semibold text-white text-sm">Heat Signature</span>
          {weather && (
            <span className="text-gray-400 text-xs">
              {weather.temp_c.toFixed(0)}°C · {city}
              {weather.source === "live" && <span className="ml-1.5 text-green-500">●</span>}
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

          {/* ── Controls + weather ── */}
          <div className="flex items-center justify-between gap-3">
            {weather && (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>💧 {weather.humidity}%</span>
                <span>💨 {weather.wind_speed.toFixed(1)} m/s {windDir(weather.wind_deg)}</span>
              </div>
            )}
          </div>

          {/* ── Room list ── */}
          {loading && (
            <p className="text-xs text-gray-600 text-center py-3">Fetching weather…</p>
          )}

          {!loading && rooms.length > 0 && (
            <div className="space-y-1.5">
              {rooms.map(({ name, temp }) => {
                const color = heatColor(temp);
                const pct   = ((temp - minT) / range) * 100;
                return (
                  <div key={name} className="flex items-center gap-3">
                    {/* Color dot */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

                    {/* Room name */}
                    <span className="text-xs text-gray-300 w-32 truncate shrink-0">{name}</span>

                    {/* Bar */}
                    <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>

                    {/* Temp */}
                    <span className="text-xs font-semibold w-14 text-right shrink-0" style={{ color }}>
                      {temp.toFixed(1)}°C
                    </span>

                    {/* Label */}
                    <span className="text-[10px] text-gray-600 w-20 shrink-0">{heatLabel(temp)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Future GPS note ── */}
          <p className="text-[10px] text-gray-600 pt-2 border-t border-border/30 leading-relaxed">
            📍 <span className="text-gray-500">GPS + GIS coming soon</span> — nearby trees, adjacent buildings and local wind corridors will refine these estimates.
          </p>
        </div>
      )}
    </div>
  );
}
