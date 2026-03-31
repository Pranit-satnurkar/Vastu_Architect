"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import SunCalc from "suncalc";

// ─── Constants ────────────────────────────────────────────────────────────────
const WALL_H  = 2.7;
const WALL_T  = 0.12;
const DOOR_H  = 2.1;
const WIN_BOT = 0.9;
const WIN_TOP = 2.1;
const SUN_R   = 45;   // sun orbit radius (m)

// ─── City presets (shared with SunAnalysis) ───────────────────────────────────
const CITIES: Record<string, { lat: number; lng: number }> = {
  Delhi:     { lat: 28.6139, lng: 77.2090 },
  Mumbai:    { lat: 19.0760, lng: 72.8777 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Chennai:   { lat: 13.0827, lng: 80.2707 },
  Kolkata:   { lat: 22.5726, lng: 88.3639 },
  Hyderabad: { lat: 17.3850, lng: 78.4867 },
};

// ─── Sun math ─────────────────────────────────────────────────────────────────
// SunCalc azimuth: 0=South, π/2=West, −π/2=East (radians)
// Three.js: +X=East, −X=West, +Z=South, −Z=North, +Y=Up
function sunPosition(lat: number, lng: number, hour: number, cx: number, cz: number) {
  const d = new Date();
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  const pos = SunCalc.getPosition(d, lat, lng);
  const alt = pos.altitude;
  const az  = pos.azimuth;
  return {
    x:        cx  - Math.sin(az) * Math.cos(alt) * SUN_R,
    y:        Math.max(0.5, Math.sin(alt) * SUN_R),
    z:        cz  + Math.cos(az) * Math.cos(alt) * SUN_R,
    altitude: alt,
    azimuth:  az,
    aboveHorizon: alt > 0,
  };
}

// Light color & intensity by altitude (degrees)
function sunAppearance(altRad: number): { color: THREE.Color; intensity: number } {
  const deg = altRad * (180 / Math.PI);
  if (deg <= 0)   return { color: new THREE.Color(0x001133), intensity: 0 };
  if (deg < 5)    return { color: new THREE.Color(0xff6633), intensity: 0.3 };
  if (deg < 15)   return { color: new THREE.Color(0xffaa44), intensity: 0.7 };
  if (deg < 30)   return { color: new THREE.Color(0xffe680), intensity: 1.0 };
  return             { color: new THREE.Color(0xfff8e7), intensity: 1.3 };
}

// ─── Materials ────────────────────────────────────────────────────────────────
const mkWall  = () => new THREE.MeshStandardMaterial({ color: 0xe8e0d5, roughness: 0.6 });
const mkDoor  = () => new THREE.MeshStandardMaterial({ color: 0x7c3f1e, roughness: 0.65 });
const mkWin   = () => new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.15 });
const mkFrame = () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
const mkCeil  = () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, side: THREE.DoubleSide });
const mkSwing = () => new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.20, side: THREE.DoubleSide });

function roomColor(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("living"))                                            return 0xbfdbfe;
  if (n.includes("master"))                                            return 0xfde68a;
  if (n.includes("bedroom") || n.includes("bed"))                     return 0xfef3c7;
  if (n.includes("kitchen"))                                           return 0xfbcfe8;
  if (n.includes("dining"))                                            return 0xa7f3d0;
  if (n.includes("toilet") || n.includes("bath") || n.includes("wc")) return 0xd1fae5;
  if (n.includes("pooja") || n.includes("puja"))                       return 0xfed7aa;
  if (n.includes("corridor") || n.includes("passage"))                return 0xe5e7eb;
  if (n.includes("store") || n.includes("storage"))                   return 0xe5e7eb;
  if (n.includes("balcony") || n.includes("terrace"))                  return 0xddd6fe;
  return 0xf3f4f6;
}

// ─── Box helper ───────────────────────────────────────────────────────────────
function addBox(
  scene: THREE.Scene, mat: THREE.Material,
  px: number, py: number, pz: number,
  bw: number, bh: number, bd: number,
  castShadow = true,
) {
  if (bw < 0.01 || bh < 0.01 || bd < 0.01) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
  m.position.set(px, py, pz);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  scene.add(m);
}

