"use client";

import React, { useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Arc, Group } from 'react-konva';

const ROOM_COLORS: any = {
    'Living': '#FDE68A',    // amber-200
    'Dining': '#FEF3C7',    // amber-100
    'Kitchen': '#FECACA',   // red-200
    'Bedroom': '#BFDBFE',   // blue-200
    'Master Bedroom': '#93C5FD', // blue-300
    'Bedroom 1': '#BFDBFE',
    'Bedroom 2': '#BFDBFE',
    'Toilet': '#E2E8F0',    // slate-200
    'Pooja': '#FBCFE8',     // pink-200
    'Staircase': '#DDD6FE', // violet-200
    'Utility': '#F3F4F6'    // gray-100
};

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
                    height: container.offsetHeight || 600
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    if (!data) return null;

    const padding = 40;
    const availableW = dimensions.width - padding * 2;
    const availableH = dimensions.height - padding * 2;

    // pixels per meter: avoid negative scale if dimensions or data are invalid
    const rawPpm = Math.min(
        availableW / data.plot_w_m,
        availableH / data.plot_d_m
    );
    const ppm = Math.max(0, rawPpm);


    const offsetX = (dimensions.width - data.plot_w_m * ppm) / 2;
    const offsetY = (dimensions.height - data.plot_d_m * ppm) / 2;

    return (
        <div id="canvas-container" className="w-full h-full min-h-[500px] flex items-center justify-center bg-white rounded-lg overflow-hidden border border-border/10">
            <Stage 
                width={dimensions.width} 
                height={dimensions.height} 
                ref={onStageRef}
            >
                <Layer x={offsetX} y={offsetY}>
                    {/* Plot boundary */}
                    <Rect 
                        width={data.plot_w_m * ppm}
                        height={data.plot_d_m * ppm}
                        stroke="#000"
                        strokeWidth={2}
                        dash={[10, 5]}
                    />

                    {data.rooms.map((room: any, i: number) => {
                        const roomColor = ROOM_COLORS[room.name] || '#DEF7FF';
                        return (
                            <Group key={i}>
                                <Rect
                                    x={room.x * ppm}
                                    y={room.y * ppm}
                                    width={room.w * ppm}
                                    height={room.h * ppm}
                                    fill={roomColor}
                                    stroke="#333"
                                    strokeWidth={1.5}
                                />
                                <Text
                                    x={room.x * ppm}
                                    y={room.y * ppm + (room.h * ppm) / 2 - 8}
                                    width={room.w * ppm}
                                    text={room.name}
                                    fontSize={12}
                                    fontStyle="bold"
                                    align="center"
                                />
                                
                                {/* Doors */}
                                {room.door && (() => {
                                    // compute radius; guard against negative scale
                                    const radius = Math.max(0, room.door.width * ppm);
                                    if (radius === 0) return null;
                                    return (
                                        <Arc
                                            x={room.door.wall === 'W' ? room.x * ppm : (room.door.wall === 'E' ? (room.x + room.w) * ppm : (room.x + room.w * room.door.pos) * ppm)}
                                            y={room.door.wall === 'N' ? room.y * ppm : (room.door.wall === 'S' ? (room.y + room.h) * ppm : (room.y + room.h * room.door.pos) * ppm)}
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
                                {room.window && (
                                    <Line
                                        points={[
                                            (room.window.wall === 'W' || room.window.wall === 'E') ? (room.window.wall === 'W' ? room.x : room.x + room.w) * ppm : (room.x + room.w * (room.window.pos - room.window.width / (2 * room.w))) * ppm,
                                            (room.window.wall === 'N' || room.window.wall === 'S') ? (room.window.wall === 'N' ? room.y : room.y + room.h) * ppm : (room.y + room.h * (room.window.pos - room.window.width / (2 * room.h))) * ppm,
                                            (room.window.wall === 'W' || room.window.wall === 'E') ? (room.window.wall === 'W' ? room.x : room.x + room.w) * ppm : (room.x + room.w * (room.window.pos + room.window.width / (2 * room.w))) * ppm,
                                            (room.window.wall === 'N' || room.window.wall === 'S') ? (room.window.wall === 'N' ? room.y : room.y + room.h) * ppm : (room.y + room.h * (room.window.pos + room.window.width / (2 * room.h))) * ppm,
                                        ]}
                                        stroke="#3b82f6"
                                        strokeWidth={4}
                                    />
                                )}
                            </Group>
                        );
                    })}

                    {/* Scale Bar */}
                    <Line points={[0, -10, 5 * ppm, -10]} stroke="#000" strokeWidth={2} />
                    <Text x={0} y={-25} text="5m" fontSize={10} />

                    {/* North Arrow */}
                    <Group x={data.plot_w_m * ppm + 20} y={0}>
                        <Line points={[0, 0, 0, 20, -5, 5, 0, 0, 5, 5, 0, 0]} stroke="#ef4444" strokeWidth={2} />
                        <Text x={-5} y={-15} text="N" fontSize={12} fontStyle="bold" fill="#ef4444" />
                    </Group>
                </Layer>
            </Stage>
        </div>
    );
};

export default FloorPlanCanvas;
