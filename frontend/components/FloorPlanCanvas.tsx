"use client";

import React, { useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Arc, Circle, Group } from 'react-konva';

// ---------------------------------------------------------------------------
// Color map — fuzzy matched by substring
// ---------------------------------------------------------------------------
const ROOM_PALETTE: [string, string][] = [
    ['living',   '#FDE68A'],
    ['dining',   '#FEF3C7'],
    ['kitchen',  '#FECACA'],
    ['master',   '#93C5FD'],
    ['bedroom',  '#BFDBFE'],
    ['toilet',   '#E2E8F0'],
    ['bath',     '#E2E8F0'],
    ['pooja',    '#FBCFE8'],
    ['puja',     '#FBCFE8'],
    ['corridor', '#F1F5F9'],
    ['passage',  '#F1F5F9'],
    ['store',    '#F3F4F6'],
    ['utility',  '#F3F4F6'],
    ['balcony',  '#D1FAE5'],
    ['stair',    '#DDD6FE'],
    ['study',    '#FED7AA'],
];

function getRoomColor(name: string): string {
    const n = name.toLowerCase();
    for (const [key, color] of ROOM_PALETTE) {
        if (n.includes(key)) return color;
    }
    return '#DEF7FF';
}

// ---------------------------------------------------------------------------
// Vastu score → indicator color
// ---------------------------------------------------------------------------
function scoreColor(score: number): string {
    if (score >= 80) return '#22c55e';   // green
    if (score >= 50) return '#eab308';   // yellow
    return '#ef4444';                    // red
}

// ---------------------------------------------------------------------------
// Door rendering helper
// ---------------------------------------------------------------------------
function DoorArc({ room, ppm }: { room: any; ppm: number }) {
    const d = room.door;
    if (!d) return null;

    const dw = d.width * ppm;
    if (dw <= 0) return null;

    // Hinge point (one end of opening) and arc direction
    let hx: number, hy: number, rotation: number;
    switch (d.wall) {
        case 'N':
            hx = (room.x + room.w * d.pos - d.width / 2) * ppm;
            hy = room.y * ppm;
            rotation = 90;
            break;
        case 'S':
            hx = (room.x + room.w * d.pos + d.width / 2) * ppm;
            hy = (room.y + room.h) * ppm;
            rotation = 270;
            break;
        case 'W':
            hx = room.x * ppm;
            hy = (room.y + room.h * d.pos - d.width / 2) * ppm;
            rotation = 0;
            break;
        case 'E':
        default:
            hx = (room.x + room.w) * ppm;
            hy = (room.y + room.h * d.pos + d.width / 2) * ppm;
            rotation = 180;
            break;
    }

    // Door leaf line
    let lx2 = hx, ly2 = hy;
    if (d.wall === 'N')       { lx2 = hx + dw; }
    else if (d.wall === 'S')  { lx2 = hx - dw; }
    else if (d.wall === 'W')  { ly2 = hy + dw; }
    else                      { ly2 = hy - dw; }

    return (
        <>
            <Line points={[hx, hy, lx2, ly2]} stroke="#1e293b" strokeWidth={1.5} />
            <Arc
                x={hx} y={hy}
                innerRadius={0} outerRadius={dw}
                angle={90} rotation={rotation}
                stroke="#1e293b" strokeWidth={1}
                dash={[4, 3]}
            />
        </>
    );
}

