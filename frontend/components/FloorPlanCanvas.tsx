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

    // Helper: Validate window is on plot boundary
    const wallTouchesBoundary = (room: any, wall: string, plot_w_m: number, plot_d_m: number) => {
        const TOL = 0.35;
        if (wall === "N") return room.y <= TOL;
        if (wall === "S") return (room.y + room.h) >= (plot_d_m - TOL);
        if (wall === "W") return room.x <= TOL;
        if (wall === "E") return (room.x + room.w) >= (plot_w_m - TOL);
        return false;
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


                    {/* ROOMS */}
                    {/* 1. ROOM FILLS (Bottom-most) */}
                    {data.rooms.map((room: any, i: number) => {
                        const roomColor = ROOM_COLORS[room.name] || ROOM_COLORS['default'];
                        const rx = offsetX + room.x * ppm;
                        const ry = offsetY + room.y * ppm;
                        const rw = room.w * ppm;
                        const rh = room.h * ppm;

                        return (
                            <Rect
                                key={`fill-${i}`}
                                x={rx}
                                y={ry}
                                width={rw}
                                height={rh}
                                fill={roomColor}
                                stroke="transparent"
                            />
                        );
                    })}

                    {/* 2. COLLECT WALL SEGMENTS & DRAW WALL FILLS + LINES */}
                    {(() => {
                        const wallSegments: any[] = [];
                        const addWall = (x1: number, y1: number, x2: number, y2: number, isOuter: boolean) => {
                            // Deduplication: check if this segment (or reverse) already exists
                            const exists = wallSegments.some(w =>
                                (Math.abs(w.x1 - x1) < 2 && Math.abs(w.y1 - y1) < 2 && Math.abs(w.x2 - x2) < 2 && Math.abs(w.y2 - y2) < 2) ||
                                (Math.abs(w.x1 - x2) < 2 && Math.abs(w.y1 - y2) < 2 && Math.abs(w.x2 - x1) < 2 && Math.abs(w.y2 - y1) < 2)
                            );
                            if (!exists) {
                                wallSegments.push({ x1, y1, x2, y2, isOuter });
                            }
                        };

                        data.rooms.forEach((room: any) => {
                            const rx1 = offsetX + room.x * ppm;
                            const ry1 = offsetY + room.y * ppm;
                            const rx2 = rx1 + room.w * ppm;
                            const ry2 = ry1 + room.h * ppm;

                            const isN_outer = room.y <= 0.30;
                            const isS_outer = (room.y + room.h) >= (data.plot_d_m - 0.30);
                            const isW_outer = room.x <= 0.30;
                            const isE_outer = (room.x + room.w) >= (data.plot_w_m - 0.30);

                            addWall(rx1, ry1, rx2, ry1, isN_outer); // north
                            addWall(rx1, ry2, rx2, ry2, isS_outer); // south
                            addWall(rx1, ry1, rx1, ry2, isW_outer); // west
                            addWall(rx2, ry1, rx2, ry2, isE_outer); // east
                        });

                        return wallSegments.map((w, i) => {
                            const isOuter = w.isOuter;
                            const isHorizontal = Math.abs(w.y1 - w.y2) < 1;
                            const gap = isOuter ? 5 : 2.5;
                            const half = gap / 2;
                            const strokeWidth = isOuter ? 1.5 : 1;
                            const color = "#1a1a1a";

                            if (isHorizontal) {
                                const x1_ext = w.x1 - half;
                                const x2_ext = w.x2 + half;
                                return (
                                    <Group key={`wall-${i}`}>
                                        {/* Wall White Fill */}
                                        <Rect
                                            x={x1_ext}
                                            y={w.y1 - half}
                                            width={x2_ext - x1_ext}
                                            height={gap}
                                            fill="white"
                                            stroke="transparent"
                                        />
                                        {/* Top Line */}
                                        <Line
                                            points={[x1_ext, w.y1 - half, x2_ext, w.y1 - half]}
                                            stroke={color}
                                            strokeWidth={strokeWidth}
                                        />
                                        {/* Bottom Line */}
                                        <Line
                                            points={[x1_ext, w.y1 + half, x2_ext, w.y1 + half]}
                                            stroke={color}
                                            strokeWidth={strokeWidth}
                                        />
                                    </Group>
                                );
                            } else {
                                const y1_ext = w.y1 - half;
                                const y2_ext = w.y2 + half;
                                return (
                                    <Group key={`wall-${i}`}>
                                        {/* Wall White Fill */}
                                        <Rect
                                            x={w.x1 - half}
                                            y={y1_ext}
                                            width={gap}
                                            height={y2_ext - y1_ext}
                                            fill="white"
                                            stroke="transparent"
                                        />
                                        {/* Left Line */}
                                        <Line
                                            points={[w.x1 - half, y1_ext, w.x1 - half, y2_ext]}
                                            stroke={color}
                                            strokeWidth={strokeWidth}
                                        />
                                        {/* Right Line */}
                                        <Line
                                            points={[w.x1 + half, y1_ext, w.x1 + half, y2_ext]}
                                            stroke={color}
                                            strokeWidth={strokeWidth}
                                        />
                                    </Group>
                                );
                            }
                        });
                    })()}

                    {/* 3. DOOR CLEARING & ARCS */}
                    {data.rooms.map((room: any, i: number) => {
                        if (!room.door) return null;
                        const rx = offsetX + room.x * ppm;
                        const ry = offsetY + room.y * ppm;
                        const rw = room.w * ppm;
                        const rh = room.h * ppm;

                        const isOuterWall = (room.door.wall === 'N' && room.y <= 0.30) ||
                                           (room.door.wall === 'S' && (room.y + room.h) >= (data.plot_d_m - 0.30)) ||
                                           (room.door.wall === 'W' && room.x <= 0.30) ||
                                           (room.door.wall === 'E' && (room.x + room.w) >= (data.plot_w_m - 0.30));
                        
                        const gap = isOuterWall ? 5 : 2.5;
                        const doorW = room.door.width * ppm;
                        const roomColor = ROOM_COLORS[room.name] || ROOM_COLORS['default'];

                        let clearRect = null;
                        const dx = room.door.wall === 'W' ? rx : (room.door.wall === 'E' ? rx + rw : (rx + rw * room.door.pos));
                        const dy = room.door.wall === 'N' ? ry : (room.door.wall === 'S' ? ry + rh : (ry + rh * room.door.pos));

                        if (room.door.wall === 'N' || room.door.wall === 'S') {
                            clearRect = (
                                <Rect
                                    x={dx - doorW / 2}
                                    y={dy - (gap + 4) / 2}
                                    width={doorW}
                                    height={gap + 4}
                                    fill={roomColor}
                                />
                            );
                        } else {
                            clearRect = (
                                <Rect
                                    x={dx - (gap + 4) / 2}
                                    y={dy - doorW / 2}
                                    width={gap + 4}
                                    height={doorW}
                                    fill={roomColor}
                                />
                            );
                        }

                        const maxRadius = Math.min(room.w, room.h) * ppm * 0.35;
                        let radius = Math.max(0, room.door.width * ppm);
                        if (room.name?.toLowerCase().includes('toilet')) {
                            radius = Math.min(radius, room.w * ppm * 0.5, room.h * ppm * 0.5);
                        } else {
                            radius = Math.min(radius, maxRadius);
                        }

                        return (
                            <Group key={`door-${i}`}>
                                {clearRect}
                                {radius > 0 && (
                                    <Arc
                                        x={dx}
                                        y={dy}
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
                                )}
                            </Group>
                        );
                    })}

                    {/* 4. WINDOWS (On top of walls) */}
                    {data.rooms.map((room: any, i: number) => {
                        if (!room.window) return null;
                        if (!wallTouchesBoundary(room, room.window.wall, data.plot_w_m, data.plot_d_m)) return null;
                        
                        return renderWindow(room, room.window);
                    })}

                    {/* 5. TEXT LABELS (On top) */}
                    {data.rooms.map((room: any, i: number) => {
                        const rx = offsetX + room.x * ppm;
                        const ry = offsetY + room.y * ppm;
                        const rw = room.w * ppm;
                        const rh = room.h * ppm;

                        return (
                            <Group key={`labels-${i}`}>
                                {room.name === "Corridor" && rh > rw ? (
                                    <Text
                                        x={rx + rw / 2}
                                        y={ry + rh / 2}
                                        text="Corridor"
                                        fontSize={9}
                                        fontStyle="bold"
                                        fill="#555555"
                                        rotation={-90}
                                        align="center"
                                        verticalAlign="middle"
                                    />
                                ) : (
                                    rw >= 45 && rh >= 40 && (
                                        <>
                                            <Text
                                                x={rx}
                                                y={ry + rh / 2 - 12}
                                                width={rw}
                                                text={room.name}
                                                fontSize={Math.min(rw / 7, rh / 5, 13)}
                                                fontStyle="bold"
                                                fill="#1a1a1a"
                                                align="center"
                                            />
                                            <Text
                                                x={rx}
                                                y={ry + rh / 2 + 4}
                                                width={rw}
                                                text={`${getDimensionText(room.w, units)} × ${getDimensionText(room.h, units)}`}
                                                fontSize={Math.min(rw / 8, rh / 6, 11)}
                                                fill="#555555"
                                                align="center"
                                            />
                                        </>
                                    )
                                )}
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

                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
