// Route geometry helpers. Pure. Approximation: flat-earth distances, linear interpolation.
import { CONFIG } from "../../config/regen.config.ts";
import type { RoutePoint } from "./types.ts";

export interface Geometry {
  points: RoutePoint[];
  cum: number[]; // cumulative distance (m) at each point
  length: number;
}

export function buildGeometry(points: RoutePoint[]): Geometry {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dy = (b.lat - a.lat) * 111320;
    const dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { points, cum, length: cum[cum.length - 1] ?? 0 };
}

/** Index i and fraction f such that position s lies between points i and i+1. */
export function locate(g: Geometry, s: number): { i: number; f: number } {
  const last = g.points.length - 1;
  if (s <= 0) return { i: 0, f: 0 };
  if (s >= g.length) return { i: last - 1, f: 1 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = g.cum[lo + 1] - g.cum[lo];
  return { i: lo, f: span > 0 ? (s - g.cum[lo]) / span : 0 };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

export function elevationAt(g: Geometry, s: number): number {
  const { i, f } = locate(g, s);
  return lerp(g.points[i].elevation, g.points[i + 1].elevation, f);
}

export function latLonAt(g: Geometry, s: number): { lat: number; lon: number } {
  const { i, f } = locate(g, s);
  return {
    lat: lerp(g.points[i].lat, g.points[i + 1].lat, f),
    lon: lerp(g.points[i].lon, g.points[i + 1].lon, f),
  };
}

/** The route point a position belongs to (for speed limit and surface). */
export function pointAt(g: Geometry, s: number): RoutePoint {
  return g.points[locate(g, s).i];
}

/** Slope in percent over a window centered on s. */
export function gradeAt(g: Geometry, s: number, windowM: number): number {
  const a = Math.max(0, s - windowM / 2);
  const b = Math.min(g.length, s + windowM / 2);
  if (b - a < 1) return 0;
  return (100 * (elevationAt(g, b) - elevationAt(g, a))) / (b - a);
}

/** Stop positions (m): flagged points plus the end of the route. Always ascending, always ends at length. */
export function stopPositions(g: Geometry): number[] {
  const out: number[] = [];
  g.points.forEach((p, i) => {
    const s = g.cum[i];
    if (p.stop && s > 1 && s < g.length - 1) out.push(s);
  });
  out.push(g.length);
  return out;
}

/** Speed limit approaching each stop (m/s): the limit on the point just before it. */
export function stopReferenceSpeeds(g: Geometry, stops: number[]): number[] {
  return stops.map((s) => {
    const before = pointAt(g, Math.max(0, s - 1));
    return before.speedLimit ?? CONFIG.controller.defaultSpeedLimitMs;
  });
}

/** Total downhill height (m) after a moving-average smoothing of the elevation. */
export function totalDescentM(g: Geometry, smoothingM: number): number {
  const n = g.points.length;
  if (n < 2) return 0;
  const step = g.length / (n - 1);
  const half = Math.max(1, Math.round(smoothingM / step / 2));
  const smooth = g.points.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += g.points[k].elevation;
    return sum / (hi - lo + 1);
  });
  let down = 0;
  for (let i = 1; i < n; i++) down += Math.max(0, smooth[i - 1] - smooth[i]);
  return down;
}