// ---------------------------------------------------------------------------
// Window rendering helper
// ---------------------------------------------------------------------------
function WindowMark({ room, ppm }: { room: any; ppm: number }) {
    const w = room.window;
    if (!w) return null;

    const half = (w.width / 2) * ppm;
    let x1: number, y1: number, x2: number, y2: number;

    switch (w.wall) {
        case 'N':
            x1 = (room.x + room.w * w.pos) * ppm - half;
            y1 = room.y * ppm;
            x2 = x1 + half * 2;
            y2 = y1;
            break;
        case 'S':
            x1 = (room.x + room.w * w.pos) * ppm - half;
            y1 = (room.y + room.h) * ppm;
            x2 = x1 + half * 2;
            y2 = y1;
            break;
        case 'W':
            x1 = room.x * ppm;
            y1 = (room.y + room.h * w.pos) * ppm - half;
            x2 = x1;
            y2 = y1 + half * 2;
            break;
        case 'E':
        default:
            x1 = (room.x + room.w) * ppm;
            y1 = (room.y + room.h * w.pos) * ppm - half;
            x2 = x1;
            y2 = y1 + half * 2;
            break;
    }

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    return (
        <>
            <Line points={[x1, y1, x2, y2]} stroke="#3b82f6" strokeWidth={4} />
            {/* Centre tick */}
            {w.wall === 'N' || w.wall === 'S'
                ? <Line points={[mx, my - 4, mx, my + 4]} stroke="#3b82f6" strokeWidth={1.5} />
                : <Line points={[mx - 4, my, mx + 4, my]} stroke="#3b82f6" strokeWidth={1.5} />}
        </>
    );
}

