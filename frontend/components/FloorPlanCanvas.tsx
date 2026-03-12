"use client";

import React, { useRef } from 'react';
import { Stage, Layer, Rect, Text, Line, Arrow, Group, Arc } from 'react-konva';

const ROOM_COLORS: any = {
    'Living Room': '#DBEAFE',       // light blue
    'Master Bedroom': '#FEF3C7',    // light amber
    'Bedroom': '#FEF3C7',
    'Bedroom 1': '#FEF3C7',
    'Bedroom 2': '#FEF3C7',
    'Kitchen': '#FCE7F3',           // light pink
    'Dining': '#D1FAE5',            // light green
    'Kitchen & Dining': '#FCE7F3',
    'Toilet': '#ECFDF5',            // very light green
    'Toilet 1': '#ECFDF5',
    'Toilet 2': '#ECFDF5',
    'Pooja': '#FFF7ED',             // light orange
    'Corridor': '#F3F4F6',          // light gray
    'Store': '#F3F4F6',
    'default': '#FFFFFF'
};

interface FloorPlanCanvasProps {
    data: any;
    units?: "ft" | "m";
    onStageRef?: (ref: any) => void;
}

const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({ data, units = "ft", onStageRef }) => {
    const stageRef = useRef<any>(null);

    if (!data) return null;

    // Professional canvas dimensions
    const CANVAS_WIDTH = 700;
    const CANVAS_HEIGHT = 900;
    const PADDING = 80;
    const WALL = 0.23; // wall thickness in meters

    const availW = CANVAS_WIDTH - PADDING * 2;
    const availH = CANVAS_HEIGHT - PADDING * 2;

    // pixels per meter calculation
    const ppm = Math.min(
        availW / data.plot_w_m,
        availH / data.plot_d_m
    );

    // Center the plot in the canvas
    const plotWpx = data.plot_w_m * ppm;
    const plotHpx = data.plot_d_m * ppm;
    const offsetX = PADDING + (availW - plotWpx) / 2;
    const offsetY = PADDING + (availH - plotHpx) / 2;

    // Helper: Convert meters to feet+inches
    const metersToFeetInches = (m: number) => {
        const totalInches = m * 39.3701;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        // If inches rounds to 12, carry over to feet
        if (inches === 12) {
            return `${feet + 1}'0"`;
        }
        return `${feet}'${inches}"`;
    };

    // Helper: Get dimension text based on units
    const getDimensionText = (w: number, unit: string) => {
        if (unit === "m") {
            return `${w.toFixed(1)}m`;
        } else {
            return metersToFeetInches(w);
        }
    };

    // Helper: Format grade color
    const getGradeColor = (grade: string) => {
        if (grade.startsWith('A')) return '#16a34a'; // green
        if (grade.startsWith('B')) return '#d97706'; // amber
        return '#dc2626'; // red
    };

    // Render window with 3 perpendicular ticks + long line
    const renderWindow = (room: any, win: any) => {
        const rx = offsetX + room.x * ppm;
        const ry = offsetY + room.y * ppm;
        const rw_px = room.w * ppm;
        const rh_px = room.h * ppm;
        const WIN_COLOR = '#2563EB';
        const elements: any[] = [];

        if (win.wall === 'N') {
            const wx_start = rx + rw_px * win.pos - (win.width * ppm) / 2;
            const wx_end = wx_start + win.width * ppm;
            const wy = ry;
            // Long line along wall
            elements.push(<Line key="win-line" points={[wx_start, wy, wx_end, wy]} stroke={WIN_COLOR} strokeWidth={3} />);
            // 3 ticks
            [0.2, 0.5, 0.8].forEach((pct, i) => {
                const tx = wx_start + (wx_end - wx_start) * pct;
                elements.push(<Line key={`win-tick-${i}`} points={[tx, wy - 5, tx, wy + 5]} stroke={WIN_COLOR} strokeWidth={2} />);
            });
        } else if (win.wall === 'S') {
            const wx_start = rx + rw_px * win.pos - (win.width * ppm) / 2;
            const wx_end = wx_start + win.width * ppm;
            const wy = ry + rh_px;
            elements.push(<Line key="win-line" points={[wx_start, wy, wx_end, wy]} stroke={WIN_COLOR} strokeWidth={3} />);
            [0.2, 0.5, 0.8].forEach((pct, i) => {
                const tx = wx_start + (wx_end - wx_start) * pct;
                elements.push(<Line key={`win-tick-${i}`} points={[tx, wy - 5, tx, wy + 5]} stroke={WIN_COLOR} strokeWidth={2} />);
            });
        } else if (win.wall === 'E') {
            const wy_start = ry + rh_px * win.pos - (win.width * ppm) / 2;
            const wy_end = wy_start + win.width * ppm;
            const wx = rx + rw_px;
            elements.push(<Line key="win-line" points={[wx, wy_start, wx, wy_end]} stroke={WIN_COLOR} strokeWidth={3} />);
            [0.2, 0.5, 0.8].forEach((pct, i) => {
                const ty = wy_start + (wy_end - wy_start) * pct;
                elements.push(<Line key={`win-tick-${i}`} points={[wx - 5, ty, wx + 5, ty]} stroke={WIN_COLOR} strokeWidth={2} />);
            });
        } else if (win.wall === 'W') {
            const wy_start = ry + rh_px * win.pos - (win.width * ppm) / 2;
            const wy_end = wy_start + win.width * ppm;
            const wx = rx;
            elements.push(<Line key="win-line" points={[wx, wy_start, wx, wy_end]} stroke={WIN_COLOR} strokeWidth={3} />);
            [0.2, 0.5, 0.8].forEach((pct, i) => {
                const ty = wy_start + (wy_end - wy_start) * pct;
                elements.push(<Line key={`win-tick-${i}`} points={[wx - 5, ty, wx + 5, ty]} stroke={WIN_COLOR} strokeWidth={2} />);
            });
        }
        return <Group key="windows">{elements}</Group>;
    };

    // Collect unique row boundaries for right dimension lines
    const getRowBoundaries = () => {
        const colARooms = data.rooms.filter((r: any) => r.x < data.plot_w_m * 0.45);
        const yBounds: number[] = [0];
        colARooms.forEach((r: any) => {
            if (!yBounds.includes(r.y)) yBounds.push(r.y);
            if (!yBounds.includes(r.y + r.h)) yBounds.push(r.y + r.h);
        });
        yBounds.sort((a, b) => a - b);
        return yBounds;
    };

    const yBounds = getRowBoundaries();

    return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
            <Stage
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{ background: 'white' }}
                ref={(ref) => {
                    stageRef.current = ref;
                    if (onStageRef) onStageRef(ref);
                }}
            >
                <Layer>
                    {/* WHITE BACKGROUND */}
                    <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="white" />

                    {/* PLOT BOUNDARY - OUTER (thick) */}
                    <Rect
                        x={offsetX}
                        y={offsetY}
                        width={plotWpx}
                        height={plotHpx}
                        stroke="#000000"
                        strokeWidth={4}
                        fill="white"
                    />

                    {/* PLOT BOUNDARY - INNER (thin wall line) */}
                    <Rect
                        x={offsetX + WALL * ppm}
                        y={offsetY + WALL * ppm}
                        width={plotWpx - 2 * WALL * ppm}
                        height={plotHpx - 2 * WALL * ppm}
                        stroke="#000000"
                        strokeWidth={1.5}
                        fill="transparent"
                    />

                    {/* ROOMS */}
                    {data.rooms.map((room: any, i: number) => {
                        const roomColor = ROOM_COLORS[room.name] || ROOM_COLORS['default'];
                        const rx = offsetX + room.x * ppm;
                        const ry = offsetY + room.y * ppm;
                        const rw_px = room.w * ppm;
                        const rh_px = room.h * ppm;

                        return (
                            <Group key={i}>
                                {/* Outer wall (thick) */}
                                <Rect
                                    x={rx}
                                    y={ry}
                                    width={rw_px}
                                    height={rh_px}
                                    fill={roomColor}
                                    stroke="#000000"
                                    strokeWidth={5}
                                />

                                {/* Inner wall line (thin) */}
                                <Rect
                                    x={rx + 4}
                                    y={ry + 4}
                                    width={rw_px - 8}
                                    height={rh_px - 8}
                                    fill="transparent"
                                    stroke="#333333"
                                    strokeWidth={1}
                                />

                                {/* Room Name (with Corridor rotation) */}
                                {room.name === "Corridor" && rh_px > rw_px ? (
                                    <Text
                                        x={rx + rw_px / 2}
                                        y={ry + rh_px / 2}
                                        text="Corridor"
                                        fontSize={9}
                                        fontStyle="bold"
                                        fill="#555555"
                                        rotation={-90}
                                        offsetX={0}
                                        offsetY={0}
                                        align="center"
                                        verticalAlign="middle"
                                    />
                                ) : (
                                    rw_px >= 45 && rh_px >= 40 && (
                                        <Text
                                            x={rx}
                                            y={ry + rh_px / 2 - 12}
                                            width={rw_px}
                                            text={room.name}
                                            fontSize={Math.min(rw_px / 7, rh_px / 5, 13)}
                                            fontStyle="bold"
                                            fill="#1a1a1a"
                                            align="center"
                                        />
                                    )
                                )}

                                {/* Room Dimensions (W × H) */}
                                {rw_px >= 45 && rh_px >= 40 && (
                                    <Text
                                        x={rx}
                                        y={ry + rh_px / 2 + 4}
                                        width={rw_px}
                                        text={`${getDimensionText(room.w, units)} × ${getDimensionText(room.h, units)}`}
                                        fontSize={Math.min(rw_px / 8, rh_px / 6, 11)}
                                        fill="#555555"
                                        align="center"
                                    />
                                )}

                                {/* Doors */}
                                {room.door && (() => {
                                    const maxRadius = Math.min(room.w, room.h) * ppm * 0.35;
                                    let radius = Math.max(0, room.door.width * ppm);
                                    if (room.name?.toLowerCase().includes('toilet')) {
                                        radius = Math.min(radius, room.w * ppm * 0.5, room.h * ppm * 0.5);
                                    } else {
                                        radius = Math.min(radius, maxRadius);
                                    }
                                    if (radius === 0) return null;
                                    return (
                                        <Arc key="door"
                                            x={room.door.wall === 'W' ? rx : (room.door.wall === 'E' ? rx + rw_px : (rx + rw_px * room.door.pos))}
                                            y={room.door.wall === 'N' ? ry : (room.door.wall === 'S' ? ry + rh_px : (ry + rh_px * room.door.pos))}
                                            innerRadius={0}
                                            outerRadius={radius}
                                            angle={90}
                                            rotation={
                                                room.door.wall === 'N' ? 0 :
                                                    room.door.wall === 'E' ? 90 :
                                                        room.door.wall === 'S' ? 180 : 270
                                            }
                                            stroke="#1e293b"
                                            strokeWidth={2}
                                        />
                                    );
                                })()}

                                {/* Windows */}
                                {room.window && (() => {
                                    let show = false;
                                    if (room.window.wall === 'N') {
                                        show = room.y <= WALL + 0.05;
                                    } else if (room.window.wall === 'S') {
                                        show = room.y + room.h >= data.plot_d_m - WALL - 0.05;
                                    } else if (room.window.wall === 'E') {
                                        show = room.x + room.w >= data.plot_w_m - WALL - 0.05;
                                    } else if (room.window.wall === 'W') {
                                        show = room.x <= WALL + 0.05;
                                    }
                                    if (!show) return null;
                                    return renderWindow(room, room.window);
                                })()}
                            </Group>
                        );
                    })}

                    {/* DIMENSION LINES - TOP (Column Widths) */}
                    <Group key="top-dims">
                        {[0, 1, 2].map((colIdx) => {
                            const colRooms = data.rooms.filter((r: any) => Math.round(r.x * 1000) / 1000 < data.plot_w_m * 0.42 && colIdx === 0 || Math.abs(r.x - (colIdx === 0 ? 0.23 : (colIdx === 1 ? data.plot_w_m * 0.34 : data.plot_w_m * 0.37))) < 0.1);
                            if (colRooms.length === 0) return null;
                            const col = { x: colRooms[0].x, w: colRooms[0].w };
                            const x1 = offsetX + col.x * ppm;
                            const x2 = offsetX + (col.x + col.w) * ppm;
                            const y = offsetY - 40;
                            return (
                                <Group key={`col-${colIdx}`}>
                                    <Line points={[x1, y, x2, y]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x1, y, x1, y + 8]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x2, y, x2, y + 8]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x1, offsetY, x1, y + 8]} stroke="#ddd" strokeWidth={0.5} />
                                    <Line points={[x2, offsetY, x2, y + 8]} stroke="#ddd" strokeWidth={0.5} />
                                    <Text x={(x1 + x2) / 2} y={y - 18} text={getDimensionText(col.w, units)} fontSize={9} fill="#333" align="center" />
                                </Group>
                            );
                        })}
                    </Group>

                    {/* DIMENSION LINES - RIGHT (Row Heights) */}
                    <Group key="right-dims">
                        {data.rooms.filter((r: any) => r.x < data.plot_w_m * 0.45).sort((a: any, b: any) => a.y - b.y).map((room: any, i: number) => {
                            if (room.h < 0.8) return null; // skip very thin rooms
                            const dimX = offsetX + plotWpx + 30;
                            const segTop = offsetY + room.y * ppm;
                            const segBot = offsetY + (room.y + room.h) * ppm;
                            const segMid = (segTop + segBot) / 2;
                            return (
                                <Group key={`row-${i}`}>
                                    {/* Vertical connector */}
                                    <Line points={[dimX, segTop, dimX, segBot]} stroke="#888" strokeWidth={1} />
                                    {/* Top tick mark */}
                                    <Line points={[dimX - 5, segTop, dimX + 5, segTop]} stroke="#888" strokeWidth={1} />
                                    {/* Bottom tick mark */}
                                    <Line points={[dimX - 5, segBot, dimX + 5, segBot]} stroke="#888" strokeWidth={1} />
                                    {/* Leader from plot edge */}
                                    <Line points={[offsetX + plotWpx, segTop, dimX - 5, segTop]} stroke="#ddd" strokeWidth={0.5} />
                                    <Line points={[offsetX + plotWpx, segBot, dimX - 5, segBot]} stroke="#ddd" strokeWidth={0.5} />
                                    {/* Label */}
                                    <Text x={dimX + 8} y={segMid - 6} text={getDimensionText(room.h, units)} fontSize={9} fill="#333" align="left" />
                                </Group>
                            );
                        })}
                    </Group>

                    {/* SCALE BAR - Bottom Left */}
                    <Group key="scale-bar">
                        <Line points={[offsetX, offsetY + plotHpx + 15, offsetX + 5 * ppm, offsetY + plotHpx + 15]} stroke="#333" strokeWidth={2} />
                        <Line points={[offsetX, offsetY + plotHpx + 11, offsetX, offsetY + plotHpx + 19]} stroke="#333" strokeWidth={1.5} />
                        <Line points={[offsetX + 5 * ppm, offsetY + plotHpx + 11, offsetX + 5 * ppm, offsetY + plotHpx + 19]} stroke="#333" strokeWidth={1.5} />
                        <Text x={offsetX} y={offsetY + plotHpx + 21} text="5m" fontSize={9} fill="#333" align="left" />
                    </Group>

                    {/* NORTH ARROW - Top Right */}
                    <Group key="north-arrow" x={offsetX + plotWpx - 20} y={offsetY + 20}>
                        <Arrow points={[0, 15, 0, 0]} pointerLength={8} pointerWidth={6} fill="#dc2626" stroke="#dc2626" strokeWidth={2} />
                        <Text x={-4} y={18} text="N" fontSize={11} fontStyle="bold" fill="#dc2626" align="center" />
                    </Group>

                    {/* TITLE BLOCK - Bottom (single, always rendered once) */}
                    <Group key="title-block">
                        {/* Separator line above title block */}
                        <Line
                            points={[offsetX, offsetY + plotHpx + 8, offsetX + plotWpx, offsetY + plotHpx + 8]}
                            stroke="#333"
                            strokeWidth={1}
                        />
                        {/* LEFT column: brand name + tagline */}
                        <Text x={offsetX} y={offsetY + plotHpx + 18} text="VASTU ARCHITECT AI" fontSize={13} fontStyle="bold" fill="#1a1a1a" />
                        <Text x={offsetX} y={offsetY + plotHpx + 34} text="AI-Powered Floor Plan Generator" fontSize={9} fill="#6b7280" />
                        {/* CENTER column: plot info — width-anchored so align=center works */}
                        <Text
                            x={offsetX}
                            y={offsetY + plotHpx + 18}
                            width={plotWpx}
                            text={`${data.bhk_type || '3BHK'} | Plot: ${(data.plot_w_m / 0.3048).toFixed(0)}ft × ${(data.plot_d_m / 0.3048).toFixed(0)}ft`}
                            fontSize={11}
                            fill="#1a1a1a"
                            align="center"
                        />
                        <Text
                            x={offsetX}
                            y={offsetY + plotHpx + 34}
                            width={plotWpx}
                            text={`Style: ${data.style || 'modern'}`}
                            fontSize={9}
                            fill="#6b7280"
                            align="center"
                        />
                        {/* RIGHT column: vastu score + grade + URL — offsetX for right-align anchor */}
                        <Text
                            x={offsetX}
                            y={offsetY + plotHpx + 18}
                            width={plotWpx}
                            text={`Vastu Score: ${Math.round(data.compliance?.overall ?? 0)}/100`}
                            fontSize={11}
                            fill="#1a1a1a"
                            align="right"
                        />
                        <Text
                            x={offsetX}
                            y={offsetY + plotHpx + 34}
                            width={plotWpx}
                            text={`Grade ${data.compliance?.grade ?? '-'}`}
                            fontSize={9}
                            fill={getGradeColor(data.compliance?.grade ?? '-')}
                            align="right"
                        />
                        <Text
                            x={offsetX}
                            y={offsetY + plotHpx + 48}
                            width={plotWpx}
                            text="pranit-vision.vercel.app"
                            fontSize={8}
                            fill="#9ca3af"
                            align="right"
                        />
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