// ─── Wall with opening ────────────────────────────────────────────────────────
function addWall(
  scene: THREE.Scene,
  axis: "x" | "z",
  fixedCoord: number,
  spanStart: number, spanEnd: number,
  opening: { pos: number; width: number; type: "door" | "window" } | null,
) {
  const wm = mkWall();
  const spanLen = spanEnd - spanStart;
  const seg = (s0: number, s1: number, y0: number, y1: number) => {
    const sl = s1 - s0, sh = y1 - y0;
    if (sl < 0.01 || sh < 0.01) return;
    const sm = (s0 + s1) / 2, ym = (y0 + y1) / 2;
    if (axis === "x") addBox(scene, wm, sm, ym, fixedCoord, sl, sh, WALL_T);
    else              addBox(scene, wm, fixedCoord, ym, sm, WALL_T, sh, sl);
  };

  if (!opening) { seg(spanStart, spanEnd, 0, WALL_H); return; }

  const oCenter = spanStart + opening.pos * spanLen;
  const oStart  = Math.max(spanStart, oCenter - opening.width / 2);
  const oEnd    = Math.min(spanEnd,   oCenter + opening.width / 2);
  const yBot    = opening.type === "door" ? 0      : WIN_BOT;
  const yTop    = opening.type === "door" ? DOOR_H : WIN_TOP;
  const oMid    = (oStart + oEnd) / 2;
  const pLen    = oEnd - oStart;
  const pH      = yTop - yBot;
  const pyMid   = (yBot + yTop) / 2;

  seg(spanStart, oStart, 0, WALL_H);
  seg(oEnd, spanEnd, 0, WALL_H);
  seg(oStart, oEnd, yTop, WALL_H);
  if (opening.type === "window") seg(oStart, oEnd, 0, yBot);

  if (opening.type === "door") {
    if (axis === "x") {
      addBox(scene, mkDoor(), oMid, pyMid, fixedCoord, pLen - 0.04, pH, WALL_T * 0.35);
      const fT = 0.05;
      addBox(scene, mkFrame(), oMid, yTop - fT/2, fixedCoord, pLen, fT, WALL_T * 0.6);
      addBox(scene, mkFrame(), oStart + fT/2, pyMid, fixedCoord, fT, pH, WALL_T * 0.6);
      addBox(scene, mkFrame(), oEnd   - fT/2, pyMid, fixedCoord, fT, pH, WALL_T * 0.6);
    } else {
      addBox(scene, mkDoor(), fixedCoord, pyMid, oMid, WALL_T * 0.35, pH, pLen - 0.04);
      const fT = 0.05;
      addBox(scene, mkFrame(), fixedCoord, yTop - fT/2, oMid, WALL_T * 0.6, fT, pLen);
      addBox(scene, mkFrame(), fixedCoord, pyMid, oStart + fT/2, WALL_T * 0.6, pH, fT);
      addBox(scene, mkFrame(), fixedCoord, pyMid, oEnd   - fT/2, WALL_T * 0.6, pH, fT);
    }
    // Door swing arc
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(pLen * 0.92, pLen, 28, 1, 0, Math.PI / 2), mkSwing(),
    );
    arc.rotation.x = -Math.PI / 2;
    if (axis === "x") { arc.position.set(oStart, 0.02, fixedCoord); }
    else              { arc.position.set(fixedCoord, 0.02, oStart); arc.rotation.z = -Math.PI / 2; }
    scene.add(arc);
  } else {
    if (axis === "x") {
      addBox(scene, mkWin(), oMid, pyMid, fixedCoord, pLen - 0.04, pH - 0.04, WALL_T * 0.3, false); // no shadow — let light through
      const fT = 0.04;
      addBox(scene, mkFrame(), oMid, yTop - fT/2, fixedCoord, pLen, fT, WALL_T * 0.55);
      addBox(scene, mkFrame(), oMid, yBot + fT/2, fixedCoord, pLen, fT, WALL_T * 0.55);
      addBox(scene, mkFrame(), oStart + fT/2, pyMid, fixedCoord, fT, pH, WALL_T * 0.55);
      addBox(scene, mkFrame(), oEnd   - fT/2, pyMid, fixedCoord, fT, pH, WALL_T * 0.55);
      addBox(scene, mkFrame(), oMid,   pyMid, fixedCoord, pLen, fT, WALL_T * 0.55);
    } else {
      addBox(scene, mkWin(), fixedCoord, pyMid, oMid, WALL_T * 0.3, pH - 0.04, pLen - 0.04, false); // no shadow — let light through
      const fT = 0.04;
      addBox(scene, mkFrame(), fixedCoord, yTop - fT/2, oMid, WALL_T * 0.55, fT, pLen);
      addBox(scene, mkFrame(), fixedCoord, yBot + fT/2, oMid, WALL_T * 0.55, fT, pLen);
      addBox(scene, mkFrame(), fixedCoord, pyMid, oStart + fT/2, WALL_T * 0.55, pH, fT);
      addBox(scene, mkFrame(), fixedCoord, pyMid, oEnd   - fT/2, WALL_T * 0.55, pH, fT);
      addBox(scene, mkFrame(), fixedCoord, pyMid, oMid,          WALL_T * 0.55, pH, fT);
    }
  }
}