// ---------------------------------------------------------------------------
// Room label (name + dimensions + area)
// ---------------------------------------------------------------------------
function RoomLabel({ room, ppm }: { room: any; ppm: number }) {
    const rw = room.w * ppm;
    const rh = room.h * ppm;

    // Scale font to available space, clamp between 9–13px
    const baseFontSize = Math.min(rw / 8, rh / 4, 13);
    const fontSize = Math.max(9, baseFontSize);
    const lineH = fontSize + 2;

    const cx = room.x * ppm;
    const cy = room.y * ppm;

    const dimText = `${room.w.toFixed(1)} × ${room.h.toFixed(1)} m`;
    const areaText = `${(room.w * room.h).toFixed(1)} m²`;

    // Only show sub-labels if room is big enough to avoid clutter
    const showDims = rw > 60 && rh > 50;
    const showArea = rw > 50 && rh > 65;

    const totalLines = 1 + (showDims ? 1 : 0) + (showArea ? 1 : 0);
    const blockH = totalLines * lineH;
    const startY = cy + rh / 2 - blockH / 2;

    return (
        <>
            <Text
                x={cx} y={startY}
                width={rw}
                text={room.name}
                fontSize={fontSize}
                fontStyle="bold"
                fill="#1e293b"
                align="center"
                listening={false}
            />
            {showDims && (
                <Text
                    x={cx} y={startY + lineH}
                    width={rw}
                    text={dimText}
                    fontSize={Math.max(7, fontSize - 2)}
                    fill="#475569"
                    align="center"
                    listening={false}
                />
            )}
            {showArea && (
                <Text
                    x={cx} y={startY + lineH * 2}
                    width={rw}
                    text={areaText}
                    fontSize={Math.max(7, fontSize - 2)}
                    fill="#64748b"
                    align="center"
                    listening={false}
                />
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface FloorPlanCanvasProps {
    data: any;
    onStageRef?: (ref: any) => void;
}

const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({ data, onStageRef }) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateSize = () => {
            const container = document.getElementById('canvas-container');
            if (container) {
                setDimensions({
                    width: container.offsetWidth,
                    height: container.offsetHeight || 600,
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    if (!data) return null;

    const padding = 48;
    const ppm = Math.max(
        0,
        Math.min(
            (dimensions.width - padding * 2) / data.plot_w_m,
            (dimensions.height - padding * 2) / data.plot_d_m,
        ),
    );

    const offsetX = (dimensions.width - data.plot_w_m * ppm) / 2;
    const offsetY = (dimensions.height - data.plot_d_m * ppm) / 2;

    // Build quick lookup: room name → vastu score
    const vastuScores: Record<string, number> = {};
    for (const rs of data.compliance?.room_scores ?? []) {
        vastuScores[rs.name] = rs.score;
    }

    const plotPxW = data.plot_w_m * ppm;
    const plotPxH = data.plot_d_m * ppm;

    // Scale-bar length: round to nearest 2m
    const scaleMeters = Math.max(2, Math.round(data.plot_w_m / 4 / 2) * 2);
    const scalePx = scaleMeters * ppm;

    return (
        <div
            id="canvas-container"
            className="w-full h-full min-h-[500px] flex items-center justify-center bg-white rounded-lg overflow-hidden"
        >
            <Stage width={dimensions.width} height={dimensions.height} ref={onStageRef}>
                <Layer x={offsetX} y={offsetY}>

                    {/* Plot boundary */}
                    <Rect
                        width={plotPxW} height={plotPxH}
                        stroke="#94a3b8" strokeWidth={2} dash={[8, 4]}
                        fill="white"
                    />

                    {/* Rooms */}
                    {data.rooms.map((room: any, i: number) => {
                        const score = vastuScores[room.name];
                        const hasScore = score !== undefined;

                        return (
                            <Group key={i}>
                                {/* Room fill */}
                                <Rect
                                    x={room.x * ppm} y={room.y * ppm}
                                    width={room.w * ppm} height={room.h * ppm}
                                    fill={getRoomColor(room.name)}
                                    stroke="#334155"
                                    strokeWidth={Math.max(1, ppm * 0.015)}
                                />

                                {/* Vastu score dot (top-right corner) */}
                                {hasScore && (
                                    <Circle
                                        x={(room.x + room.w) * ppm - 7}
                                        y={room.y * ppm + 7}
                                        radius={5}
                                        fill={scoreColor(score)}
                                        opacity={0.85}
                                    />
                                )}

                                <DoorArc room={room} ppm={ppm} />
                                <WindowMark room={room} ppm={ppm} />
                                <RoomLabel room={room} ppm={ppm} />
                            </Group>
                        );
                    })}

                    {/* Plot dimension annotations */}
                    {/* Width (bottom) */}
                    <Line points={[0, plotPxH + 18, plotPxW, plotPxH + 18]} stroke="#64748b" strokeWidth={1} />
                    <Line points={[0, plotPxH + 13, 0, plotPxH + 23]} stroke="#64748b" strokeWidth={1} />
                    <Line points={[plotPxW, plotPxH + 13, plotPxW, plotPxH + 23]} stroke="#64748b" strokeWidth={1} />
                    <Text
                        x={0} y={plotPxH + 22}
                        width={plotPxW}
                        text={`${data.plot_w_m.toFixed(1)} m  (${data.plot_w_ft} ft)`}
                        fontSize={10} fill="#64748b" align="center"
                    />
                    {/* Depth (right) */}
                    <Line points={[plotPxW + 18, 0, plotPxW + 18, plotPxH]} stroke="#64748b" strokeWidth={1} />
                    <Line points={[plotPxW + 13, 0, plotPxW + 23, 0]} stroke="#64748b" strokeWidth={1} />
                    <Line points={[plotPxW + 13, plotPxH, plotPxW + 23, plotPxH]} stroke="#64748b" strokeWidth={1} />
                    <Text
                        x={plotPxW + 22} y={0}
                        height={plotPxH}
                        width={40}
                        text={`${data.plot_d_m.toFixed(1)} m\n(${data.plot_d_ft} ft)`}
                        fontSize={10} fill="#64748b"
                        verticalAlign="middle"
                        align="left"
                    />

                    {/* Scale bar */}
                    <Line points={[0, -20, scalePx, -20]} stroke="#334155" strokeWidth={2} />
                    <Line points={[0, -24, 0, -16]} stroke="#334155" strokeWidth={1.5} />
                    <Line points={[scalePx, -24, scalePx, -16]} stroke="#334155" strokeWidth={1.5} />
                    <Text x={0} y={-34} width={scalePx} text={`${scaleMeters} m`} fontSize={9} fill="#334155" align="center" />

                    {/* North arrow */}
                    <Group x={plotPxW + 22} y={plotPxH - 36}>
                        <Line points={[0, 20, 0, 0, -5, 12, 0, 0, 5, 12, 0, 0]} stroke="#ef4444" strokeWidth={2} />
                        <Text x={-5} y={22} text="N" fontSize={11} fontStyle="bold" fill="#ef4444" />
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
