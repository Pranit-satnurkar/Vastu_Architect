"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";

// ─── Graph ────────────────────────────────────────────────────────────────────
interface Edge { to: string; doorWidth: number }
interface Node {
  name: string; x: number; y: number; w: number; h: number;
  area: number; connections: Edge[];
}

function buildGraph(rooms: any[]): Map<string, Node> {
  const nodes = new Map<string, Node>();
  for (const r of rooms) {
    nodes.set(r.name, {
      name: r.name, x: r.x, y: r.y, w: r.w, h: r.h,
      area: r.w * r.h, connections: [],
    });
  }
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

// ─── Exit detection ───────────────────────────────────────────────────────────
// A room is an exit if its door opens to the plot boundary
function findExits(rooms: any[], plotW: number, plotD: number): Set<string> {
  const exits = new Set<string>();
  const tol   = 0.35;
  for (const r of rooms) {
    if (!r.door) continue;
    const d = r.door;
    if (d.wall === "N" && r.y             <= tol)         exits.add(r.name);
    if (d.wall === "S" && (r.y + r.h)     >= plotD - tol) exits.add(r.name);
    if (d.wall === "W" && r.x             <= tol)         exits.add(r.name);
    if (d.wall === "E" && (r.x + r.w)     >= plotW - tol) exits.add(r.name);
  }
  // Fallback: if no exits found, pick the room whose door is on the outermost boundary
  if (exits.size === 0 && rooms.length > 0) {
    let best = rooms[0];
    let bestScore = -Infinity;
    for (const r of rooms) {
      if (!r.door) continue;
      const d = r.door;
      let score = 0;
      if (d.wall === "N") score = plotD - r.y;
      if (d.wall === "S") score = r.y + r.h;
      if (d.wall === "W") score = plotW - r.x;
      if (d.wall === "E") score = r.x + r.w;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best) exits.add(best.name);
  }
  return exits;
}

// ─── A* pathfinding ───────────────────────────────────────────────────────────
const WALK_SPEED = 1.2; // m/s in emergency

function roomTraversalTime(node: Node): number {
  // Diagonal traversal of room at walking speed → seconds
  return Math.sqrt(node.w * node.w + node.h * node.h) / WALK_SPEED;
}
function doorTime(doorWidth: number): number {
  // Bottleneck at door: 0.5s base + narrower is slower
  return 0.5 + (0.9 - Math.min(doorWidth, 0.9)) * 0.5;
}

interface PathResult { path: string[]; timeSec: number }

function aStar(
  graph: Map<string, Node>,
  start: string,
  exits: Set<string>,
): PathResult | null {
  // Min-heap via sorted array (small graph — fine)
  type Entry = [number, string, string[]];
  const open: Entry[]   = [[0, start, [start]]];
  const visited         = new Set<string>();

  while (open.length > 0) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, cur, path] = open.shift()!;
    if (exits.has(cur)) return { path, timeSec: cost };
    if (visited.has(cur)) continue;
    visited.add(cur);
    const node = graph.get(cur);
    if (!node) continue;
    for (const edge of node.connections) {
      if (visited.has(edge.to)) continue;
      const dest      = graph.get(edge.to);
      if (!dest) continue;
      const edgeCost  = roomTraversalTime(dest) + doorTime(edge.doorWidth);
      open.push([cost + edgeCost, edge.to, [...path, edge.to]]);
    }
  }
  return null;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function timeColor(sec: number | null): string {
  if (sec === null) return "#ef4444";
  if (sec < 30)  return "#22c55e";
  if (sec < 60)  return "#86efac";
  if (sec < 120) return "#fde047";
  if (sec < 180) return "#fb923c";
  return "#ef4444";
}
function timeLabel(sec: number | null): string {
  if (sec === null) return "Trapped";
  if (sec < 30)  return "< 30s";
  if (sec < 60)  return `${Math.round(sec)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

// ─── Canvas evacuation map ────────────────────────────────────────────────────
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
) {
  const headLen = 8;
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FireSafety({ data }: { data: any }) {
  const [open, setOpen]   = useState(true);
  const canvasRef         = useRef<HTMLCanvasElement>(null);

  const rooms: any[]   = data?.rooms   ?? [];
  const plotW: number  = data?.plot_w_m ?? 9;
  const plotD: number  = data?.plot_d_m ?? 9;

  const graph = useMemo(() => buildGraph(rooms), [rooms]);
  const exits = useMemo(() => findExits(rooms, plotW, plotD), [rooms, plotW, plotD]);

  // A* from every room
  const results = useMemo(() => {
    const map = new Map<string, PathResult | null>();
    for (const name of graph.keys()) {
      if (exits.has(name)) {
        map.set(name, { path: [name], timeSec: 0 });
      } else {
        map.set(name, aStar(graph, name, exits));
      }
    }
    return map;
  }, [graph, exits]);

  // Dead ends: 1 connection, not an exit, not reachable
  const deadEnds = useMemo(
    () => [...graph.entries()]
      .filter(([name, node]) => !exits.has(name) && node.connections.length <= 1 && results.get(name) === null)
      .map(([name]) => name),
    [graph, exits, results],
  );

  // Rooms with only one way out (single connection, not exit) — not trapped but vulnerable
  const singleExit = useMemo(
    () => [...graph.entries()]
      .filter(([name, node]) => !exits.has(name) && node.connections.length === 1)
      .map(([name]) => name),
    [graph, exits],
  );

  // Worst room: highest time
  const worstRoom = useMemo(() => {
    let worst = { name: "", time: -1 };
    for (const [name, res] of results) {
      if (!exits.has(name) && res && res.timeSec > worst.time) {
        worst = { name, time: res.timeSec };
      }
    }
    return worst;
  }, [results, exits]);

  // Assembly point hint: centroid of exit rooms' door positions
  const assemblyPoint = useMemo(() => {
    const exitRooms = rooms.filter(r => exits.has(r.name) && r.door);
    if (!exitRooms.length) return "Outside main entrance";
    const directions = exitRooms.map(r => r.door.wall);
    const counts: Record<string, number> = {};
    for (const d of directions) counts[d] = (counts[d] ?? 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const labels: Record<string, string> = { N: "North side", S: "South side", E: "East side", W: "West side" };
    return `${labels[dominant] ?? "front"} of plot, ≥ 10m from structure`;
  }, [exits, rooms]);

  // ── Draw canvas map ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rooms.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CW = canvas.width;
    const CH = canvas.height;
    const pad = 16;
    const scX = (CW - pad * 2) / plotW;
    const scY = (CH - pad * 2) / plotD;

    const rx = (x: number) => pad + x * scX;
    const ry = (y: number) => pad + y * scY;

    ctx.clearRect(0, 0, CW, CH);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, CW, CH);

    // Plot boundary
    ctx.strokeStyle = "#475569";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx(0), ry(0), plotW * scX, plotD * scY);
    ctx.setLineDash([]);

    // Rooms
    for (const room of rooms) {
      const res = results.get(room.name);
      const col = exits.has(room.name) ? "#14532d" : timeColor(res ? res.timeSec : null) + "33";
      const border = exits.has(room.name) ? "#22c55e" : timeColor(res ? res.timeSec : null);

      ctx.fillStyle   = col;
      ctx.strokeStyle = border;
      ctx.lineWidth   = exits.has(room.name) ? 2 : 1;
      ctx.fillRect(rx(room.x), ry(room.y), room.w * scX, room.h * scY);
      ctx.strokeRect(rx(room.x), ry(room.y), room.w * scX, room.h * scY);

      // Room name
      const fs = Math.max(7, Math.min(10, room.w * scX * 0.18));
      ctx.fillStyle  = "#e2e8f0";
      ctx.font       = `600 ${fs}px sans-serif`;
      ctx.textAlign  = "center";
      ctx.textBaseline = "middle";
      const label = room.name.length > 10 ? room.name.slice(0, 9) + "…" : room.name;
      ctx.fillText(label, rx(room.x + room.w / 2), ry(room.y + room.h / 2) - fs * 0.6);

      // Time label
      const tl = exits.has(room.name) ? "EXIT" : timeLabel(res ? res.timeSec : null);
      ctx.fillStyle = exits.has(room.name) ? "#4ade80" : timeColor(res ? res.timeSec : null);
      ctx.font      = `bold ${Math.max(7, fs - 1)}px sans-serif`;
      ctx.fillText(tl, rx(room.x + room.w / 2), ry(room.y + room.h / 2) + fs * 0.6);
    }

    // Evacuation arrows (next room in path)
    for (const room of rooms) {
      if (exits.has(room.name)) continue;
      const res = results.get(room.name);
      if (!res || res.path.length < 2) continue;

      const nextName  = res.path[1];
      const nextRoom  = rooms.find(r => r.name === nextName);
      if (!nextRoom) continue;

      const x1 = rx(room.x + room.w / 2);
      const y1 = ry(room.y + room.h / 2);
      const x2 = rx(nextRoom.x + nextRoom.w / 2);
      const y2 = ry(nextRoom.y + nextRoom.h / 2);

      drawArrow(ctx, x1, y1, x2, y2, "rgba(255,255,255,0.55)");
    }

    // Dead-end markers
    for (const name of deadEnds) {
      const room = rooms.find(r => r.name === name);
      if (!room) continue;
      ctx.fillStyle = "#ef4444";
      ctx.font      = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚠", rx(room.x + room.w / 2), ry(room.y + room.h / 2) + 12);
    }
  }, [rooms, results, exits, deadEnds, plotW, plotD]);

  const allReachable = [...results.values()].filter(r => r !== null).length;
  const trapped      = rooms.length - allReachable;

  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">🔥</span>
          <span className="font-semibold text-white text-sm">Fire Safety & Evacuation</span>
          <span className="text-gray-400 text-xs">
            {exits.size} exit{exits.size !== 1 ? "s" : ""} · {allReachable}/{rooms.length} rooms reachable
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

          {/* ── Evacuation map ── */}
          <canvas
            ref={canvasRef}
            width={340} height={260}
            className="w-full rounded-xl border border-border/40"
            style={{ background: "#0f172a" }}
          />

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-border/10 rounded-xl p-3 border border-border/40 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Exits</p>
              <p className="text-xl font-bold text-green-400">{exits.size}</p>
            </div>
            <div className="bg-border/10 rounded-xl p-3 border border-border/40 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Worst Time</p>
              <p className="text-xl font-bold" style={{ color: timeColor(worstRoom.time) }}>
                {worstRoom.time > 0 ? timeLabel(worstRoom.time) : "—"}
              </p>
            </div>
            <div className="bg-border/10 rounded-xl p-3 border border-border/40 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Trapped</p>
              <p className={`text-xl font-bold ${trapped > 0 ? "text-red-400" : "text-green-400"}`}>
                {trapped}
              </p>
            </div>
          </div>

          {/* ── Per-room evacuation routes ── */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Evacuation Routes</p>
            {[...results.entries()].map(([name, res]) => {
              const isExit    = exits.has(name);
              const isSingle  = singleExit.includes(name);
              const timeSec   = res?.timeSec ?? null;
              const path      = res?.path ?? [];

              return (
                <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-border/10 border border-border/30">
                  {/* Color dot */}
                  <div className="w-2 h-2 rounded-full shrink-0"
                       style={{ background: isExit ? "#22c55e" : timeColor(timeSec) }} />

                  {/* Room name */}
                  <span className="text-xs text-gray-300 w-28 truncate shrink-0">{name}</span>

                  {/* Path */}
                  <span className="text-[10px] text-gray-600 flex-1 truncate">
                    {isExit
                      ? "🚪 Exit point"
                      : path.length > 1
                        ? path.join(" → ")
                        : "No path to exit"}
                  </span>

                  {/* Time */}
                  <span className="text-xs font-bold shrink-0 w-12 text-right"
                        style={{ color: isExit ? "#22c55e" : timeColor(timeSec) }}>
                    {isExit ? "EXIT" : timeLabel(timeSec)}
                  </span>

                  {/* Warnings */}
                  {isSingle && !isExit && (
                    <span className="text-[10px] text-yellow-500 shrink-0" title="Only one way out">⚠ 1-way</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Dead ends ── */}
          {deadEnds.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs font-bold text-red-400 mb-1">⚠ Trapped rooms — no evacuation path</p>
              <div className="flex flex-wrap gap-1.5">
                {deadEnds.map(name => (
                  <span key={name} className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                Add a connecting door to an adjacent room or a direct exit to fix this.
              </p>
            </div>
          )}

          {/* ── Assembly point ── */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <p className="text-xs font-bold text-green-400 mb-0.5">✅ Assembly Point</p>
            <p className="text-[11px] text-gray-400">{assemblyPoint}</p>
          </div>

          {/* ── Legend ── */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border/30 text-[10px] text-gray-600">
            {[["#22c55e","Exit / < 30s"],["#fde047","30–120s"],["#f97316","2–3 min"],["#ef4444","Trapped"]].map(([c,l]) => (
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
