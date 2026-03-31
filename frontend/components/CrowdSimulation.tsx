"use client";

import React, { useState, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const CEIL_H      = 2.7;   // m — ceiling height
const SQM_PP      = 2.5;   // m² per person capacity
const CO2_RATE    = 0.004; // m³ CO2 per person per minute (exhaled)
const CO2_BASE    = 400;   // ppm — outdoor baseline
const VENT_DECAY  = 0.08;  // ppm decay per minute with window (toward baseline)
const NO_VENT     = 0.01;  // ppm decay per minute without window
const DT          = 1;     // timestep = 1 minute
const DOOR_FLOW   = 1.8;   // max people/min through 1m-wide door (home scale)

// ─── Activity presets ─────────────────────────────────────────────────────────
type Preset = "Morning Routine" | "Evening Party" | "Night" | "Custom";

const PRESETS: Record<Preset, { desc: string; rate: number; bias: Record<string, number> }> = {
  "Morning Routine": {
    desc: "People wake up in bedrooms, flow to bathrooms, kitchen, living room.",
    rate: 0.18,
    bias: { bed: 3, master: 3, bath: 1, toilet: 1, kitchen: 1, living: 0, dining: 0 },
  },
  "Evening Party": {
    desc: "Guests crowd living/dining, spill into kitchen.",
    rate: 0.22,
    bias: { living: 5, dining: 4, kitchen: 3, bed: 1, master: 1, bath: 1, corridor: 1 },
  },
  "Night": {
    desc: "Household in bedrooms, near-zero movement.",
    rate: 0.03,
    bias: { master: 2, bed: 2, living: 0, kitchen: 0, bath: 0 },
  },
  "Custom": {
    desc: "Adjust people count manually.",
    rate: 0.15,
    bias: {},
  },
};

// ─── Graph building ───────────────────────────────────────────────────────────
interface Edge { to: string; doorWidth: number }
interface Node {
  name: string; area: number; volume: number;
  capacity: number; hasWindow: boolean; connections: Edge[];
}

function buildGraph(rooms: any[]): Map<string, Node> {
  const nodes = new Map<string, Node>();
  for (const r of rooms) {
    const area = r.w * r.h;
    nodes.set(r.name, {
      name: r.name, area,
      volume: area * CEIL_H,
      capacity: Math.max(1, Math.floor(area / SQM_PP)),
      hasWindow: !!r.window,
      connections: [],
    });
  }

  // Connect rooms via doors — find the room on the other side of each door
  const tol = 0.3;
  for (const rA of rooms) {
    if (!rA.door) continue;
    const d = rA.door;
    for (const rB of rooms) {
      if (rB.name === rA.name) continue;
      let wallAligns = false, rangeOverlaps = false;
      if (d.wall === "E") {
        wallAligns    = Math.abs((rA.x + rA.w) - rB.x) < tol;
        rangeOverlaps = rA.y < rB.y + rB.h && rA.y + rA.h > rB.y;
      } else if (d.wall === "W") {
        wallAligns    = Math.abs(rA.x - (rB.x + rB.w)) < tol;
        rangeOverlaps = rA.y < rB.y + rB.h && rA.y + rA.h > rB.y;
      } else if (d.wall === "S") {
        wallAligns    = Math.abs((rA.y + rA.h) - rB.y) < tol;
        rangeOverlaps = rA.x < rB.x + rB.w && rA.x + rA.w > rB.x;
      } else if (d.wall === "N") {
        wallAligns    = Math.abs(rA.y - (rB.y + rB.h)) < tol;
        rangeOverlaps = rA.x < rB.x + rB.w && rA.x + rA.w > rB.x;
      }
      if (wallAligns && rangeOverlaps) {
        const nA = nodes.get(rA.name)!;
        const nB = nodes.get(rB.name)!;
        const w  = d.width ?? 0.9;
        if (!nA.connections.find(c => c.to === rB.name)) {
          nA.connections.push({ to: rB.name, doorWidth: w });
          nB.connections.push({ to: rA.name, doorWidth: w });
        }
        break;
      }
    }
  }
  return nodes;
}

// ─── Initial distribution ─────────────────────────────────────────────────────
function distribute(rooms: any[], preset: Preset, totalPeople: number): Record<string, number> {
  const bias = PRESETS[preset].bias;
  const dist: Record<string, number> = {};
  // Score each room
  const scores: Record<string, number> = {};
  let totalScore = 0;
  for (const r of rooms) {
    const key = Object.keys(bias).find(k => r.name.toLowerCase().includes(k)) ?? "";
    const score = bias[key] ?? 0.5;
    scores[r.name] = score;
    totalScore += score;
  }
  if (totalScore === 0) {
    for (const r of rooms) { dist[r.name] = totalPeople / rooms.length; }
    return dist;
  }
  for (const r of rooms) {
    dist[r.name] = (scores[r.name] / totalScore) * totalPeople;
  }
  return dist;
}

// ─── Simulation ───────────────────────────────────────────────────────────────
interface SimFrame { occupancy: Record<string, number>; co2: Record<string, number> }
interface DoorFlow { roomA: string; roomB: string; peakFlow: number; doorWidth: number }

function runSim(
  graph: Map<string, Node>,
  initial: Record<string, number>,
  movementRate: number,
  steps: number,
): { frames: SimFrame[]; peakOcc: Record<string, number>; peakCO2: Record<string, number>; doorFlows: DoorFlow[] } {

  const names = [...graph.keys()];

  // State
  let occ:  Record<string, number> = { ...initial };
  let co2:  Record<string, number> = Object.fromEntries(names.map(n => [n, CO2_BASE]));

  const frames: SimFrame[]            = [];
  const peakOcc:  Record<string, number> = { ...occ };
  const peakCO2:  Record<string, number> = { ...co2 };

  // Track door flows (indexed by sorted pair of room names)
  const flowMap: Map<string, { roomA: string; roomB: string; doorWidth: number; total: number; count: number }> = new Map();

  for (let t = 0; t < steps; t++) {
    const newOcc = { ...occ };
    const newCO2 = { ...co2 };

    // ── Movement ─────────────────────────────────────────────
    for (const [name, node] of graph) {
      const people = occ[name];
      if (people < 0.01) continue;
      const totalDoorW = node.connections.reduce((s, e) => s + e.doorWidth, 0);
      if (totalDoorW === 0) continue;

      for (const edge of node.connections) {
        const dest = graph.get(edge.to)!;
        // Flow proportional to door width and occupancy; capped by door capacity
        const maxFlow  = edge.doorWidth * DOOR_FLOW * DT;
        const wantFlow = people * movementRate * (edge.doorWidth / totalDoorW);
        const canFlow  = Math.min(wantFlow, maxFlow,
                                  Math.max(0, dest.capacity - occ[edge.to]));
        const flow = Math.max(0, canFlow);
        newOcc[name]     -= flow;
        newOcc[edge.to]  += flow;

        // Record door flow
        const key = [name, edge.to].sort().join("||");
        const existing = flowMap.get(key);
        if (existing) {
          existing.total += flow;
          existing.count += 1;
        } else {
          flowMap.set(key, { roomA: name, roomB: edge.to, doorWidth: edge.doorWidth, total: flow, count: 1 });
        }
      }
    }

    // ── CO2 ──────────────────────────────────────────────────
    for (const [name, node] of graph) {
      const people = Math.max(0, newOcc[name]);
      // CO2 generated: ppm = (m³_CO2 / volume_m³) * 1e6
      const generated = (people * CO2_RATE * DT / node.volume) * 1e6;
      const decay     = node.hasWindow ? VENT_DECAY : NO_VENT;
      newCO2[name]    = newCO2[name] + generated - decay * (newCO2[name] - CO2_BASE);
      newCO2[name]    = Math.max(CO2_BASE, newCO2[name]);
    }

    occ = newOcc;
    co2 = newCO2;

    // Snap negatives
    for (const n of names) { occ[n] = Math.max(0, occ[n]); }

    frames.push({ occupancy: { ...occ }, co2: { ...co2 } });

    for (const n of names) {
      if (occ[n] > (peakOcc[n] ?? 0)) peakOcc[n] = occ[n];
      if (co2[n] > (peakCO2[n] ?? 0)) peakCO2[n] = co2[n];
    }
  }

  // Build door flow summary
  const doorFlows: DoorFlow[] = [];
  for (const { roomA, roomB, doorWidth, total, count } of flowMap.values()) {
    doorFlows.push({ roomA, roomB, doorWidth, peakFlow: count > 0 ? total / count : 0 });
  }
  doorFlows.sort((a, b) => b.peakFlow - a.peakFlow);

  return { frames, peakOcc, peakCO2, doorFlows };
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function co2Color(ppm: number): string {
  if (ppm < 800)  return "#22c55e";
  if (ppm < 1200) return "#eab308";
  if (ppm < 2000) return "#f97316";
  return "#ef4444";
}
function co2Label(ppm: number): string {
  if (ppm < 800)  return "Fresh";
  if (ppm < 1200) return "Stuffy";
  if (ppm < 2000) return "Poor";
  return "Hazardous";
}
function occColor(pct: number): string {
  if (pct < 0.6)  return "#22c55e";
  if (pct < 0.85) return "#eab308";
  return "#ef4444";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CrowdSimulation({ data }: { data: any }) {
  const [open, setOpen]           = useState(true);
  const [preset, setPreset]       = useState<Preset>("Morning Routine");
  const [people, setPeople]       = useState(6);
  const [tick, setTick]           = useState(30);   // scrub position (minutes)
  const [showBottleneck, setShowBottleneck] = useState(true);

  const rooms: any[] = data?.rooms ?? [];

  const graph = useMemo(() => buildGraph(rooms), [rooms]);

  const STEPS = 60;

  const { frames, peakOcc, peakCO2, doorFlows } = useMemo(() => {
    if (!graph.size) return { frames: [], peakOcc: {}, peakCO2: {}, doorFlows: [] };
    const init = distribute(rooms, preset, people);
    return runSim(graph, init, PRESETS[preset].rate, STEPS);
  }, [graph, preset, people, rooms]);

  const frame = frames[Math.min(tick - 1, frames.length - 1)];

  // Bottleneck: door flow > 80% of door capacity
  const bottlenecks = doorFlows.filter(d => d.peakFlow > d.doorWidth * DOOR_FLOW * 0.5);

  // Isolated rooms (no door connections)
  const isolated = [...graph.entries()].filter(([, n]) => n.connections.length === 0).map(([k]) => k);

  const avgCO2 = frame
    ? Math.round([...Object.values(frame.co2)].reduce((a, b) => a + b, 0) / graph.size)
    : CO2_BASE;

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">👥</span>
          <span className="font-semibold text-white text-sm">Crowd Simulation</span>
          <span className="text-gray-400 text-xs">{people} people · {preset}</span>
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
          <div className="grid grid-cols-2 gap-3">
            {/* Preset */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Scenario</p>
              <select
                value={preset}
                onChange={e => setPreset(e.target.value as Preset)}
                className="w-full text-xs bg-border/40 border border-border text-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {(Object.keys(PRESETS) as Preset[]).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* People count */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                People: <span className="text-white font-bold">{people}</span>
              </p>
              <input
                type="range" min={1} max={20} value={people}
                onChange={e => setPeople(+e.target.value)}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* Scenario description */}
          <p className="text-[10px] text-gray-600 italic">{PRESETS[preset].desc}</p>

          {/* ── Time scrubber ── */}
          {frames.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Time: <span className="text-white font-bold">{tick} min</span>
                </p>
                <span className="text-[10px] text-gray-500">Avg CO₂ {avgCO2} ppm</span>
              </div>
              <input
                type="range" min={1} max={STEPS} value={tick}
                onChange={e => setTick(+e.target.value)}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>0 min</span><span>{STEPS} min</span>
              </div>
            </div>
          )}

          {/* ── Room metrics ── */}
          {frame && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Room Metrics</p>

              {[...graph.entries()].map(([name, node]) => {
                const occ     = Math.max(0, frame.occupancy[name] ?? 0);
                const ppm     = frame.co2[name] ?? CO2_BASE;
                const occPct  = occ / node.capacity;

                return (
                  <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-border/10 border border-border/30">
                    {/* Name */}
                    <span className="text-xs text-gray-300 w-28 truncate shrink-0">{name}</span>

                    {/* Occupancy bar */}
                    <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(occPct * 100, 100)}%`, background: occColor(occPct) }}
                      />
                    </div>

                    {/* People count */}
                    <span className="text-xs font-semibold w-10 text-right shrink-0"
                          style={{ color: occColor(occPct) }}>
                      {occ.toFixed(1)}p
                    </span>

                    {/* CO2 badge */}
                    <span className="text-[10px] font-semibold w-20 text-right shrink-0"
                          style={{ color: co2Color(ppm) }}>
                      {Math.round(ppm)} ppm
                    </span>

                    {/* Air quality label */}
                    <span className="text-[10px] w-16 text-right shrink-0"
                          style={{ color: co2Color(ppm) }}>
                      {co2Label(ppm)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bottleneck warnings ── */}
          {bottlenecks.length > 0 && (
            <div>
              <button
                onClick={() => setShowBottleneck(v => !v)}
                className="flex items-center gap-2 text-[10px] text-orange-400 uppercase tracking-widest font-bold mb-2"
              >
                ⚠ {bottlenecks.length} Bottleneck{bottlenecks.length > 1 ? "s" : ""} detected
                <span className="text-gray-600 normal-case">{showBottleneck ? "▲ hide" : "▼ show"}</span>
              </button>
              {showBottleneck && (
                <div className="space-y-1">
                  {bottlenecks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[10px]">
                      <span className="text-orange-400 shrink-0">🚪</span>
                      <span className="text-gray-300 flex-1">
                        {b.roomA} ↔ {b.roomB}
                      </span>
                      <span className="text-orange-400 shrink-0">
                        {b.doorWidth.toFixed(1)}m door · {b.peakFlow.toFixed(2)} p/min
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Isolated rooms ── */}
          {isolated.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {isolated.map(name => (
                <span key={name}
                  className="text-[10px] text-gray-600 bg-border/20 px-2 py-0.5 rounded-full"
                  title="No door connection detected to adjacent room">
                  {name} — no connection
                </span>
              ))}
            </div>
          )}

          {/* ── Legend ── */}
          <div className="flex gap-4 pt-2 border-t border-border/30 text-[10px] text-gray-600">
            {[["#22c55e","Good"],["#eab308","Stuffy"],["#f97316","Poor"],["#ef4444","Hazardous"]].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