// ─── Room label on floor ──────────────────────────────────────────────────────
function addLabel(scene: THREE.Scene, name: string, cx: number, cz: number, w: number, h: number) {
  const cvs = document.createElement("canvas");
  cvs.width = 512; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  const fs = Math.min(52, Math.max(20, Math.floor(480 / (name.length + 1))));
  const th = fs + 20;
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.beginPath();
  ctx.roundRect(4, 64 - th / 2, 504, th, th / 2);
  ctx.fill();
  ctx.font = `600 ${fs}px Inter,sans-serif`;
  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 256, 64);
  const tex = new THREE.CanvasTexture(cvs);
  const lw = Math.min(w * 0.85, h * 0.85);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(lw, lw * 0.25),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(cx, 0.055, cz);
  scene.add(plane);
}

// ─── Compass on ground ────────────────────────────────────────────────────────
function addCompass(scene: THREE.Scene, px: number, pz: number) {
  const cvs = document.createElement("canvas");
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#ef4444";
  ctx.beginPath(); ctx.moveTo(64,8); ctx.lineTo(78,64); ctx.lineTo(64,54); ctx.lineTo(50,64); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#94a3b8";
  ctx.beginPath(); ctx.moveTo(64,120); ctx.lineTo(78,64); ctx.lineTo(64,74); ctx.lineTo(50,64); ctx.closePath(); ctx.fill();
  ctx.font = "bold 22px sans-serif"; ctx.fillStyle = "#1e293b"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("N", 64, 0);
  const tex = new THREE.CanvasTexture(cvs);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(px, 0.02, pz);
  scene.add(plane);
}

// ─── Sun path arc for a full day ─────────────────────────────────────────────
function buildSunPathArc(lat: number, lng: number, cx: number, cz: number): THREE.Line {
  const date = new Date(); date.setHours(0, 0, 0, 0);
  const pts: THREE.Vector3[] = [];
  for (let h = 0; h <= 24; h += 0.2) {
    const t = new Date(date.getTime() + h * 3600000);
    const pos = SunCalc.getPosition(t, lat, lng);
    if (pos.altitude > 0.01) {
      pts.push(new THREE.Vector3(
        cx  - Math.sin(pos.azimuth) * Math.cos(pos.altitude) * SUN_R,
        Math.sin(pos.altitude) * SUN_R,
        cz  + Math.cos(pos.azimuth) * Math.cos(pos.altitude) * SUN_R,
      ));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }));
}

// ─── Heat helpers (mirrors HeatSignature logic) ───────────────────────────────
function azimuthToBearingH(az: number) { return ((az * 180 / Math.PI) + 180) % 360; }
function bearingToFaceH(b: number): string {
  if (b >= 315 || b < 45)  return "N";
  if (b >= 45  && b < 135) return "E";
  if (b >= 135 && b < 225) return "S";
  return "W";
}
function computeRoomTempH(room: any, weather: any, lat: number, lng: number): number {
  const pos = SunCalc.getPosition(new Date(), lat, lng);
  const sunFace = pos.altitude > 0 ? bearingToFaceH(azimuthToBearingH(pos.azimuth)) : null;
  const winWall = room.window?.wall ?? null;
  const adj: Record<string, string[]> = { N:["E","W"], E:["N","S"], S:["E","W"], W:["N","S"] };
  let solar = 0;
  if (winWall && sunFace) {
    if (winWall === sunFace) solar = 4.5;
    else if (adj[winWall]?.includes(sunFace)) solar = 1.5;
  }
  const windHit = bearingToFaceH(weather.wind_deg);
  const windCool = winWall === windHit ? Math.min(weather.wind_speed * 0.25, 3.5) : 0;
  return weather.temp_c + solar - windCool + (winWall ? 0 : 1.5);
}
function heatHex(temp: number): number {
  if (temp < 22) return 0x3b82f6;
  if (temp < 26) return 0x22c55e;
  if (temp < 30) return 0xeab308;
  if (temp < 34) return 0xf97316;
  return 0xef4444;
}

