import type { TripSegment } from "@/contracts";
import { PREVIEW_POINTS } from "./constants";

type LonLat = [number, number];

function perpDist(p: LonLat, a: LonLat, b: LonLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker, iterative so long tracks don't overflow the stack. */
function simplify(line: LonLat[], tolerance: number): LonLat[] {
  if (line.length <= 2) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(line[i], line[s], line[e]);
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/**
 * Preview geometry of at most `max` points ([lon, lat]). Each segment is simplified on its own so
 * gaps stay gaps; `segmentBreaks` are the indexes where a new segment starts.
 */
export function decimate(segments: TripSegment[], max = PREVIEW_POINTS): { geometry: LonLat[]; segmentBreaks: number[] } {
  const lines = segments
    .map((s) => s.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p): LonLat => [p.lon, p.lat]))
    .filter((l) => l.length);
  const join = (parts: LonLat[][]) => {
    const geometry: LonLat[] = [];
    const segmentBreaks: number[] = [];
    parts.forEach((l, i) => {
      if (i > 0) segmentBreaks.push(geometry.length);
      geometry.push(...l);
    });
    return { geometry, segmentBreaks };
  };

  let parts = lines;
  for (let tol = 1e-6; parts.reduce((n, l) => n + l.length, 0) > max && tol < 1; tol *= 2) {
    parts = lines.map((l) => simplify(l, tol));
  }
  // Fallback for very many tiny segments: even stride over what's left.
  const total = parts.reduce((n, l) => n + l.length, 0);
  if (total > max) {
    const step = Math.ceil(total / max);
    parts = parts.map((l) => l.filter((_, i) => i % step === 0 || i === l.length - 1)).filter((l) => l.length);
    while (parts.reduce((n, l) => n + l.length, 0) > max) parts.pop();
  }
  return join(parts);
}
