// Geo helpers for the data pipeline. Pure, no dependencies. Distances use a local flat-earth
// approximation (fine at city scale) except haversineM.
export type LonLat = [number, number];

const R = 6371008.8; // mean Earth radius, m
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (m) at each vertex. */
export function cumulative(coords: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]));
  return out;
}

export interface Sampled {
  lon: number;
  lat: number;
  s: number; // distance along the polyline, m
}

/** Index i such that cum[i] <= s < cum[i + 1]. */
export function segmentAt(cum: number[], s: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointAtDistance(coords: LonLat[], cum: number[], s: number): LonLat {
  const clamped = Math.min(Math.max(s, 0), cum[cum.length - 1]);
  const i = Math.min(segmentAt(cum, clamped), coords.length - 2);
  const span = cum[i + 1] - cum[i];
  const f = span > 0 ? (clamped - cum[i]) / span : 0;
  return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f];
}

/** Points every stepM along the polyline, including the exact final point. Follows every bend. */
export function resample(coords: LonLat[], stepM: number): Sampled[] {
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  const out: Sampled[] = [];
  for (let s = 0; s < total; s += stepM) {
    const [lon, lat] = pointAtDistance(coords, cum, s);
    out.push({ lon, lat, s });
  }
  const last = coords[coords.length - 1];
  out.push({ lon: last[0], lat: last[1], s: total });
  return out;
}

/** Linear interpolation of ys over ascending xs; clamps outside the range. */
export function interpolate(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const i = segmentAt(xs, x);
  const span = xs[i + 1] - xs[i];
  return span > 0 ? ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / span : ys[i];
}

/** Centered moving average over an odd point window; edges use a shrunken window. */
export function movingAverage(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += values[k];
    return sum / (hi - lo + 1);
  });
}

export interface Projection {
  distM: number; // distance from the point to the polyline
  s: number; // distance along the polyline at the closest point
}

/** Closest approach of p to a polyline, in a local metric frame centered on p. */
export function projectToPolyline(p: LonLat, coords: LonLat[], cum: number[]): Projection {
  const kx = 111320 * Math.cos(toRad(p[1]));
  const ky = 111320;
  let best: Projection = { distM: Infinity, s: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - p[0]) * kx;
    const ay = (coords[i][1] - p[1]) * ky;
    const bx = (coords[i + 1][0] - p[0]) * kx;
    const by = (coords[i + 1][1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.distM) best = { distM: d, s: cum[i] + t * (cum[i + 1] - cum[i]) };
  }
  return best;
}

/** Distance from p to a polyline, with a cheap bounding-box reject. */
export function distanceToPolylineM(p: LonLat, coords: LonLat[], maxM: number): number {
  const dLat = maxM / 111320;
  const dLon = maxM / (111320 * Math.cos(toRad(p[1])));
  let near = false;
  for (const c of coords) {
    if (Math.abs(c[1] - p[1]) <= dLat * 4 && Math.abs(c[0] - p[0]) <= dLon * 4) {
      near = true;
      break;
    }
  }
  if (!near) return Infinity;
  return projectToPolyline(p, coords, cumulative(coords)).distM;
}
