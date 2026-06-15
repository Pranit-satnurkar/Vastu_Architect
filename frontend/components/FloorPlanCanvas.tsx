"use client";

import React, { useRef } from 'react';
import { Stage, Layer, Rect, Text, Line, Arrow, Group, Arc } from 'react-konva';

const ROOM_COLORS: any = {
    'Living Room': '#DBEAFE',       // light blue
    'Master Bedroom': '#FEF3C7',    // light amber
    'Bedroom': '#FEF3C7',
    'Bedroom 1': '#FEF3C7',
    'Bedroom 2': '#FEF3C7',
    'Bedroom 3': '#FEF3C7',
    'Kitchen': '#FCE7F3',           // light pink
    'Dining': '#D1FAE5',            // light green
    'Kitchen & Dining': '#FCE7F3',
    'Toilet': '#ECFDF5',            // very light green
    'Toilet 1': '#ECFDF5',
    'Toilet 2': '#ECFDF5',
    'Bathroom': '#ECFDF5',
    'Bathroom 1': '#ECFDF5',
    'Bathroom 2': '#ECFDF5',
    'Ensuite': '#ECFDF5',
    'Pooja': '#FFF7ED',             // light orange
    'Corridor': '#F3F4F6',          // light gray
    'Store': '#F3F4F6',
    'default': '#FFFFFF'
};

const WALL_COLOR = '#111111';
const WALL_W = 5;            // building wall stroke width (px)
const DOOR_COLOR = '#1e293b';
const WIN_COLOR = '#2563EB';

interface FloorPlanCanvasProps {
    data: any;
    units?: "ft" | "m";
    onStageRef?: (ref: any) => void;
}

