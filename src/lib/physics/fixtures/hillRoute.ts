// Hand-made test route (about 4 km, a point every 10 m) until real routes arrive from the data pipeline.
// Synthetic: a 25 m hill, a faster stretch, five stops and a 300 m gravel segment.
import type { RoutePoint } from "../types.ts";

const STEP_M = 10;
const LENGTH_M = 4000;
const STOPS_M = [500, 1700, 2400, 3050, 3650];
const FAST = { from: 1700, to: 2400, limit: 20 }; // m/s
const GRAVEL = { from: 2750, to: 3050 }; // 300 m
const HILL = { start: 600, crest: 1100, end: 1700, height: 25 }; // climb then descent, meters
const START = { lat: 30.2672, lon: -97.7431, baseElevation: 150 };

const M_PER_DEG_LAT = 111320;

function elevationAt(s: number): number {
  const { start, crest, end, height } = HILL;
  let e = 0;
  if (s > start && s <= crest) e = (height * (s - start)) / (crest - start);
  else if (s > crest && s < end) e = height * (1 - (s - crest) / (end - crest));
  return START.baseElevation + e + 0.8 * Math.sin(s / 70); // small undulation
}

export function buildHillRoute(): RoutePoint[] {
  const points: RoutePoint[] = [];
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((START.lat * Math.PI) / 180);
  for (let s = 0; s <= LENGTH_M; s += STEP_M) {
    // Gentle bend: mostly north with an eastward drift.
    const north = s * 0.94;
    const east = s * 0.34 + 120 * Math.sin(s / 600);
    const point: RoutePoint = {
      lat: START.lat + north / M_PER_DEG_LAT,
      lon: START.lon + east / mPerDegLon,
      elevation: elevationAt(s),
      speedLimit: s >= FAST.from && s < FAST.to ? FAST.limit : 13.4,
      surface: s >= GRAVEL.from && s < GRAVEL.to ? "gravel" : "asphalt",
    };
    if (STOPS_M.includes(s)) point.stop = true;
    points.push(point);
  }
  return points;
}
