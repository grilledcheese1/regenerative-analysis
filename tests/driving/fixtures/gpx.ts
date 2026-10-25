// Small GPX builders so tests read as data, not XML.

export interface Pt {
  lat: number;
  lon: number;
  t?: number; // seconds after BASE
  speed?: number; // m/s, written as <extensions><speed>
}

export const BASE = Date.UTC(2026, 9, 24, 16, 0, 0);
export const iso = (s: number) => new Date(BASE + s * 1000).toISOString();

const trkpt = (p: Pt) =>
  `<trkpt lat="${p.lat}" lon="${p.lon}">${p.t !== undefined ? `<time>${iso(p.t)}</time>` : ""}${
    p.speed !== undefined ? `<extensions><speed>${p.speed}</speed></extensions>` : ""
  }</trkpt>`;

export const gpx = (segments: Pt[][], head = `<?xml version="1.0" encoding="UTF-8"?>`) =>
  `${head}<gpx version="1.1" creator="test"><trk>${segments
    .map((s) => `<trkseg>${s.map(trkpt).join("")}</trkseg>`)
    .join("")}</trk></gpx>`;

const M_PER_DEG_LAT = 111_195; // mean-radius degrees, close to haversine on a meridian

/** Driving due north from Austin at `speed(i)` m/s, one point every `dt` seconds. */
export function northTrack(n: number, { dt = 1, speed = () => 10, start = 0 }: { dt?: number; speed?: (i: number) => number; start?: number } = {}): Pt[] {
  const pts: Pt[] = [];
  let lat = 30.27;
  for (let i = 0; i < n; i++) {
    if (i > 0) lat += (speed(i) * dt) / M_PER_DEG_LAT;
    pts.push({ lat: +lat.toFixed(8), lon: -97.74, t: start + i * dt });
  }
  return pts;
}

/** Independent haversine, for hand-checking distances. */
export function haversine(a: Pt, b: Pt): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export const pathLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);
