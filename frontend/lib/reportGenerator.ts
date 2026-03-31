import jsPDF from "jspdf";
import SunCalc from "suncalc";

// ─── City data (mirrors SunAnalysis / HeatSignature) ─────────────────────────
const CITIES: Record<string, { lat: number; lng: number; tz: number; wind_speed: number; wind_deg: number; temp_c: number }> = {
  Delhi:     { lat: 28.6139, lng: 77.2090, tz: 5.5, temp_c: 32.0, wind_speed: 3.5, wind_deg: 270 },
  Mumbai:    { lat: 19.0760, lng: 72.8777, tz: 5.5, temp_c: 30.0, wind_speed: 4.0, wind_deg: 225 },
  Bangalore: { lat: 12.9716, lng: 77.5946, tz: 5.5, temp_c: 26.0, wind_speed: 2.5, wind_deg: 180 },
  Chennai:   { lat: 13.0827, lng: 80.2707, tz: 5.5, temp_c: 33.0, wind_speed: 3.0, wind_deg: 135 },
  Kolkata:   { lat: 22.5726, lng: 88.3639, tz: 5.5, temp_c: 33.0, wind_speed: 2.0, wind_deg: 180 },
  Hyderabad: { lat: 17.3850, lng: 78.4867, tz: 5.5, temp_c: 34.0, wind_speed: 3.0, wind_deg: 225 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714, tz: 5.5, temp_c: 35.0, wind_speed: 4.0, wind_deg: 270 },
  Pune:      { lat: 18.5204, lng: 73.8567, tz: 5.5, temp_c: 30.0, wind_speed: 2.5, wind_deg: 225 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(date: Date, tz: number): string {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMs + tz * 3600000).toTimeString().slice(0, 5);
}

function azToBearing(az: number) { return ((az * 180 / Math.PI) + 180) % 360; }
function bearingToFace(b: number): string {
  if (b >= 315 || b < 45)  return "N";
  if (b >= 45  && b < 135) return "E";
  if (b >= 135 && b < 225) return "S";
  return "W";
}

const OPPOSITE: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };
const ADJACENT: Record<string, string[]> = { N: ["E","W"], S: ["E","W"], E: ["N","S"], W: ["N","S"] };

function windDirLabel(deg: number): string {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}

// ─── Analysis computations ────────────────────────────────────────────────────
function computeSun(lat: number, lng: number, tz: number) {
  const times = SunCalc.getTimes(new Date(), lat, lng);
  const diffMs = times.sunset.getTime() - times.sunrise.getTime();
  return {
    sunrise: fmtTime(times.sunrise, tz),
    sunset:  fmtTime(times.sunset, tz),
    noon:    fmtTime(times.solarNoon, tz),
    dayLen:  `${Math.floor(diffMs / 3600000)}h ${Math.round((diffMs % 3600000) / 60000)}m`,
  };
}

const CHECK_HOURS = [6, 9, 12, 16, 18];
const HOUR_LABELS = ["Dawn 6am", "Morn 9am", "Noon 12pm", "Eve 4pm", "Dusk 6pm"];

function computeRoomSun(rooms: any[], lat: number, lng: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return rooms.map(r => {
    const winWall = r.window?.wall ?? null;
    const lit: string[] = [];
    if (winWall) {
      CHECK_HOURS.forEach((h, i) => {
        const t = new Date(today); t.setHours(h);
        const pos = SunCalc.getPosition(t, lat, lng);
        if (pos.altitude > 0 && bearingToFace(azToBearing(pos.azimuth)) === winWall)
          lit.push(HOUR_LABELS[i]);
      });
    }
    return { name: r.name, winWall, litCount: lit.length, litTimes: lit };
  });
}

function computeRoomHeat(rooms: any[], city: typeof CITIES[string]) {
  const pos = SunCalc.getPosition(new Date(), city.lat, city.lng);
  const sunFace = pos.altitude > 0 ? bearingToFace(azToBearing(pos.azimuth)) : null;
  return rooms.map(r => {
    const win = r.window?.wall ?? null;
    let solar = 0;
    if (win && sunFace) {
      if (win === sunFace) solar = 4.5;
      else if (ADJACENT[win]?.includes(sunFace)) solar = 1.5;
    }
    const windCool = win === bearingToFace(city.wind_deg) ? Math.min(city.wind_speed * 0.25, 3.5) : 0;
    const temp = city.temp_c + solar - windCool + (win ? 0 : 1.5);
    return { name: r.name, temp };
  }).sort((a, b) => b.temp - a.temp);
}