// ─── Temp label plane ─────────────────────────────────────────────────────────
function makeTempLabel(temp: number, w: number, h: number): THREE.Mesh {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 80;
  const ctx = cvs.getContext("2d")!;
  const hex = "#" + heatHex(temp).toString(16).padStart(6, "0");
  ctx.fillStyle = hex + "33";
  ctx.beginPath(); ctx.roundRect(4, 4, 248, 72, 12); ctx.fill();
  ctx.strokeStyle = hex; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(4, 4, 248, 72, 12); ctx.stroke();
  ctx.font = "bold 36px sans-serif";
  ctx.fillStyle = hex;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${temp.toFixed(1)}°C`, 128, 40);
  const tex = new THREE.CanvasTexture(cvs);
  const lw = Math.min(w, h) * 0.7;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(lw, lw * (80 / 256)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// ─── Static scene (rooms, ground, compass) ────────────────────────────────────
function buildStaticScene(data: any, slabsOut: Map<string, THREE.Mesh>): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc7e8); // daytime sky default
  scene.fog = new THREE.Fog(0x8fc7e8, 40, 120);

  // Hemisphere: sky blue + warm ground
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0xfef3c7, 0.5);
  scene.add(hemi);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(data.plot_w_m + 8, data.plot_d_m + 8),
    new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(data.plot_w_m / 2, -0.01, data.plot_d_m / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Plot border
  const bm = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
  const W = data.plot_w_m, D = data.plot_d_m, bT = 0.08, bH = 0.25;
  addBox(scene, bm, W/2, bH/2, 0,   W+bT, bH, bT);
  addBox(scene, bm, W/2, bH/2, D,   W+bT, bH, bT);
  addBox(scene, bm, 0,   bH/2, D/2, bT,   bH, D);
  addBox(scene, bm, W,   bH/2, D/2, bT,   bH, D);

  addCompass(scene, -1.5, -1.5);

  for (const room of data.rooms) {
    const { x, y: ry, w, h, name, door, window: win } = room;
    const cx = x + w / 2, cz = ry + h / 2;

    // Floor
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.01, 0.05, h - 0.01),
      new THREE.MeshStandardMaterial({ color: roomColor(name), roughness: 0.75 }),
    );
    slab.position.set(cx, 0.025, cz); slab.receiveShadow = true; scene.add(slab);
    slabsOut.set(name, slab);

    // Ghost ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), mkCeil());
    ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, WALL_H, cz); scene.add(ceil);

    // Walls
    for (const side of ["N","S","W","E"] as const) {
      const dOp = door?.wall === side ? { pos: door.pos, width: door.width, type: "door" as const }   : null;
      const wOp = win?.wall  === side ? { pos: win.pos,  width: win.width,  type: "window" as const } : null;
      const op  = dOp ?? wOp;
      if (side === "N") addWall(scene, "x", ry,      x, x+w, op);
      if (side === "S") addWall(scene, "x", ry+h,    x, x+w, op);
      if (side === "W") addWall(scene, "z", x,        ry, ry+h, op);
      if (side === "E") addWall(scene, "z", x+w,      ry, ry+h, op);
    }

    addLabel(scene, name, cx, cz, w, h);
  }
  return scene;
}

// ─── Sun rays through windows ────────────────────────────────────────────────
function createSunRays(rooms: any[], azimuth: number, altitude: number): THREE.Group {
  const group = new THREE.Group();
  const bearing = ((azimuth * 180 / Math.PI) + 180) % 360;
  const sunFace = bearingToFaceH(bearing);
  const opacity = Math.min(0.6, Math.sin(altitude) * 0.9 + 0.1);

  for (const room of rooms) {
    const win = room.window;
    if (!win || win.wall !== sunFace) continue;

    const { x: rx, y: ry, w: rw, h: rh } = room;
    const pLen = win.width ?? 1.0;

    // World-space window centre + interior direction
    let winX = 0, winZ = 0;
    let dirX = 0, dirZ = 0;
    let roomDepth = 0;

    switch (win.wall) {
      case "N": winX = rx + win.pos * rw; winZ = ry;      dirZ =  1; roomDepth = rh; break;
      case "S": winX = rx + win.pos * rw; winZ = ry + rh; dirZ = -1; roomDepth = rh; break;
      case "W": winX = rx;      winZ = ry + win.pos * rh; dirX =  1; roomDepth = rw; break;
      case "E": winX = rx + rw; winZ = ry + win.pos * rh; dirX = -1; roomDepth = rw; break;
      default: continue;
    }

    // Beam reaches this far along the floor (capped at room depth)
    const reach = Math.min(
      altitude > 0.08 ? WIN_TOP / Math.tan(altitude) : roomDepth * 0.9,
      roomDepth - 0.15,
    );
    if (reach <= 0.05) continue;

    // ── Floor light patch ─────────────────────────────────────────
    const pW = dirZ !== 0 ? pLen : reach;
    const pD = dirZ !== 0 ? reach : pLen;
    const pX = winX + dirX * reach / 2;
    const pZ = winZ + dirZ * reach / 2;

    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(pW, pD),
      new THREE.MeshBasicMaterial({
        color: 0xffe57a,
        transparent: true,
        opacity: opacity * 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(pX, 0.08, pZ);
    group.add(patch);

    // ── Volumetric shaft (translucent slanted box) ────────────────
    const shW = dirZ !== 0 ? pLen * 0.85 : 0.15;
    const shD = dirZ !== 0 ? 0.15 : pLen * 0.85;
    const shH = WIN_TOP;

    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(shW, shH, shD),
      new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: opacity * 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shaft.position.set(winX + dirX * 0.08, WIN_TOP / 2, winZ + dirZ * 0.08);
    // Tilt shaft toward room interior by sun altitude
    if (dirZ ===  1) shaft.rotation.x = -altitude * 0.6;
    if (dirZ === -1) shaft.rotation.x =  altitude * 0.6;
    if (dirX ===  1) shaft.rotation.z =  altitude * 0.6;
    if (dirX === -1) shaft.rotation.z = -altitude * 0.6;
    group.add(shaft);

    // ── Window glow (bright halo on the glass) ─────────────────────
    const glowW = dirZ !== 0 ? pLen * 0.9  : WALL_T * 2;
    const glowH = WIN_TOP - WIN_BOT - 0.05;
    const glowD = dirZ !== 0 ? WALL_T * 2  : pLen * 0.9;

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(glowW, glowH, glowD),
      new THREE.MeshBasicMaterial({
        color: 0xffee99,
        transparent: true,
        opacity: opacity * 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(winX, (WIN_BOT + WIN_TOP) / 2, winZ);
    group.add(glow);
  }

  return group;
}

// ─── Time formatting ──────────────────────────────────────────────────────────
function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh < 12 ? "AM" : "PM";
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${display}:${mm.toString().padStart(2,"0")} ${ampm}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface FloorPlan3DProps { data: any; city: string }

export default function FloorPlan3D({ data, city }: FloorPlan3DProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hour, setHour]         = useState(9);
  const [isFullscreen, setIsFS] = useState(false);
  const [heatMode, setHeatMode] = useState(false);
  const [heatWeather, setHeatWeather] = useState<any>(null);

  // Three.js object refs
  const sunLightRef    = useRef<THREE.DirectionalLight | null>(null);
  const sunSphereRef   = useRef<THREE.Mesh | null>(null);
  const sunGlowRef     = useRef<THREE.Mesh | null>(null);
  const sunPathRef     = useRef<THREE.Line | null>(null);
  const sceneRef       = useRef<THREE.Scene | null>(null);
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null);
  const slabsRef       = useRef<Map<string, THREE.Mesh>>(new Map());
  const origColorsRef  = useRef<Map<string, number>>(new Map());
  const tempGroupRef   = useRef<THREE.Group | null>(null);
  const sunRaysGroupRef = useRef<THREE.Group | null>(null);

  // cx/cz for sun positioning
  const cx = data ? data.plot_w_m / 2 : 0;
  const cz = data ? data.plot_d_m / 2 : 0;

  // ── Effect 1: build scene once ──────────────────────────────────────────────
  useEffect(() => {
    if (!data?.rooms?.length || !mountRef.current) return;
    const container = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 300);
    camera.position.set(cx + data.plot_w_m * 0.85, data.plot_d_m * 0.95, cz + data.plot_d_m * 1.15);
    camera.lookAt(cx, 0, cz);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0.5, cz);
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance   = 3;
    controls.maxDistance   = 80;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.update();

    slabsRef.current.clear();
    origColorsRef.current.clear();
    const scene = buildStaticScene(data, slabsRef.current);
    sceneRef.current = scene;

    // Store original slab colours for heat mode restore
    slabsRef.current.forEach((mesh, name) => {
      origColorsRef.current.set(name, (mesh.material as THREE.MeshStandardMaterial).color.getHex());
    });

    // Temp labels group (hidden until heat mode on)
    const tg = new THREE.Group(); tg.visible = false; scene.add(tg);
    tempGroupRef.current = tg;

    // Sun directional light (shadow-casting)
    const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far  = 150;
    sunLight.shadow.camera.left = -30; sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top  =  30; sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.radius = 4;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLight.target.position.set(cx, 0, cz);
    sunLightRef.current = sunLight;

    // Visible sun sphere
    const sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffee88 }),
    );
    scene.add(sunSphere);
    sunSphereRef.current = sunSphere;

    // Glow halo around sun
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.18, side: THREE.BackSide }),
    );
    scene.add(glow);
    sunGlowRef.current = glow;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    });
    ro.observe(container);

    // Prevent browser page-zoom/scroll when wheel is used over the canvas
    const onWheel = (e: WheelEvent) => e.preventDefault();
    container.addEventListener("wheel", onWheel, { passive: false });

    let id: number;
    const loop = () => { id = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();

    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sunLightRef.current   = null;
      sunSphereRef.current  = null;
      sunGlowRef.current    = null;
      sunPathRef.current    = null;
      sunRaysGroupRef.current = null;
      sceneRef.current      = null;
      tempGroupRef.current  = null;
      slabsRef.current.clear();
      origColorsRef.current.clear();
    };
  }, [data]);

  // ── Effect: fetch weather when heatMode on / city changes ─────────────────
  useEffect(() => {
    if (!heatMode) return;
    fetch(`http://localhost:8000/weather?city=${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(setHeatWeather)
      .catch(() => {});
  }, [heatMode, city]);

  // ── Effect: recolour slabs + show/hide temp labels ─────────────────────────
  useEffect(() => {
    const slabs = slabsRef.current;
    const orig  = origColorsRef.current;
    const tg    = tempGroupRef.current;
    const scene = sceneRef.current;
    if (!slabs.size || !scene) return;

    if (!heatMode) {
      slabs.forEach((mesh, name) => {
        const c = orig.get(name);
        if (c !== undefined) (mesh.material as THREE.MeshStandardMaterial).color.setHex(c);
      });
      if (tg) tg.visible = false;
      return;
    }

    if (!heatWeather) return;

    const { lat, lng } = CITIES[city] ?? CITIES["Delhi"];

    // Clear old temp labels
    if (tg) { while (tg.children.length) tg.remove(tg.children[0]); }

    data.rooms.forEach((room: any) => {
      const mesh = slabs.get(room.name);
      if (!mesh) return;
      const temp = computeRoomTempH(room, heatWeather, lat, lng);
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(heatHex(temp));

      // Temp label floating above floor
      if (tg) {
        const label = makeTempLabel(temp, room.w, room.h);
        label.position.set(room.x + room.w / 2, 0.08, room.y + room.h / 2);
        tg.add(label);
      }
    });
    if (tg) tg.visible = true;
  }, [heatMode, heatWeather, city, data]);

  // ── Effect 2: update sun position when city/hour changes ───────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const sunLight  = sunLightRef.current;
    const sunSphere = sunSphereRef.current;
    const sunGlow   = sunGlowRef.current;
    if (!scene || !sunLight || !sunSphere || !sunGlow) return;

    const { lat, lng } = CITIES[city];
    const { x, y, z, altitude, azimuth, aboveHorizon } = sunPosition(lat, lng, hour, cx, cz);
    const { color, intensity } = sunAppearance(altitude);

    sunLight.position.set(x, y, z);
    sunLight.color.copy(color);
    sunLight.intensity  = aboveHorizon ? intensity : 0;
    sunLight.visible    = aboveHorizon;

    sunSphere.position.set(x, y, z);
    sunSphere.visible = aboveHorizon;
    ;(sunSphere.material as THREE.MeshBasicMaterial).color.copy(
      altitude * 180 / Math.PI < 10 ? new THREE.Color(0xff6633) : new THREE.Color(0xffee88)
    );

    sunGlow.position.set(x, y, z);
    sunGlow.visible = aboveHorizon;

    // Sky background color shifts with time of day
    const altDeg = altitude * 180 / Math.PI;
    const skyColor = altDeg > 20 ? 0x87ceeb
                   : altDeg > 5  ? 0xf4a261
                   : altDeg > 0  ? 0xe76f51
                   : 0x0d1b2a;
    scene.background = new THREE.Color(skyColor);
    ;(scene.fog as THREE.Fog).color.set(skyColor);

    // ── Sun rays through windows ──────────────────────────────────
    if (sunRaysGroupRef.current) {
      scene.remove(sunRaysGroupRef.current);
      sunRaysGroupRef.current = null;
    }
    if (aboveHorizon && data?.rooms?.length) {
      const rays = createSunRays(data.rooms, azimuth, altitude);
      scene.add(rays);
      sunRaysGroupRef.current = rays;
    }
  }, [city, hour, cx, cz, data]);

  // ── Effect 3: rebuild sun path arc when city changes ──────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (sunPathRef.current) { scene.remove(sunPathRef.current); }
    const { lat, lng } = CITIES[city];
    const arc = buildSunPathArc(lat, lng, cx, cz);
    scene.add(arc);
    sunPathRef.current = arc;
  }, [city, cx, cz]);

  // ── Fullscreen toggle (CSS-based — avoids browser zoom side-effects) ─────
  const toggleFullscreen = () => setIsFS(v => !v);

  // ESC key exits fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFS(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const altDeg = useMemo(() => {
    const { lat, lng } = CITIES[city];
    return sunPosition(lat, lng, hour, cx, cz).altitude * 180 / Math.PI;
  }, [city, hour, cx, cz]);

  const isNight = altDeg <= 0;

  const wrapperStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, width: "100vw", height: "100vh", background: "#0d1b2a" }
    : { position: "relative", width: "100%", height: "100%", background: "#0d1b2a" };

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Top-right toolbar */}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
        {/* Heat map toggle */}
        <button
          onClick={() => setHeatMode(v => !v)}
          title="Toggle heat map"
          style={{
            background: heatMode ? "rgba(239,68,68,0.85)" : "rgba(15,23,42,0.75)",
            backdropFilter: "blur(6px)",
            border: `1px solid ${heatMode ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 8, color: "#f1f5f9", cursor: "pointer",
            padding: "6px 10px", display: "flex", alignItems: "center",
            gap: 5, fontSize: 12, fontWeight: 600,
          }}
        >
          🌡️ {heatMode ? "Heat ON" : "Heat Map"}
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          style={{
            background: "rgba(15,23,42,0.75)", backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
            color: "#e2e8f0", cursor: "pointer", padding: "6px 10px",
            display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
          }}
        >
          {isFullscreen ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
              <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>

      {/* Sun controls overlay */}
      <div style={{
        position: "absolute", bottom: 20, left: 16, right: 16,
        background: "rgba(15,23,42,0.82)", backdropFilter: "blur(8px)",
        borderRadius: 14, padding: "12px 16px",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        {/* Top row: city + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>☀️</span>
            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>Sun Path</span>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 20,
              background: isNight ? "#1e3a5f" : altDeg < 10 ? "#92400e" : "#065f46",
              color: isNight ? "#93c5fd" : altDeg < 10 ? "#fcd34d" : "#6ee7b7",
              fontWeight: 700,
            }}>
              {isNight ? "NIGHT" : altDeg < 10 ? "GOLDEN HOUR" : "DAYLIGHT"}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#94a3b8", padding: "4px 8px",
            background: "rgba(255,255,255,0.06)", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)" }}>
            📍 {city}
          </span>
        </div>

        {/* Time display */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>
            {isNight ? "🌙" : altDeg < 10 ? "🌅" : "☀️"} {fmtHour(hour)}
          </span>
          <span style={{ color: "#64748b", fontSize: 10 }}>
            {isNight ? "—" : `${altDeg.toFixed(0)}° above horizon`}
          </span>
        </div>

        {/* Time slider */}
        <input
          type="range" min={0} max={23.9} step={0.25} value={hour}
          onChange={e => setHour(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: "#f59e0b", cursor: "pointer" }}
        />

        {/* Hour ticks */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          {["12a","3a","6a","9a","12p","3p","6p","9p"].map(t => (
            <span key={t} style={{ color: "#475569", fontSize: 9 }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
