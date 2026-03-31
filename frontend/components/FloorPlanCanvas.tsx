"use client";

import React, { useRef } from 'react';
import { Stage, Layer, Rect, Text, Line, Arrow, Group, Arc } from 'react-konva';

// Fuzzy room color lookup — matches partial/variant names from the engine
function getRoomColor(roomName: string): string {
    const n = roomName.toLowerCase();
    if (n.includes('living'))                          return '#DBEAFE';
    if (n.includes('master'))                          return '#FEF3C7';
    if (n.includes('bedroom') || n.includes('bed'))   return '#FEF3C7';
    if (n.includes('kitchen'))                         return '#FCE7F3';
    if (n.includes('dining'))                          return '#D1FAE5';
    if (n.includes('toilet') || n.includes('wc') ||
        n.includes('bathroom') || n.includes('bath')) return '#ECFDF5';
    if (n.includes('pooja') || n.includes('puja'))     return '#FFF7ED';
    if (n.includes('corridor') || n.includes('passage') ||
        n.includes('hall'))                            return '#F3F4F6';
    if (n.includes('store') || n.includes('storage')) return '#F3F4F6';
    if (n.includes('balcony') || n.includes('terrace')) return '#EDE9FE';
    return '#FFFFFF';
}

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

    // Wall thickness in pixels
    const WALL_PX = WALL * ppm;

    // Center the plot in the canvas
    const plotWpx = data.plot_w_m * ppm;
    const plotHpx = data.plot_d_m * ppm;
    const offsetX = PADDING + (availW - plotWpx) / 2;
    const offsetY = PADDING + (availH - plotHpx) / 2;

    // Snap meter coordinates to integer pixels — eliminates sub-pixel gaps between rooms
    const snapX = (m: number) => Math.round(offsetX + m * ppm);
    const snapY = (m: number) => Math.round(offsetY + m * ppm);

    // Helper: Convert meters to feet+inches
    const metersToFeetInches = (m: number) => {
        const totalInches = m * 39.3701;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        if (inches === 12) return `${feet + 1}'0"`;
        return `${feet}'${inches}"`;
    };

    // Helper: Get dimension text based on units
    const getDimensionText = (w: number, unit: string) => {
        if (unit === "m") return `${w.toFixed(1)}m`;
        return metersToFeetInches(w);
    };

    // Helper: Format grade color
    const getGradeColor = (grade: string) => {
        if (grade.startsWith('A')) return '#16a34a';
        if (grade.startsWith('B')) return '#d97706';
        return '#dc2626';
    };

    // Render window as 3 parallel lines within wall thickness — standard architectural notation.
    // Each window gets a white rectangle erasing the wall, then 3 colored lines across the opening.
    const renderWindow = (room: any, win: any) => {
        // Use snapped coords to match the room rect exactly
        const rx = snapX(room.x);
        const ry = snapY(room.y);
        const rw_px = snapX(room.x + room.w) - rx;
        const rh_px = snapY(room.y + room.h) - ry;
        const WIN_COLOR = '#2563EB';
        const elements: any[] = [];
        const winPx = win.width * ppm;

        if (win.wall === 'N') {
            const wx_start = rx + rw_px * win.pos - winPx / 2;
            const wx_end = wx_start + winPx;
            // Erase wall zone then draw 3 horizontal lines
            elements.push(<Rect key="win-bg" x={wx_start} y={ry - WALL_PX} width={wx_end - wx_start} height={WALL_PX} fill="white" />);
            [0.2, 0.5, 0.8].forEach((t, i) => {
                const ly = ry - WALL_PX * (1 - t);
                elements.push(<Line key={`wl-${i}`} points={[wx_start, ly, wx_end, ly]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            });
        } else if (win.wall === 'S') {
            const wx_start = rx + rw_px * win.pos - winPx / 2;
            const wx_end = wx_start + winPx;
            const wy = ry + rh_px;
            elements.push(<Rect key="win-bg" x={wx_start} y={wy} width={wx_end - wx_start} height={WALL_PX} fill="white" />);
            [0.2, 0.5, 0.8].forEach((t, i) => {
                const ly = wy + WALL_PX * t;
                elements.push(<Line key={`wl-${i}`} points={[wx_start, ly, wx_end, ly]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            });
        } else if (win.wall === 'E') {
            const wy_start = ry + rh_px * win.pos - winPx / 2;
            const wy_end = wy_start + winPx;
            const wx = rx + rw_px;
            elements.push(<Rect key="win-bg" x={wx} y={wy_start} width={WALL_PX} height={wy_end - wy_start} fill="white" />);
            [0.2, 0.5, 0.8].forEach((t, i) => {
                const lx = wx + WALL_PX * t;
                elements.push(<Line key={`wl-${i}`} points={[lx, wy_start, lx, wy_end]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            });
        } else if (win.wall === 'W') {
            const wy_start = ry + rh_px * win.pos - winPx / 2;
            const wy_end = wy_start + winPx;
            const wx = rx;
            elements.push(<Rect key="win-bg" x={wx - WALL_PX} y={wy_start} width={WALL_PX} height={wy_end - wy_start} fill="white" />);
            [0.2, 0.5, 0.8].forEach((t, i) => {
                const lx = wx - WALL_PX * (1 - t);
                elements.push(<Line key={`wl-${i}`} points={[lx, wy_start, lx, wy_end]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            });
        }
        return <Group key="windows">{elements}</Group>;
    };

    // Pre-compute right-side dimension labels with 18px minimum spacing
    const rightDimRooms = [...data.rooms]
        .filter((r: any) => r.x < data.plot_w_m * 0.45 && r.h >= 0.6)
        .sort((a: any, b: any) => a.y - b.y);

    const visibleDimRooms: any[] = [];
    let lastLabelPx = -999;
    rightDimRooms.forEach((room: any) => {
        const midY = offsetY + (room.y + room.h / 2) * ppm;
        if (midY - lastLabelPx >= 18) {
            visibleDimRooms.push(room);
            lastLabelPx = midY;
        }
    });

    // Sort rooms largest-area first so small rooms (toilets) render on top and aren't buried
    const sortedRooms = [...data.rooms].sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h));

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
                        x={offsetX + WALL_PX}
                        y={offsetY + WALL_PX}
                        width={plotWpx - 2 * WALL_PX}
                        height={plotHpx - 2 * WALL_PX}
                        stroke="#000000"
                        strokeWidth={1.5}
                        fill="transparent"
                    />

                    {/* ROOMS — large rooms first so small rooms (toilets) aren't hidden */}
                    {sortedRooms.map((room: any, i: number) => {
                        const roomColor = getRoomColor(room.name);

                        // Snapped pixel coords — eliminates sub-pixel gaps between adjacent rooms
                        const rx = snapX(room.x);
                        const ry = snapY(room.y);
                        const rw_px = snapX(room.x + room.w) - rx;
                        const rh_px = snapY(room.y + room.h) - ry;

                        // Skip degenerate rooms (zero/negative size from bad data)
                        if (rw_px <= 0 || rh_px <= 0) return null;

                        // Door swing radius — capped so it never leaves the room
                        let doorElement = null;
                        if (room.door) {
                            const maxR = Math.min(rw_px, rh_px) * 0.9;
                            const radius = Math.min(room.door.width * ppm, maxR);
                            if (radius > 0) {
                                const doorX =
                                    room.door.wall === 'W' ? rx :
                                    room.door.wall === 'E' ? rx + rw_px :
                                    rx + rw_px * room.door.pos;
                                const doorY =
                                    room.door.wall === 'N' ? ry :
                                    room.door.wall === 'S' ? ry + rh_px :
                                    ry + rh_px * room.door.pos;
                                // rotation sets the start angle of the arc sweep.
                                // For each wall the arc should swing INWARD (perpendicular to wall first):
                                //   N wall: start pointing south (90°) → sweeps west (180°) — into room ✓
                                //   E wall: start pointing west  (180°)→ sweeps north (270°) — into room ✓
                                //   S wall: start pointing north (270°)→ sweeps east  (0°)  — into room ✓
                                //   W wall: start pointing east  (0°)  → sweeps south (90°) — into room ✓
                                const rotation =
                                    room.door.wall === 'N' ? 90 :
                                    room.door.wall === 'E' ? 180 :
                                    room.door.wall === 'S' ? 270 : 0;

                                // Clip the arc to room bounds (+1px margin keeps the stroke on-edge)
                                doorElement = (
                                    <Group clipX={rx - 1} clipY={ry - 1} clipWidth={rw_px + 2} clipHeight={rh_px + 2}>
                                        <Arc
                                            x={doorX}
                                            y={doorY}
                                            innerRadius={0}
                                            outerRadius={radius}
                                            angle={90}
                                            rotation={rotation}
                                            stroke="#1e293b"
                                            strokeWidth={2}
                                        />
                                    </Group>
                                );
                            }
                        }

                        // Window — only on exterior walls touching the plot boundary
                        let windowElement = null;
                        if (room.window) {
                            let show = false;
                            if (room.window.wall === 'N') show = room.y <= WALL + 0.05;
                            else if (room.window.wall === 'S') show = room.y + room.h >= data.plot_d_m - WALL - 0.05;
                            else if (room.window.wall === 'E') show = room.x + room.w >= data.plot_w_m - WALL - 0.05;
                            else if (room.window.wall === 'W') show = room.x <= WALL + 0.05;
                            if (show) windowElement = renderWindow(room, room.window);
                        }

                        return (
                            <Group key={i}>
                                {/* Filled room */}
                                <Rect
                                    x={rx}
                                    y={ry}
                                    width={rw_px}
                                    height={rh_px}
                                    fill={roomColor}
                                    stroke="#000000"
                                    strokeWidth={5}
                                />

                                {/* Inner wall line (thin) — only if room is big enough */}
                                {rw_px > 16 && rh_px > 16 && (
                                    <Rect
                                        x={rx + 4}
                                        y={ry + 4}
                                        width={rw_px - 8}
                                        height={rh_px - 8}
                                        fill="transparent"
                                        stroke="#333333"
                                        strokeWidth={1}
                                    />
                                )}

                                {/* Room Name */}
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
                                    rw_px >= 40 && rh_px >= 35 && (
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
                                {rw_px >= 40 && rh_px >= 35 && (
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

                                {/* Door arc — clipped to room bounds */}
                                {doorElement}

                                {/* Window — 3 parallel lines in wall thickness */}
                                {windowElement}
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

                    {/* DIMENSION LINES - RIGHT (Row Heights) — minimum 18px spacing */}
                    <Group key="right-dims">
                        {visibleDimRooms.map((room: any, i: number) => {
                            const y1 = offsetY + room.y * ppm;
                            const y2 = offsetY + (room.y + room.h) * ppm;
                            const x = offsetX + plotWpx + 30;
                            return (
                                <Group key={`row-${i}`}>
                                    <Line points={[x, y1, x, y2]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x, y1, x - 8, y1]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x, y2, x - 8, y2]} stroke="#888" strokeWidth={1} />
                                    <Line points={[offsetX + plotWpx, y1, x - 8, y1]} stroke="#ddd" strokeWidth={0.5} />
                                    <Line points={[offsetX + plotWpx, y2, x - 8, y2]} stroke="#ddd" strokeWidth={0.5} />
                                    <Text x={x + 8} y={(y1 + y2) / 2 - 6} text={getDimensionText(room.h, units)} fontSize={9} fill="#333" align="left" />
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

                    {/* TITLE BLOCK - Bottom */}
                    <Group key="title-block">
                        <Line
                            points={[offsetX, offsetY + plotHpx + 32, offsetX + plotWpx, offsetY + plotHpx + 32]}
                            stroke="#333"
                            strokeWidth={1}
                        />
                        <Text x={offsetX} y={offsetY + plotHpx + 42} text="VASTU ARCHITECT AI" fontSize={13} fontStyle="bold" fill="#1a1a1a" />
                        <Text x={offsetX} y={offsetY + plotHpx + 54} text="AI-Powered Floor Plan Generator" fontSize={9} fill="#6b7280" />
                        <Text
                            x={offsetX + plotWpx / 2}
                            y={offsetY + plotHpx + 42}
                            text={`${data.bhk_type || '3BHK'} | Plot: ${(data.plot_w_m / 0.3048).toFixed(0)}ft × ${(data.plot_d_m / 0.3048).toFixed(0)}ft`}
                            fontSize={11}
                            fill="#1a1a1a"
                            align="center"
                        />
                        <Text
                            x={offsetX + plotWpx / 2}
                            y={offsetY + plotHpx + 54}
                            text={`Style: ${data.style || 'modern'}`}
                            fontSize={9}
                            fill="#6b7280"
                            align="center"
                        />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 42} text={`Vastu Score: ${Math.round(data.compliance?.overall ?? 0)}/100`} fontSize={11} fill="#1a1a1a" align="right" />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 54} text={`Grade ${data.compliance?.grade ?? '-'}`} fontSize={9} fill={getGradeColor(data.compliance?.grade ?? '-')} align="right" />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 66} text="pranit-vision.vercel.app" fontSize={8} fill="#9ca3af" align="right" />
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
