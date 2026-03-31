"use client";

import React, { useState, useMemo } from "react";

// ─── Wind direction helpers ───────────────────────────────────────────────────
const OPPOSITE: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };
const ADJACENT: Record<string, string[]> = { N: ["E", "W"], S: ["E", "W"], E: ["N", "S"], W: ["N", "S"] };

function degToFace(deg: number): string {
  // Convert wind meteorological degree to wall face the wind enters from
  // Wind at 0° comes FROM North → enters North wall
  if (deg >= 315 || deg < 45)  return "N";
  if (deg >= 45  && deg < 135) return "E";
  if (deg >= 135 && deg < 225) return "S";
  return "W";
}

// ─── Airflow scoring ──────────────────────────────────────────────────────────
interface RoomScore {
  name: string;
  score: number;        // 0–100
  rating: string;
  reason: string;
  winWall: string | null;
  hasCrossVent: boolean;
}

function scoreRoom(room: any, allRooms: any[], windFace: string): RoomScore {
  const winWall: string | null = room.window?.wall ?? null;
  const name: string = room.name;

  if (!winWall) {
    return { name, score: 10, rating: "Poor", reason: "No window", winWall: null, hasCrossVent: false };
  }

  let score = 0;

  // 1. Windward window: +40 pts if window faces wind
  if (winWall === windFace) score += 40;
  else if (ADJACENT[winWall]?.includes(windFace)) score += 20;
  else score += 5; // leeward

  // 2. Cross-ventilation: find adjacent rooms sharing a wall with windows on opposite sides
  let hasCrossVent = false;
  for (const other of allRooms) {
    if (other.name === name) continue;
    const otherWin: string | null = other.window?.wall ?? null;
    if (!otherWin) continue;
    // Same room if they share a boundary (simple heuristic: adjacent in BFS)
    // Cross-vent: windows on opposite walls (N↔S, E↔W)
    if (otherWin === OPPOSITE[winWall]) {
      hasCrossVent = true;
      break;
    }
  }
  if (hasCrossVent) score += 35;

  // 3. Window size bonus (wider window = more airflow)
  const winWidth = room.window?.width ?? 1.0;
  score += Math.min(winWidth * 5, 15);  // up to +15 for wide windows

  // 4. Vastu bonus: North or East windows for natural drafts
  if (winWall === "N" || winWall === "E") score += 10;

  score = Math.min(score, 100);

  let rating: string;
  let reason: string;
  if (score >= 75) {
    rating = "Excellent";
    reason = hasCrossVent ? "Cross-ventilation + windward" : "Windward window";
  } else if (score >= 50) {
    rating = "Good";
    reason = hasCrossVent ? "Cross-ventilation detected" : "Favourable orientation";
  } else if (score >= 30) {
    rating = "Fair";
    reason = "Partial airflow";
  } else {
    rating = "Poor";
    reason = "Leeward / sheltered";
  }

  return { name, score, rating, reason, winWall, hasCrossVent };
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function ratingColor(rating: string): string {
  if (rating === "Excellent") return "#22c55e";
  if (rating === "Good")      return "#84cc16";
  if (rating === "Fair")      return "#eab308";
  return "#f97316";
}

function ratingBg(rating: string): string {
  if (rating === "Excellent") return "text-green-400 bg-green-500/10 border-green-500/30";
  if (rating === "Good")      return "text-lime-400 bg-lime-500/10 border-lime-500/30";
  if (rating === "Fair")      return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  return "text-orange-400 bg-orange-500/10 border-orange-500/30";
}

// ─── Wind direction labels ────────────────────────────────────────────────────
function windDirLabel(deg: number): string {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}

// ─── Static wind presets per city (prevailing seasonal winds, March–April) ───
const CITY_WIND: Record<string, { speed: number; deg: number }> = {
  Delhi:     { speed: 3.5, deg: 270 },   // Westerly
  Mumbai:    { speed: 4.0, deg: 225 },   // SW sea breeze
  Bangalore: { speed: 2.5, deg: 180 },   // Southerly
  Chennai:   { speed: 3.0, deg: 135 },   // SE
  Kolkata:   { speed: 2.0, deg: 180 },   // S
  Hyderabad: { speed: 3.0, deg: 225 },   // SW
  Ahmedabad: { speed: 4.0, deg: 270 },   // W
  Pune:      { speed: 2.5, deg: 225 },   // SW
};

const CITIES = Object.keys(CITY_WIND);

// ─── Component ────────────────────────────────────────────────────────────────
export default function AirCirculation({ data, weather, city }: { data: any; weather?: any; city: string }) {
  const [open, setOpen] = useState(true);

  // Use live weather wind if available, else city preset
  const wind = useMemo(() => {
    if (weather?.wind_deg !== undefined && weather?.wind_speed !== undefined) {
      return { speed: weather.wind_speed as number, deg: weather.wind_deg as number };
    }
    return CITY_WIND[city] ?? CITY_WIND["Delhi"];
  }, [city, weather]);

  const windFace = degToFace(wind.deg);

  const rooms: any[] = data?.rooms ?? [];

  const scores: RoomScore[] = useMemo(
    () => rooms.map(r => scoreRoom(r, rooms, windFace)).sort((a, b) => b.score - a.score),
    [rooms, windFace],
  );

  const avgScore = scores.length
    ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length)
    : 0;

  const crossVentCount = scores.filter(r => r.hasCrossVent).length;

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">💨</span>
          <span className="font-semibold text-white text-sm">Air Circulation</span>
          <span className="text-gray-400 text-xs">
            {windDirLabel(wind.deg)} {wind.speed.toFixed(1)} m/s · avg {avgScore}%
          </span>
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

          {/* ── Controls ── */}
          <div className="flex items-center justify-between gap-3">
            {/* Wind + cross-vent summary */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>🔀 {crossVentCount} cross-vent</span>
              <span className="px-2 py-0.5 rounded-full bg-border/30">
                {windDirLabel(wind.deg)} wind
              </span>
            </div>
          </div>

          {/* ── Overall score bar ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Overall ventilation</span>
              <span className="text-xs font-bold text-white">{avgScore}%</span>
            </div>
            <div className="h-2 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${avgScore}%`,
                  background: avgScore >= 70 ? "#22c55e" : avgScore >= 45 ? "#eab308" : "#f97316",
                }}
              />
            </div>
          </div>

          {/* ── Room list ── */}
          <div className="space-y-1.5">
            {scores.map(({ name, score, rating, reason, winWall, hasCrossVent }) => {
              const color = ratingColor(rating);
              return (
                <div key={name} className="flex items-center gap-3">
                  {/* Dot */}
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

                  {/* Name */}
                  <span className="text-xs text-gray-300 w-32 truncate shrink-0">{name}</span>

                  {/* Bar */}
                  <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${score}%`, background: color }}
                    />
                  </div>

                  {/* Score */}
                  <span className="text-xs font-semibold w-10 text-right shrink-0" style={{ color }}>
                    {score}%
                  </span>

                  {/* Rating badge */}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border w-20 text-center shrink-0 ${ratingBg(rating)}`}>
                    {rating}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Legend / tip ── */}
          <p className="text-[10px] text-gray-600 pt-2 border-t border-border/30 leading-relaxed">
            📍 <span className="text-gray-500">GIS wind corridors coming soon</span> — nearby buildings,
            trees, and terrain will refine airflow estimates.
          </p>
        </div>
      )}
    </div>
  );
}
