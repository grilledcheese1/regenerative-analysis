import type { TripSegment } from "@/contracts";
import type { DemoRoute, RoutePoint } from "@/lib/mock/route";
import { MOVING_SPEED_MPS } from "./constants";
import { haversineM } from "./geo";
import { speedOf } from "./normalize";

// Turns an imported drive into a replay route, in the same shape as the cached Austin routes, so
// the regen model can drive it. Speed targets come from how fast the driver actually went on each
// stretch, and stops from where they actually stopped.

const STEP_M = 10;
const MIN_LENGTH_M = 50;
const FALLBACK_ELEVATION_M = 150;
const FALLBACK_LIMIT_MS = 13.4; // 30 mph, when the file has no timing
const LIMIT_RANGE_MS: [number, number] = [8.9, 31.3]; // 20–70 mph
const LIMIT_WINDOW = 15; // ±150 m of samples around each point
const LIMIT_PERCENTILE = 0.85; // the usual speed on that stretch, not the slowest moment
const ELEVATION_SMOOTH = 5; // ±50 m, so GPS altitude noise doesn't read as hills
const MIN_STOP_SPACING_M = 50;

interface Raw {
  d: number;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
}

const clamp = (x: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, x));

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** A replay route along the driven path, or null when the track is too short to replay. */
export function routeFromTrack(segments: TripSegment[], name: string): DemoRoute | null {
  const raw: Raw[] = [];
  for (const p of segments.flatMap((s) => s.points)) {
    const prev = raw.at(-1);
    const d = prev ? prev.d + haversineM(prev.lat, prev.lon, p.lat, p.lon) : 0;
    raw.push({ d, lat: p.lat, lon: p.lon, alt: p.altitudeM, speed: speedOf(p) });
  }
  const length = raw.at(-1)?.d ?? 0;
  if (raw.length < 2 || length < MIN_LENGTH_M) return null;

  // Resample every STEP_M by linear interpolation along the path.
  const useAltitude = raw.filter((r) => r.alt !== null).length >= raw.length / 2;
  const samples: { lat: number; lon: number; alt: number; speed: number | null; s: number }[] = [];
  let j = 1;
  for (let s = 0; s <= length; s += STEP_M) {
    while (j < raw.length - 1 && raw[j].d < s) j++;
    const a = raw[j - 1];
    const b = raw[j];
    const f = b.d === a.d ? 0 : Math.min(1, Math.max(0, (s - a.d) / (b.d - a.d)));
    const alt = useAltitude ? (a.alt ?? b.alt ?? FALLBACK_ELEVATION_M) + f * ((b.alt ?? a.alt ?? 0) - (a.alt ?? b.alt ?? 0)) : FALLBACK_ELEVATION_M;
    samples.push({ s, lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon), alt, speed: f < 0.5 ? a.speed : b.speed });
  }

  const points: RoutePoint[] = samples.map((p, i) => {
    const lo = Math.max(0, i - ELEVATION_SMOOTH);
    const hi = Math.min(samples.length - 1, i + ELEVATION_SMOOTH);
    const window = samples.slice(lo, hi + 1);
    const elevationM = window.reduce((sum, w) => sum + w.alt, 0) / window.length;
    const near = samples.slice(Math.max(0, i - LIMIT_WINDOW), i + LIMIT_WINDOW + 1).flatMap((w) => (w.speed !== null && w.speed > MOVING_SPEED_MPS ? [w.speed] : []));
    const usual = percentile(near, LIMIT_PERCENTILE);
    return { s: p.s, lat: p.lat, lon: p.lon, elevationM, limitMs: clamp(usual ?? FALLBACK_LIMIT_MS, LIMIT_RANGE_MS) };
  });

  // A stop is the first stationary point after moving at least MIN_STOP_SPACING_M since the last one.
  const end = points.at(-1)!.s;
  const stopsM: number[] = [];
  let last = -Infinity;
  for (const r of raw) {
    if (r.speed !== null && r.speed < MOVING_SPEED_MPS && r.d - last >= MIN_STOP_SPACING_M && r.d > MIN_STOP_SPACING_M && end - r.d > MIN_STOP_SPACING_M) {
      stopsM.push(Math.round(r.d / STEP_M) * STEP_M);
      last = r.d;
    }
  }
  stopsM.push(end);
  return { name, stepM: STEP_M, points, stopsM };
}