function computeRoomAir(rooms: any[], windDeg: number) {
  const windFace = bearingToFace(windDeg);
  return rooms.map(r => {
    const winWall = r.window?.wall ?? null;
    if (!winWall) return { name: r.name, score: 10, rating: "Poor" };
    let score = 0;
    if (winWall === windFace) score += 40;
    else if (ADJACENT[winWall]?.includes(windFace)) score += 20;
    else score += 5;
    const hasCrossVent = rooms.some(o => o.name !== r.name && o.window?.wall === OPPOSITE[winWall]);
    if (hasCrossVent) score += 35;
    score += Math.min((r.window?.width ?? 1.0) * 5, 15);
    if (winWall === "N" || winWall === "E") score += 10;
    score = Math.min(score, 100);
    const rating = score >= 75 ? "Excellent" : score >= 50 ? "Good" : score >= 30 ? "Fair" : "Poor";
    return { name: r.name, score, rating };
  }).sort((a, b) => b.score - a.score);
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function tempColor(t: number): [number, number, number] {
  if (t < 22) return [59, 130, 246];
  if (t < 26) return [34, 197, 94];
  if (t < 30) return [234, 179, 8];
  if (t < 34) return [249, 115, 22];
  return [239, 68, 68];
}

function airColor(score: number): [number, number, number] {
  if (score >= 75) return [34, 197, 94];
  if (score >= 50) return [132, 204, 22];
  if (score >= 30) return [234, 179, 8];
  return [249, 115, 22];
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function sectionHeader(pdf: jsPDF, text: string, x: number, y: number, w: number, color: [number,number,number]) {
  pdf.setFillColor(...color);
  pdf.roundedRect(x, y, w, 7, 1, 1, "F");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text(text, x + 3, y + 4.8);
  return y + 10;
}

function miniBar(pdf: jsPDF, x: number, y: number, w: number, pct: number, color: [number,number,number]) {
  pdf.setFillColor(230, 230, 230);
  pdf.roundedRect(x, y, w, 2, 0.5, 0.5, "F");
  if (pct > 0) {
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, Math.max(w * pct / 100, 1), 2, 0.5, 0.5, "F");
  }
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function generatePlanReport(
  planData: any,
  floorPlanDataURL: string,
  cityName = "Delhi",
) {
  const city = CITIES[cityName] ?? CITIES["Delhi"];
  const sun  = computeSun(city.lat, city.lng, city.tz);
  const rooms: any[] = planData?.rooms ?? [];
  const roomSun  = computeRoomSun(rooms, city.lat, city.lng);
  const roomHeat = computeRoomHeat(rooms, city);
  const roomAir  = computeRoomAir(rooms, city.wind_deg);

  const grade = planData?.compliance?.grade ?? "–";
  const score = Math.round(planData?.compliance?.overall ?? 0);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const W = pdf.internal.pageSize.getWidth();   // 420
  const H = pdf.internal.pageSize.getHeight();  // 297

  // ── PAGE 1: Floor Plan ──────────────────────────────────────────────────────
  // Dark header bar
  pdf.setFillColor(15, 15, 20);
  pdf.rect(0, 0, W, 18, "F");

  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text("VASTU ARCHITECT AI", 12, 11.5);

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(140, 140, 160);
  pdf.text("AI-Powered Floor Plan · Vastu Shastra Compliant", 12, 16.5);

  // Vastu score badge
  const scoreColor: [number,number,number] = score >= 80 ? [22,163,74] : score >= 60 ? [217,119,6] : [220,38,38];
  pdf.setFillColor(...scoreColor);
  pdf.roundedRect(W - 55, 3, 43, 12, 2, 2, "F");
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text(`Score ${score}/100  ${grade}`, W - 53, 10.5);

  // Floor plan image
  const imgY = 22, imgH = H - 55;
  pdf.addImage(floorPlanDataURL, "PNG", 12, imgY, W - 24, imgH);

  // Bottom title block
  pdf.setFillColor(245, 245, 247);
  pdf.rect(0, H - 30, W, 30, "F");
  pdf.setDrawColor(200, 200, 210);
  pdf.setLineWidth(0.3);
  pdf.line(0, H - 30, W, H - 30);

  const cols = [12, W / 3, (W * 2) / 3];
  const labelY = H - 22, valueY = H - 14, noteY = H - 7;

  const infoBlocks = [
    { label: "CLIENT",  value: planData?.client_name ?? "Vastu Architect",  note: planData?.template_used ?? "" },
    { label: "PLOT",    value: `${planData?.plot_w_ft ?? "–"}ft × ${planData?.plot_d_ft ?? "–"}ft`,  note: `${planData?.plot_w_m?.toFixed(1) ?? "–"}m × ${planData?.plot_d_m?.toFixed(1) ?? "–"}m` },
    { label: "TYPE",    value: `${planData?.bhk_type ?? "–"}  ·  ${planData?.room_count ?? 0} rooms`, note: `Style: ${planData?.style ?? "–"}` },
  ];

  infoBlocks.forEach(({ label, value, note }, i) => {
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(140, 140, 160);
    pdf.text(label, cols[i], labelY);
    pdf.setFontSize(9.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(20, 20, 30);
    pdf.text(value, cols[i], valueY);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 120, 140);
    pdf.text(note, cols[i], noteY);
  });

  // Date + city bottom-right
  pdf.setFontSize(7);
  pdf.setTextColor(160, 160, 180);
  pdf.text(
    `Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}  ·  City: ${cityName}`,
    W - 12, H - 7, { align: "right" }
  );

  // ── PAGE 2: Analysis Report ─────────────────────────────────────────────────
  pdf.addPage();

  // Header
  pdf.setFillColor(15, 15, 20);
  pdf.rect(0, 0, W, 18, "F");
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text("SITE ANALYSIS REPORT", 12, 11.5);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(140, 140, 160);
  pdf.text(`Sun · Heat · Air Circulation  ·  ${cityName}  ·  ${new Date().toLocaleDateString("en-IN")}`, 12, 16.5);

  // Three column layout
  const colW  = (W - 36) / 3;  // width per column
  const colX  = [12, 12 + colW + 6, 12 + (colW + 6) * 2];
  let y = 24;

  // ── COL 1: Sun Analysis ───
  let cy = sectionHeader(pdf, "☀  SUN PATH ANALYSIS", colX[0], y, colW, [180, 120, 0]);

  // Sun times grid
  const sunTimes = [
    { label: "Sunrise",    val: sun.sunrise },
    { label: "Solar Noon", val: sun.noon },
    { label: "Sunset",     val: sun.sunset },
    { label: "Day Length", val: sun.dayLen },
  ];
  const cellW = colW / 2;
  sunTimes.forEach(({ label, val }, i) => {
    const cx = colX[0] + (i % 2) * cellW;
    const ry = cy + Math.floor(i / 2) * 14;
    pdf.setFillColor(248, 245, 230);
    pdf.roundedRect(cx, ry, cellW - 2, 12, 1, 1, "F");
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(140, 100, 0);
    pdf.text(label, cx + 3, ry + 4.5);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(40, 30, 0);
    pdf.text(val, cx + 3, ry + 9.5);
  });
  cy += 30;

  // Room sun exposure table
  pdf.setFontSize(6.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 80, 0);
  pdf.text("ROOM EXPOSURE", colX[0], cy); cy += 4;

  roomSun.forEach(({ name, winWall, litCount }) => {
    pdf.setFillColor(litCount >= 3 ? 255 : litCount >= 1 ? 255 : 245,
                     litCount >= 3 ? 248 : litCount >= 1 ? 237 : 245,
                     litCount >= 3 ? 220 : litCount >= 1 ? 200 : 245);
    pdf.roundedRect(colX[0], cy, colW, 7, 0.8, 0.8, "F");

    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 20, 0);
    pdf.text(name.length > 16 ? name.slice(0, 15) + "…" : name, colX[0] + 3, cy + 4.8);

    const icon = litCount >= 3 ? "☀" : litCount >= 1 ? "◑" : "○";
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(winWall ? 120 : 160, 80, 0);
    pdf.text(winWall ? `${winWall} win · ${litCount} slots ${icon}` : "no window", colX[0] + colW - 3, cy + 4.8, { align: "right" });
    cy += 8.5;
  });

  // ── COL 2: Heat Signature ─
  cy = sectionHeader(pdf, "🌡  HEAT SIGNATURE", colX[1], y, colW, [180, 60, 20]);
  cy = y + 10;

  // Outdoor conditions strip
  pdf.setFillColor(255, 240, 230);
  pdf.roundedRect(colX[1], cy, colW, 10, 1, 1, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(120, 40, 0);
  pdf.text("Outdoor", colX[1] + 3, cy + 4);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(40, 10, 0);
  pdf.text(`${city.temp_c.toFixed(0)}°C`, colX[1] + colW / 2, cy + 4, { align: "center" });
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(120, 60, 0);
  pdf.text(`Wind ${windDirLabel(city.wind_deg)} ${city.wind_speed}m/s`, colX[1] + colW - 3, cy + 4, { align: "right" });
  cy += 14;

  const minT = roomHeat[roomHeat.length - 1]?.temp ?? 20;
  const maxT = roomHeat[0]?.temp ?? 35;
  const range = maxT - minT || 1;

  roomHeat.forEach(({ name, temp }) => {
    const color = tempColor(temp);
    const pct = ((temp - minT) / range) * 100;

    pdf.setFillColor(250, 248, 245);
    pdf.roundedRect(colX[1], cy, colW, 9, 0.8, 0.8, "F");

    // Dot
    pdf.setFillColor(...color);
    pdf.circle(colX[1] + 4, cy + 4.5, 1.5, "F");

    // Name
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 20, 0);
    pdf.text(name.length > 14 ? name.slice(0, 13) + "…" : name, colX[1] + 8, cy + 4.8);

    // Bar
    miniBar(pdf, colX[1] + 8, cy + 6.2, colW - 30, pct, color);

    // Temp
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...color);
    pdf.text(`${temp.toFixed(1)}°C`, colX[1] + colW - 3, cy + 4.8, { align: "right" });
    cy += 10.5;
  });

  // ── COL 3: Air Circulation ─
  cy = sectionHeader(pdf, "💨  AIR CIRCULATION", colX[2], y, colW, [20, 100, 160]);
  cy = y + 10;

  const avgAir = Math.round(roomAir.reduce((s, r) => s + r.score, 0) / (roomAir.length || 1));
  const crossVentCount = roomAir.filter(r => {
    const rData = rooms.find(ro => ro.name === r.name);
    if (!rData?.window?.wall) return false;
    return rooms.some(o => o.name !== r.name && o.window?.wall === OPPOSITE[rData.window.wall]);
  }).length;

  // Overall bar
  pdf.setFillColor(230, 242, 255);
  pdf.roundedRect(colX[2], cy, colW, 10, 1, 1, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(20, 60, 120);
  pdf.text("Overall Ventilation", colX[2] + 3, cy + 4);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(20, 40, 80);
  pdf.text(`${avgAir}%`, colX[2] + colW - 3, cy + 4, { align: "right" });
  miniBar(pdf, colX[2] + 3, cy + 7, colW - 6, avgAir, airColor(avgAir));
  cy += 14;

  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 100, 160);
  pdf.text(`Wind from ${windDirLabel(city.wind_deg)}  ·  ${crossVentCount} cross-ventilated rooms`, colX[2], cy);
  cy += 6;

  roomAir.forEach(({ name, score, rating }) => {
    const color = airColor(score);
    const ratingColors: Record<string, [number,number,number]> = {
      Excellent: [22, 163, 74], Good: [132, 204, 22], Fair: [234, 179, 8], Poor: [249, 115, 22],
    };
    const rc = ratingColors[rating] ?? [150, 150, 150];

    pdf.setFillColor(245, 248, 252);
    pdf.roundedRect(colX[2], cy, colW, 9, 0.8, 0.8, "F");

    // Dot
    pdf.setFillColor(...color);
    pdf.circle(colX[2] + 4, cy + 4.5, 1.5, "F");

    // Name
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(20, 20, 30);
    pdf.text(name.length > 14 ? name.slice(0, 13) + "…" : name, colX[2] + 8, cy + 4.8);

    // Bar
    miniBar(pdf, colX[2] + 8, cy + 6.2, colW - 42, score, color);

    // Score + rating
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...color);
    pdf.text(`${score}%`, colX[2] + colW - 22, cy + 4.8, { align: "right" });
    pdf.setFillColor(...rc);
    pdf.roundedRect(colX[2] + colW - 20, cy + 1.5, 18, 5, 0.8, 0.8, "F");
    pdf.setFontSize(6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(rating, colX[2] + colW - 11, cy + 5, { align: "center" });
    cy += 10.5;
  });

  // ── Vastu compliance summary ──
  const summaryY = Math.max(
    y + 10 + roomSun.length * 8.5 + 38,
    y + 10 + roomHeat.length * 10.5 + 28,
    y + 10 + roomAir.length * 10.5 + 28,
  ) + 8;

  if (summaryY < H - 30 && planData?.compliance?.summary) {
    pdf.setFillColor(240, 240, 255);
    pdf.roundedRect(12, summaryY, W - 24, 16, 2, 2, "F");
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(80, 60, 160);
    pdf.text("VASTU SUMMARY", 18, summaryY + 5.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(50, 40, 100);
    const lines = pdf.splitTextToSize(planData.compliance.summary as string, W - 56);
    pdf.text(lines.slice(0, 2), 18, summaryY + 11);
  }

  // Footer
  pdf.setFillColor(245, 245, 247);
  pdf.rect(0, H - 10, W, 10, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(160, 160, 180);
  pdf.text("Generated by Vastu Architect AI  ·  All temperatures and airflow scores are estimates", W / 2, H - 4, { align: "center" });

  pdf.save(`VastuReport_${planData?.bhk_type ?? "Plan"}_${cityName}.pdf`);
}