const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({ data, units = "ft", onStageRef }) => {
    const stageRef = useRef<any>(null);

    if (!data) return null;

    const CANVAS_WIDTH = 700;
    const CANVAS_HEIGHT = 900;
    const PADDING = 80;

    const availW = CANVAS_WIDTH - PADDING * 2;
    const availH = CANVAS_HEIGHT - PADDING * 2;

    const ppm = Math.min(availW / data.plot_w_m, availH / data.plot_d_m);

    const plotWpx = data.plot_w_m * ppm;
    const plotHpx = data.plot_d_m * ppm;
    const offsetX = PADDING + (availW - plotWpx) / 2;
    const offsetY = PADDING + (availH - plotHpx) / 2;

    const px = (mx: number) => offsetX + mx * ppm;
    const py = (my: number) => offsetY + my * ppm;

    const metersToFeetInches = (m: number) => {
        const totalInches = m * 39.3701;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        if (inches === 12) return `${feet + 1}'0"`;
        return `${feet}'${inches}"`;
    };

    const getDimensionText = (w: number, unit: string) =>
        unit === "m" ? `${w.toFixed(1)}m` : metersToFeetInches(w);

    const getGradeColor = (grade: string) => {
        if (grade.startsWith('A')) return '#16a34a';
        if (grade.startsWith('B')) return '#d97706';
        return '#dc2626';
    };

    // ── Door: erase a gap in the wall, draw swing leaf + arc into the room ──────
    const renderDoor = (room: any, i: number) => {
        const d = room.door;
        if (!d) return null;
        const rx = px(room.x), ry = py(room.y);
        const rw = room.w * ppm, rh = room.h * ppm;
        const wall = d.wall;
        const along = (wall === 'N' || wall === 'S') ? rw : rh;
        const lenpx = Math.max(14, Math.min(d.width * ppm, along * 0.8));
        const els: any[] = [];

        if (wall === 'N' || wall === 'S') {
            const cy = wall === 'N' ? ry : ry + rh;
            const cx = rx + rw * d.pos;
            const x0 = Math.max(rx + 2, cx - lenpx / 2);
            const intoY = wall === 'N' ? cy + lenpx : cy - lenpx;
            els.push(<Rect key="gap" x={x0} y={cy - WALL_W} width={lenpx} height={WALL_W * 2} fill="#ffffff" />);
            els.push(<Line key="leaf" points={[x0, cy, x0, intoY]} stroke={DOOR_COLOR} strokeWidth={1.5} />);
            els.push(<Arc key="arc" x={x0} y={cy} innerRadius={0} outerRadius={lenpx} angle={90}
                rotation={wall === 'N' ? 0 : 270} stroke={DOOR_COLOR} strokeWidth={1.5} />);
        } else {
            const cx = wall === 'W' ? rx : rx + rw;
            const cy = ry + rh * d.pos;
            const y0 = Math.max(ry + 2, cy - lenpx / 2);
            const intoX = wall === 'W' ? cx + lenpx : cx - lenpx;
            els.push(<Rect key="gap" x={cx - WALL_W} y={y0} width={WALL_W * 2} height={lenpx} fill="#ffffff" />);
            els.push(<Line key="leaf" points={[cx, y0, intoX, y0]} stroke={DOOR_COLOR} strokeWidth={1.5} />);
            els.push(<Arc key="arc" x={cx} y={y0} innerRadius={0} outerRadius={lenpx} angle={90}
                rotation={wall === 'W' ? 0 : 90} stroke={DOOR_COLOR} strokeWidth={1.5} />);
        }
        return <Group key={`door-${i}`}>{els}</Group>;
    };

    // ── Window: erase a gap, draw a double glazing line in it ───────────────────
    const renderWindow = (room: any, i: number) => {
        const w = room.window;
        if (!w) return null;
        const rx = px(room.x), ry = py(room.y);
        const rw = room.w * ppm, rh = room.h * ppm;
        const wall = w.wall;
        const along = (wall === 'N' || wall === 'S') ? rw : rh;
        const lenpx = Math.max(12, Math.min(w.width * ppm, along * 0.85));
        const els: any[] = [];

        if (wall === 'N' || wall === 'S') {
            const cy = wall === 'N' ? ry : ry + rh;
            const cx = rx + rw * w.pos;
            const x0 = Math.max(rx + 2, cx - lenpx / 2);
            const x1 = Math.min(rx + rw - 2, x0 + lenpx);
            els.push(<Rect key="gap" x={x0} y={cy - WALL_W} width={x1 - x0} height={WALL_W * 2} fill="#ffffff" />);
            els.push(<Line key="l1" points={[x0, cy - 1.6, x1, cy - 1.6]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            els.push(<Line key="l2" points={[x0, cy + 1.6, x1, cy + 1.6]} stroke={WIN_COLOR} strokeWidth={1.5} />);
        } else {
            const cx = wall === 'W' ? rx : rx + rw;
            const cy = ry + rh * w.pos;
            const y0 = Math.max(ry + 2, cy - lenpx / 2);
            const y1 = Math.min(ry + rh - 2, y0 + lenpx);
            els.push(<Rect key="gap" x={cx - WALL_W} y={y0} width={WALL_W * 2} height={y1 - y0} fill="#ffffff" />);
            els.push(<Line key="l1" points={[cx - 1.6, y0, cx - 1.6, y1]} stroke={WIN_COLOR} strokeWidth={1.5} />);
            els.push(<Line key="l2" points={[cx + 1.6, y0, cx + 1.6, y1]} stroke={WIN_COLOR} strokeWidth={1.5} />);
        }
        return <Group key={`win-${i}`}>{els}</Group>;
    };

    const gardens: any[] = data.gardens ?? [];

    return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
            <Stage
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{ background: 'white' }}
                ref={(ref) => { stageRef.current = ref; if (onStageRef) onStageRef(ref); }}
            >
                <Layer>
                    <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="white" />

                    {/* PLOT (LOT) BOUNDARY — thin dashed line; the building outline
                        is formed by the room walls, so non-rectangular footprints show. */}
                    <Rect x={offsetX} y={offsetY} width={plotWpx} height={plotHpx}
                        stroke="#9ca3af" strokeWidth={1} dash={[6, 4]} fill="white" />

                    {/* GARDENS / open space */}
                    {gardens.map((g: any, i: number) => {
                        const gx = px(g.x), gy = py(g.y), gw = g.w * ppm, gh = g.h * ppm;
                        return (
                            <Group key={`garden-${i}`}>
                                <Rect x={gx} y={gy} width={gw} height={gh} fill="#ecfdf5"
                                    stroke="#86efac" strokeWidth={1} dash={[4, 4]} />
                                {gw >= 40 && gh >= 30 && (
                                    <Text x={gx} y={gy + gh / 2 - 6} width={gw} text="Garden"
                                        fontSize={Math.min(gw / 7, 12)} fill="#15803d" align="center" fontStyle="italic" />
                                )}
                            </Group>
                        );
                    })}

                    {/* ROOMS — fill + walls + labels (openings drawn later, on top) */}
                    {data.rooms.map((room: any, i: number) => {
                        const roomColor = ROOM_COLORS[room.name] || ROOM_COLORS['default'];
                        const rx = px(room.x), ry = py(room.y);
                        const rw_px = room.w * ppm, rh_px = room.h * ppm;
                        return (
                            <Group key={i}>
                                <Rect x={rx} y={ry} width={rw_px} height={rh_px}
                                    fill={roomColor} stroke={WALL_COLOR} strokeWidth={WALL_W} />
                                {rw_px >= 45 && rh_px >= 40 && (
                                    <Text x={rx} y={ry + rh_px / 2 - 12} width={rw_px} text={room.name}
                                        fontSize={Math.min(rw_px / 7, rh_px / 5, 13)} fontStyle="bold"
                                        fill="#1a1a1a" align="center" />
                                )}
                                {rw_px >= 45 && rh_px >= 40 && (
                                    <Text x={rx} y={ry + rh_px / 2 + 4} width={rw_px}
                                        text={`${getDimensionText(room.w, units)} × ${getDimensionText(room.h, units)}`}
                                        fontSize={Math.min(rw_px / 8, rh_px / 6, 11)} fill="#555555" align="center" />
                                )}
                            </Group>
                        );
                    })}

                    {/* OPENINGS — drawn after all rooms so gaps overlay neighbour walls */}
                    <Group key="openings">
                        {data.rooms.map((room: any, i: number) => (
                            <Group key={`op-${i}`}>
                                {renderWindow(room, i)}
                                {renderDoor(room, i)}
                            </Group>
                        ))}
                    </Group>

                    {/* OVERALL PLOT WIDTH DIMENSION - TOP */}
                    <Group key="top-dim">
                        {(() => {
                            const x1 = offsetX, x2 = offsetX + plotWpx, y = offsetY - 40;
                            return (
                                <Group>
                                    <Line points={[x1, y, x2, y]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x1, y, x1, y + 8]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x2, y, x2, y + 8]} stroke="#888" strokeWidth={1} />
                                    <Text x={(x1 + x2) / 2 - 30} y={y - 16} width={60} text={getDimensionText(data.plot_w_m, units)} fontSize={10} fontStyle="bold" fill="#333" align="center" />
                                </Group>
                            );
                        })()}
                    </Group>

                    {/* OVERALL PLOT DEPTH DIMENSION - RIGHT */}
                    <Group key="right-dim">
                        {(() => {
                            const y1 = offsetY, y2 = offsetY + plotHpx, x = offsetX + plotWpx + 30;
                            return (
                                <Group>
                                    <Line points={[x, y1, x, y2]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x, y1, x - 8, y1]} stroke="#888" strokeWidth={1} />
                                    <Line points={[x, y2, x - 8, y2]} stroke="#888" strokeWidth={1} />
                                    <Text x={x + 6} y={(y1 + y2) / 2 - 6} text={getDimensionText(data.plot_d_m, units)} fontSize={10} fontStyle="bold" fill="#333" align="left" />
                                </Group>
                            );
                        })()}
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
                        <Line points={[offsetX, offsetY + plotHpx + 32, offsetX + plotWpx, offsetY + plotHpx + 32]} stroke="#333" strokeWidth={1} />
                        <Text x={offsetX} y={offsetY + plotHpx + 42} text="VASTU ARCHITECT AI" fontSize={13} fontStyle="bold" fill="#1a1a1a" />
                        <Text x={offsetX} y={offsetY + plotHpx + 54} text="AI-Powered Floor Plan Generator" fontSize={9} fill="#6b7280" />
                        <Text x={offsetX + plotWpx / 2} y={offsetY + plotHpx + 42}
                            text={`${data.bhk_type || '3BHK'} | Plot: ${(data.plot_w_m / 0.3048).toFixed(0)}ft × ${(data.plot_d_m / 0.3048).toFixed(0)}ft`}
                            fontSize={11} fill="#1a1a1a" align="center" />
                        <Text x={offsetX + plotWpx / 2} y={offsetY + plotHpx + 54}
                            text={`Shape: ${data.shape ?? 'full'} · ${data.style || 'modern'}`}
                            fontSize={9} fill="#6b7280" align="center" />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 42} text={`Vastu Score: ${Math.round(data.compliance?.score ?? data.compliance?.overall ?? 0)}/100`} fontSize={11} fill="#1a1a1a" align="right" />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 54} text={`Grade ${data.compliance?.grade ?? '-'}`} fontSize={9} fill={getGradeColor(data.compliance?.grade ?? '-')} align="right" />
                        <Text x={offsetX + plotWpx} y={offsetY + plotHpx + 66} text="pranit-vision.vercel.app" fontSize={8} fill="#9ca3af" align="right" />
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
