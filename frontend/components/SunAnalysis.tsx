"use client";

import React, { useState, useMemo } from "react";
import SunCalc from "suncalc";

// ─── Indian city presets ──────────────────────────────────────────────────────
const CITIES: Record<string, { lat: number; lng: number; tz: number }> = {
  "Delhi":     { lat: 28.6139,  lng: 77.2090,  tz: 5.5 },
  "Mumbai":    { lat: 19.0760,  lng: 72.8777,  tz: 5.5 },
  "Bangalore": { lat: 12.9716,  lng: 77.5946,  tz: 5.5 },
  "Chennai":   { lat: 13.0827,  lng: 80.2707,  tz: 5.5 },
  "Kolkata":   { lat: 22.5726,  lng: 88.3639,  tz: 5.5 },
  "Hyderabad": { lat: 17.3850,  lng: 78.4867,  tz: 5.5 },
  "Ahmedabad": { lat: 23.0225,  lng: 72.5714,  tz: 5.5 },
  "Pune":      { lat: 18.5204,  lng: 73.8567,  tz: 5.5 },
};

// ─── Sun direction → compass ──────────────────────────────────────────────────
// SunCalc azimuth is measured from South, clockwise in radians.
// Convert to N=0°, E=90°, S=180°, W=270° (standard compass bearing).
function azimuthToBearing(az: number): number {
  return ((az * 180 / Math.PI) + 180) % 360;
}

function bearingToFace(bearing: number): string {
  if (bearing >= 315 || bearing < 45)  return "N";
  if (bearing >= 45  && bearing < 135) return "E";
  if (bearing >= 135 && bearing < 225) return "S";
  return "W";
}

// At a given hour, which wall face does the sun shine on?
function sunFaceAt(date: Date, lat: number, lng: number): string | null {
  const pos = SunCalc.getPosition(date, lat, lng);
  if (pos.altitude <= 0) return null;  // below horizon
  return bearingToFace(azimuthToBearing(pos.azimuth));
}

// ─── Room sun exposure logic ──────────────────────────────────────────────────
const CHECK_HOURS = [
  { label: "Dawn (6 am)",   hour: 6  },
  { label: "Morning (9 am)",hour: 9  },
  { label: "Noon (12 pm)",  hour: 12 },
  { label: "Evening (4 pm)",hour: 16 },
  { label: "Dusk (6 pm)",   hour: 18 },
];

function roomSunExposure(room: any, lat: number, lng: number) {
  const winWall: string | null = room.window?.wall ?? null;
  if (!winWall) return { winWall: null, lit: [] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lit: string[] = [];
  for (const { label, hour } of CHECK_HOURS) {
    const t = new Date(today);
    t.setHours(hour);
    const face = sunFaceAt(t, lat, lng);
    if (face === winWall) lit.push(label);
  }
  return { winWall, lit };
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function fmtTime(date: Date, tz: number): string {
  // Adjust to city local time from UTC
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const local  = new Date(utcMs + tz * 3600000);
  return local.toTimeString().slice(0, 5);
}

const WALL_LABEL: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };
const WALL_COLOR: Record<string, string> = {
  E: "text-amber-600 bg-amber-50 border-amber-200",
  W: "text-orange-600 bg-orange-50 border-orange-200",
  S: "text-yellow-600 bg-yellow-50 border-yellow-200",
  N: "text-sky-600 bg-sky-50 border-sky-200",
};

// ─── Component ────────────────────────────────────────────────────────────────
interface SunAnalysisProps { data: any; city: string }

export default function SunAnalysis({ data, city }: SunAnalysisProps) {
  const [open, setOpen] = useState(true);
  const { lat, lng, tz } = CITIES[city] ?? CITIES["Delhi"];

  const { sunrise, sunset, dayLen, noon } = useMemo(() => {
    const times = SunCalc.getTimes(new Date(), lat, lng);
    const sr = times.sunrise, ss = times.sunset;
    const diffMs  = ss.getTime() - sr.getTime();
    const diffH   = Math.floor(diffMs / 3600000);
    const diffMin = Math.round((diffMs % 3600000) / 60000);
    return {
      sunrise: fmtTime(sr, tz),
      sunset:  fmtTime(ss, tz),
      dayLen:  `${diffH}h ${diffMin}m`,
      noon:    fmtTime(times.solarNoon, tz),
    };
  }, [city, lat, lng, tz]);

  const rooms = useMemo(() =>
    (data?.rooms ?? []).map((r: any) => ({
      ...r,
      sun: roomSunExposure(r, lat, lng),
    })),
    [data, lat, lng],
  );

  const withWindow = rooms.filter((r: any) => r.sun.winWall);
  const noWindow   = rooms.filter((r: any) => !r.sun.winWall);

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">☀️</span>
          <span className="font-semibold text-white text-sm">Sun Path Analysis</span>
          <span className="text-gray-400 text-xs">{sunrise} → {sunset}</span>
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
          <div className="flex justify-end">
            <span className="text-xs text-gray-500">{dayLen} daylight · {city}</span>
          </div>

          {/* Sun times strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: "🌅", label: "Sunrise", val: sunrise },
              { icon: "🌞", label: "Solar Noon", val: noon },
              { icon: "🌇", label: "Sunset", val: sunset },
              { icon: "📏", label: "Day Length", val: dayLen },
            ].map(({ icon, label, val }) => (
              <div key={label} className="bg-border/20 rounded-xl p-3 text-center">
                <div className="text-lg mb-0.5">{icon}</div>
                <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                <div className="text-sm font-bold text-white">{val}</div>
              </div>
            ))}
          </div>

          {/* Room table */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Room Exposure</p>

            {withWindow.map((room: any) => (
              <div key={room.name} className="flex items-start gap-3 p-3 rounded-xl bg-border/10 border border-border/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{room.name}</span>
                    {room.sun.winWall && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${WALL_COLOR[room.sun.winWall]}`}>
                        {WALL_LABEL[room.sun.winWall]} window
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {room.sun.lit.length > 0 ? (
                      room.sun.lit.map((t: string) => (
                        <span key={t} className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-500">No direct sunlight today</span>
                    )}
                  </div>
                </div>
                <div className="text-xl shrink-0">
                  {room.sun.lit.length >= 3 ? "☀️" : room.sun.lit.length >= 1 ? "🌤️" : "🌥️"}
                </div>
              </div>
            ))}

            {noWindow.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {noWindow.map((room: any) => (
                  <span key={room.name} className="text-[10px] text-gray-600 bg-border/20 px-2 py-1 rounded-lg">
                    {room.name} — no window
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Vastu tip */}
          <p className="text-[10px] text-gray-600 pt-2 border-t border-border/30 leading-relaxed">
            <span className="text-accent font-semibold">Vastu tip:</span> East-facing rooms receive auspicious morning sun.
            North-facing windows bring soft, indirect light ideal for study and work.
          </p>
        </div>
      )}
    </div>
  );
}
