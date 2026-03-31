"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer, Rect, Group, Text, Line, Transformer } from "react-konva";

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID      = 0.5;  // snap grid, meters
const PAD       = 36;   // canvas padding, px
const MIN_DIM   = 1.0;  // minimum room dimension, meters
const SNAP_DIST = 14;   // px — edge-attachment snap threshold

const WALLS = ["N", "S", "E", "W"] as const;
type Wall = typeof WALLS[number];

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function roomFill(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("living"))   return "#dbeafe";
  if (n.includes("master"))   return "#fef3c7";
  if (n.includes("bed"))      return "#fef9c3";
  if (n.includes("kitchen"))  return "#fce7f3";
  if (n.includes("dining"))   return "#d1fae5";
  if (n.includes("bath") || n.includes("toilet") || n.includes("wc")) return "#dcfce7";
  if (n.includes("pooja") || n.includes("puja")) return "#ffedd5";
  if (n.includes("corridor") || n.includes("passage")) return "#f3f4f6";
  return "#f8fafc";
}

// ─── Inline room component ────────────────────────────────────────────────────
function RoomShape({
  room, scale, selected, onSelect, onDragEnd, onResizeEnd, plotW, plotD, allRooms,
}: {
  room: any; scale: number; selected: boolean;
  onSelect: () => void;
  onDragEnd: (newX: number, newY: number) => void;
  onResizeEnd: (newX: number, newY: number, newW: number, newH: number) => void;
  plotW: number; plotD: number;
  allRooms: any[];
}) {
  // ── Both refs point at the same node: the Group ──
  const groupRef = useRef<any>(null);
  const trRef    = useRef<any>(null);

  const px = PAD + room.x * scale;
  const py = PAD + room.y * scale;
  const pw = room.w * scale;
  const ph = room.h * scale;

  // Attach / detach transformer whenever selection changes.
  // Transformer is always mounted (never conditional) to avoid ref timing issues.
  useEffect(() => {
    if (!trRef.current) return;
    trRef.current.nodes(selected && groupRef.current ? [groupRef.current] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [selected]);

  // ── Snap-to-attach: called every frame during drag ───────────────────────────
  function snapToAttach(pos: { x: number; y: number }): { x: number; y: number } {
    let { x, y } = pos;

    // Edges of the room being dragged (px)
    const rL = x,      rR = x + pw;
    const rT = y,      rB = y + ph;

    let bestDx = SNAP_DIST + 1;
    let bestDy = SNAP_DIST + 1;
    let snapX  = x;
    let snapY  = y;

    for (const other of allRooms) {
      if (other._id === room._id) continue;
      const oL = PAD + other.x * scale;
      const oR = PAD + (other.x + other.w) * scale;
      const oT = PAD + other.y * scale;
      const oB = PAD + (other.y + other.h) * scale;

      // Horizontal candidates: attach + align
      const xCands = [
        { d: Math.abs(rR - oL), v: oL - pw },   // right edge → left edge of other
        { d: Math.abs(rL - oR), v: oR },          // left edge  → right edge of other
        { d: Math.abs(rL - oL), v: oL },          // left-align
        { d: Math.abs(rR - oR), v: oR - pw },     // right-align
      ];
      for (const c of xCands) {
        if (c.d < SNAP_DIST && c.d < bestDx) { bestDx = c.d; snapX = c.v; }
      }

      // Vertical candidates
      const yCands = [
        { d: Math.abs(rB - oT), v: oT - ph },   // bottom → top of other
        { d: Math.abs(rT - oB), v: oB },          // top    → bottom of other
        { d: Math.abs(rT - oT), v: oT },          // top-align
        { d: Math.abs(rB - oB), v: oB - ph },     // bottom-align
      ];
      for (const c of yCands) {
        if (c.d < SNAP_DIST && c.d < bestDy) { bestDy = c.d; snapY = c.v; }
      }
    }

    // Also snap to plot boundary edges
    const plotR = PAD + plotW * scale;
    const plotB = PAD + plotD * scale;
    if (Math.abs(rL - PAD)   < SNAP_DIST) snapX = PAD;
    if (Math.abs(rR - plotR) < SNAP_DIST) snapX = plotR - pw;
    if (Math.abs(rT - PAD)   < SNAP_DIST) snapY = PAD;
    if (Math.abs(rB - plotB) < SNAP_DIST) snapY = plotB - ph;

    // Hard-clamp to stay inside plot
    return {
      x: Math.max(PAD, Math.min(PAD + (plotW - room.w) * scale, snapX)),
      y: Math.max(PAD, Math.min(PAD + (plotD - room.h) * scale, snapY)),
    };
  }

  // Door geometry
  function doorPoints(): number[] {
    const d = room.door;
    if (!d) return [];
    const dpos = d.pos ?? 0.5;
    const dw   = (d.width ?? 0.9) * scale;
    if (d.wall === "N") return [dpos * pw - dw / 2, 0,  dpos * pw + dw / 2, 0];
    if (d.wall === "S") return [dpos * pw - dw / 2, ph, dpos * pw + dw / 2, ph];
    if (d.wall === "W") return [0, dpos * ph - dw / 2, 0, dpos * ph + dw / 2];
    return                     [pw, dpos * ph - dw / 2, pw, dpos * ph + dw / 2]; // E
  }

  // Window geometry
  function windowPoints(): number[] {
    const w = room.window;
    if (!w) return [];
    const wpos = w.pos ?? 0.5;
    const ww   = (w.width ?? 1.2) * scale;
    if (w.wall === "N") return [wpos * pw - ww / 2, 0,  wpos * pw + ww / 2, 0];
    if (w.wall === "S") return [wpos * pw - ww / 2, ph, wpos * pw + ww / 2, ph];
    if (w.wall === "W") return [0, wpos * ph - ww / 2, 0, wpos * ph + ww / 2];
    return                     [pw, wpos * ph - ww / 2, pw, wpos * ph + ww / 2]; // E
  }

  return (
    <>
      {/* ── The Group IS the draggable + transformable unit ── */}
      <Group
        ref={groupRef}
        x={px} y={py}
        draggable
        // onMouseDown fires before drag detection — instant, never missed
        onMouseDown={e => { e.cancelBubble = true; onSelect(); }}
        onTouchStart={e => { e.cancelBubble = true; onSelect(); }}
        dragBoundFunc={pos => snapToAttach(pos)}
        onDragEnd={e => {
          const newX = snap((e.target.x() - PAD) / scale);
          const newY = snap((e.target.y() - PAD) / scale);
          onDragEnd(newX, newY);
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          // Read scale applied by Transformer, then reset it
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          // node.x() / node.y() are Stage-relative (correct) after transform
          const newW = snap(Math.max(MIN_DIM, (pw * sx) / scale));
          const newH = snap(Math.max(MIN_DIM, (ph * sy) / scale));
          const newX = snap((node.x() - PAD) / scale);
          const newY = snap((node.y() - PAD) / scale);
          onResizeEnd(
            Math.max(0, Math.min(newX, plotW - newW)),
            Math.max(0, Math.min(newY, plotD - newH)),
            newW, newH,
          );
        }}
      >
        <Rect
          width={pw} height={ph}
          fill={roomFill(room.name)}
          stroke={selected ? "#6366f1" : "#94a3b8"}
          strokeWidth={selected ? 2.5 : 1}
          shadowEnabled={selected}
          shadowColor="#6366f1"
          shadowBlur={8}
          shadowOpacity={0.4}
        />
        <Text
          text={`${room.name}\n${(room.w * room.h).toFixed(1)}m²`}
          width={pw} height={ph}
          align="center" verticalAlign="middle"
          fontSize={Math.max(8, Math.min(12, pw * 0.13))}
          fontStyle="600"
          fill="#1e293b"
          listening={false}
        />
        {room.door && (
          <Line points={doorPoints()} stroke="#92400e" strokeWidth={4} lineCap="round" listening={false} />
        )}
        {room.window && (
          <Line points={windowPoints()} stroke="#3b82f6" strokeWidth={3} dash={[5, 3]} lineCap="round" listening={false} />
        )}
      </Group>

      {/* Transformer is always rendered — nodes set to [] when not selected */}
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        keepRatio={false}
        enabledAnchors={[
          "top-left","top-center","top-right",
          "middle-left","middle-right",
          "bottom-left","bottom-center","bottom-right",
        ]}
        boundBoxFunc={(oldBox, newBox) => {
          if (newBox.width < MIN_DIM * scale || newBox.height < MIN_DIM * scale) return oldBox;
          return newBox;
        }}
        anchorStroke="#6366f1"
        anchorFill="#ffffff"
        anchorSize={9}
        anchorCornerRadius={2}
        borderStroke="#6366f1"
        borderDash={[4, 3]}
      />
    </>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
interface PlanEditorProps {
  data: any;
  onApply: (newData: any) => void;
  onClose: () => void;
}

export default function PlanEditor({ data, onApply, onClose }: PlanEditorProps) {
  // Attach a stable _id to each room so selection survives renames
  const [rooms, setRooms]         = useState<any[]>(() =>
    data.rooms.map((r: any, i: number) => ({ ...r, _id: i }))
  );
  const [selected, setSelected]   = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<any[][]>([]);
  const stageRef                  = useRef<any>(null);

  const plotW: number = data.plot_w_m ?? 9;
  const plotD: number = data.plot_d_m ?? 9;

  // Fit plot to available canvas space (max ~620x520)
  const scale = Math.min(620 / plotW, 520 / plotD);
  const stageW = plotW * scale + PAD * 2;
  const stageH = plotD * scale + PAD * 2;

  // Grid lines
  const gridLines: number[] = [];
  for (let x = 0; x <= plotW; x += GRID) gridLines.push(x);
  const gridLinesH: number[] = [];
  for (let y = 0; y <= plotD; y += GRID) gridLinesH.push(y);

  // ── Undo ────────────────────────────────────────────────────────────────────
  const pushUndo = useCallback(() => {
    setUndoStack(s => [...s.slice(-30), JSON.parse(JSON.stringify(rooms))]);
  }, [rooms]);

  const undo = useCallback(() => {
    setUndoStack(s => {
      if (!s.length) return s;
      const prev  = s[s.length - 1];
      setRooms(prev);
      return s.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo]);

  // ── Room mutations (keyed by stable _id) ────────────────────────────────────
  const updateRoom = (id: number, patch: Partial<any>) => {
    pushUndo();
    setRooms(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  };

  const deleteRoom = (id: number) => {
    pushUndo();
    setRooms(rs => rs.filter(r => r._id !== id));
    setSelected(null);
  };

  const addRoom = () => {
    pushUndo();
    const id   = Date.now();
    const name = `Room ${rooms.length + 1}`;
    setRooms(rs => [...rs, {
      name, x: 0, y: 0, w: 3.0, h: 3.0,
      _id: id,
      door:   { wall: "S", pos: 0.5, width: 0.9 },
      window: { wall: "N", pos: 0.5, width: 1.2 },
    }]);
    setSelected(id);
  };

  const sel = rooms.find(r => r._id === selected);

  // ── Apply — strip internal _id before returning ──────────────────────────────
  const apply = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cleanRooms = rooms.map(({ _id, ...r }) => r);
    onApply({ ...data, rooms: cleanRooms, room_count: cleanRooms.length });
    onClose();
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 600 }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-panel/80 backdrop-blur shrink-0">
        <span className="text-sm font-bold text-white flex-1">Plan Editor</span>

        <button onClick={addRoom}
          className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/80 transition-colors font-semibold">
          + Add Room
        </button>
        <button onClick={undo} disabled={!undoStack.length}
          className="text-xs px-3 py-1.5 rounded-lg bg-border/40 text-gray-300 hover:bg-border/60 disabled:opacity-30 transition-colors"
          title="Undo (Ctrl+Z)">
          ↩ Undo
        </button>
        <button onClick={apply}
          className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-semibold">
          ✓ Apply Changes
        </button>
        <button onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg bg-border/40 text-gray-400 hover:text-white transition-colors">
          ✕ Cancel
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-auto bg-[#0f172a] flex items-start justify-start p-4">
          <Stage
            ref={stageRef}
            width={stageW}
            height={stageH}
            // Deselect when clicking empty canvas (cancelBubble on rooms prevents this from firing for room clicks)
            onMouseDown={e => { if (e.target === e.target.getStage()) setSelected(null); }}
            onTouchStart={e => { if (e.target === e.target.getStage()) setSelected(null); }}
          >
            <Layer>
              {/* Grid */}
              {gridLines.map(x => (
                <Line key={`gx${x}`} points={[PAD + x * scale, PAD, PAD + x * scale, PAD + plotD * scale]}
                  stroke="#1e293b" strokeWidth={x % 1 === 0 ? 0.8 : 0.3} />
              ))}
              {gridLinesH.map(y => (
                <Line key={`gy${y}`} points={[PAD, PAD + y * scale, PAD + plotW * scale, PAD + y * scale]}
                  stroke="#1e293b" strokeWidth={y % 1 === 0 ? 0.8 : 0.3} />
              ))}

              {/* Plot boundary */}
              <Rect x={PAD} y={PAD} width={plotW * scale} height={plotD * scale}
                stroke="#334155" strokeWidth={2} fill="transparent" />

              {/* Rooms */}
              {rooms.map(room => (
                <RoomShape
                  key={room._id}
                  room={room}
                  scale={scale}
                  selected={selected === room._id}
                  onSelect={() => setSelected(room._id)}
                  plotW={plotW} plotD={plotD}
                  allRooms={rooms}
                  onDragEnd={(nx, ny) => updateRoom(room._id, { x: nx, y: ny })}
                  onResizeEnd={(nx, ny, nw, nh) => updateRoom(room._id, { x: nx, y: ny, w: nw, h: nh })}
                />
              ))}
            </Layer>
          </Stage>

          {/* Legend */}
          <div className="absolute bottom-6 left-6 flex gap-3 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-4 h-1 bg-amber-700 inline-block rounded" /> Door
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-0.5 bg-blue-500 inline-block rounded border-b border-dashed border-blue-500" /> Window
            </span>
            <span className="text-gray-700">Grid: 0.5m · Drag to move · Corner handles to resize</span>
          </div>
        </div>

        {/* ── Properties panel ── */}
        <div className="w-64 shrink-0 border-l border-border bg-panel overflow-y-auto">
          {sel ? (
            <div className="p-4 space-y-4">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Room Properties</p>

              {/* Name */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Name</label>
                <input
                  value={sel.name}
                  onChange={e => updateRoom(sel._id, { name: e.target.value })}
                  className="w-full bg-border/30 border border-border rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Size (read + snap) */}
              <div className="grid grid-cols-2 gap-2">
                {[["Width (m)", "w"], ["Depth (m)", "h"]].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
                    <input type="number" step={GRID} min={MIN_DIM}
                      value={Number(sel[key]).toFixed(1)}
                      onChange={e => updateRoom(sel._id, { [key]: snap(Math.max(MIN_DIM, +e.target.value)) })}
                      className="w-full bg-border/30 border border-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                ))}
              </div>

              {/* Position */}
              <div className="grid grid-cols-2 gap-2">
                {[["X (m)", "x"], ["Y (m)", "y"]].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
                    <input type="number" step={GRID} min={0}
                      value={Number(sel[key]).toFixed(1)}
                      onChange={e => updateRoom(sel._id, { [key]: snap(Math.max(0, +e.target.value)) })}
                      className="w-full bg-border/30 border border-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                ))}
              </div>

              {/* Door */}
              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-amber-500 uppercase tracking-wider font-bold">Door</p>
                  {sel.door
                    ? <button onClick={() => updateRoom(sel._id, { door: null })}
                        className="text-[9px] text-red-400 hover:text-red-300">Remove</button>
                    : <button onClick={() => updateRoom(sel._id, { door: { wall: "S", pos: 0.5, width: 0.9 } })}
                        className="text-[9px] text-green-400 hover:text-green-300">+ Add</button>
                  }
                </div>
                {sel.door && (
                  <div className="space-y-2">
                    {/* Wall */}
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Wall</label>
                      <div className="grid grid-cols-4 gap-1">
                        {WALLS.map(w => (
                          <button key={w} onClick={() => updateRoom(sel._id, { door: { ...sel.door, wall: w } })}
                            className={`text-[10px] py-1 rounded font-bold transition-colors ${sel.door.wall === w ? "bg-amber-600 text-white" : "bg-border/30 text-gray-400 hover:text-white"}`}>
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Position */}
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Position: <span className="text-white">{(sel.door.pos * 100).toFixed(0)}%</span>
                      </label>
                      <input type="range" min={0.1} max={0.9} step={0.05}
                        value={sel.door.pos}
                        onChange={e => updateRoom(sel._id, { door: { ...sel.door, pos: +e.target.value } })}
                        className="w-full accent-amber-500" />
                    </div>
                    {/* Width */}
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Width: <span className="text-white">{sel.door.width?.toFixed(1)}m</span>
                      </label>
                      <input type="range" min={0.7} max={1.5} step={0.1}
                        value={sel.door.width ?? 0.9}
                        onChange={e => updateRoom(sel._id, { door: { ...sel.door, width: +e.target.value } })}
                        className="w-full accent-amber-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Window */}
              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-blue-400 uppercase tracking-wider font-bold">Window</p>
                  {sel.window
                    ? <button onClick={() => updateRoom(sel._id, { window: null })}
                        className="text-[9px] text-red-400 hover:text-red-300">Remove</button>
                    : <button onClick={() => updateRoom(sel._id, { window: { wall: "N", pos: 0.5, width: 1.2 } })}
                        className="text-[9px] text-green-400 hover:text-green-300">+ Add</button>
                  }
                </div>
                {sel.window && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Wall</label>
                      <div className="grid grid-cols-4 gap-1">
                        {WALLS.map(w => (
                          <button key={w} onClick={() => updateRoom(sel._id, { window: { ...sel.window, wall: w } })}
                            className={`text-[10px] py-1 rounded font-bold transition-colors ${sel.window.wall === w ? "bg-blue-600 text-white" : "bg-border/30 text-gray-400 hover:text-white"}`}>
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Position: <span className="text-white">{(sel.window.pos * 100).toFixed(0)}%</span>
                      </label>
                      <input type="range" min={0.1} max={0.9} step={0.05}
                        value={sel.window.pos}
                        onChange={e => updateRoom(sel._id, { window: { ...sel.window, pos: +e.target.value } })}
                        className="w-full accent-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">
                        Width: <span className="text-white">{sel.window.width?.toFixed(1)}m</span>
                      </label>
                      <input type="range" min={0.6} max={2.4} step={0.1}
                        value={sel.window.width ?? 1.2}
                        onChange={e => updateRoom(sel._id, { window: { ...sel.window, width: +e.target.value } })}
                        className="w-full accent-blue-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Area info */}
              <div className="border-t border-border/40 pt-3 text-[10px] text-gray-600">
                Area: {(sel.w * sel.h).toFixed(1)} m²
              </div>

              {/* Delete */}
              <button onClick={() => deleteRoom(sel._id)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors">
                Delete Room
              </button>
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-xs text-gray-600">Click a room to edit its properties</p>
              <p className="text-[10px] text-gray-700">Drag to move · Corner handles to resize</p>
              <p className="text-[10px] text-gray-700">Ctrl+Z to undo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
