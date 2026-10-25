import type { QualityFinding, TripPoint, TripQuality, TripSegment } from "@/contracts";
import {
  ACCURACY_MAX_M,
  DUPLICATE_SAME_PLACE_M,
  GAP_BREAK_S,
  MIN_POINTS,
  SPARSE_MEDIAN_S,
  SPEED_COVERAGE_MIN,
} from "./constants";
import { haversineM, median, secondsBetween } from "./geo";

export const speedOf = (p: TripPoint) => p.observedSpeedMps ?? p.derivedSpeedMps;
const accurate = (p: TripPoint) => p.accuracyM === null || p.accuracyM <= ACCURACY_MAX_M;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Splits on duplicate-time conflicts, then on long gaps. Never bridges either. */
function cleanTimed(segments: TripPoint[][]) {
  let conflicts = 0;
  let gaps = 0;
  const out: TripPoint[][] = [];
  for (const seg of segments) {
    const sorted = [...seg].sort((a, b) => Date.parse(a.t!) - Date.parse(b.t!));
    let cur: TripPoint[] = [];
    const close = () => {
      if (cur.length) out.push(cur);
      cur = [];
    };
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].t === sorted[i].t) j++;
      const group = sorted.slice(i, j);
      const samePlace = group.every((p) => haversineM(group[0].lat, group[0].lon, p.lat, p.lon) <= DUPLICATE_SAME_PLACE_M);
      if (group.length > 1 && !samePlace) {
        conflicts += group.length;
        close(); // treat the conflict as a gap so nothing is drawn through it
      } else {
        const p = group[0];
        const prev = cur[cur.length - 1];
        if (prev && secondsBetween(prev.t!, p.t!) > GAP_BREAK_S) {
          gaps++;
          close();
        }
        cur.push(p);
      }
      i = j;
    }
    close();
  }
  return { segments: out, conflicts, gaps };
}

/** haversine / Δt, then a centered 5-point median and a 3-point mean so GPS noise isn't amplified. */
function deriveSpeeds(seg: TripPoint[]): TripPoint[] {
  const raw: (number | null)[] = seg.map(() => null);
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1];
    const b = seg[i];
    const dt = secondsBetween(a.t!, b.t!);
    if (dt >= 1 && accurate(a) && accurate(b)) raw[i] = haversineM(a.lat, a.lon, b.lat, b.lon) / dt;
  }
  if (seg.length > 1 && raw[0] === null && accurate(seg[0])) raw[0] = raw[1];

  const windowed = (vals: (number | null)[], i: number, half: number) =>
    vals.slice(Math.max(0, i - half), i + half + 1).filter((v): v is number => v !== null);
  const med = raw.map((v, i) => (v === null ? null : median(windowed(raw, i, 2))));
  return seg.map((p, i) => {
    if (med[i] === null) return { ...p, derivedSpeedMps: null };
    const w = windowed(med, i, 1);
    return { ...p, derivedSpeedMps: w.reduce((s, v) => s + v, 0) / w.length };
  });
}

/** Intervals between consecutive points within segments, in seconds. */
export function intervals(segments: TripSegment[]): number[] {
  const out: number[] = [];
  for (const { points } of segments)
    for (let i = 1; i < points.length; i++) out.push(secondsBetween(points[i - 1].t!, points[i].t!));
  return out;
}

export function normalizeTrack(input: TripPoint[][]): { segments: TripSegment[]; quality: TripQuality } {
  const findings: QualityFinding[] = [];
  const all = input.flat();
  const untimed = all.filter((p) => p.t === null).length;
  const timed = untimed === 0;

  let segs: TripPoint[][] = input.filter((s) => s.length);
  if (timed) {
    const cleaned = cleanTimed(segs);
    segs = cleaned.segments.map(deriveSpeeds);
    if (cleaned.conflicts) {
      findings.push({
        code: "duplicate_time_conflict",
        count: cleaned.conflicts,
        message: `${plural(cleaned.conflicts, "point")} shared a timestamp but not a position, so they were left out and the route is split there.`,
      });
    }
    if (cleaned.gaps) {
      findings.push({
        code: "long_gap",
        count: cleaned.gaps,
        message: `The recording has ${plural(cleaned.gaps, "gap")} longer than ${GAP_BREAK_S} s. The route is split there, not joined across.`,
      });
    }
  } else {
    // File order is kept: without every timestamp we can't sort, find gaps or derive speed.
    findings.push({
      code: "missing_timestamps",
      count: untimed,
      message: `${plural(untimed, "point")} ${untimed === 1 ? "has" : "have"} no time, so speed and speed-change analysis are off.`,
    });
  }

  const inaccurate = all.filter((p) => !accurate(p)).length;
  if (inaccurate) {
    findings.push({
      code: "low_accuracy",
      count: inaccurate,
      message: `${plural(inaccurate, "point")} ${inaccurate === 1 ? "was" : "were"} less accurate than ${ACCURACY_MAX_M} m and left out of speed calculations.`,
    });
  }

  const segments: TripSegment[] = segs.map((points) => ({ points }));
  const usable = segs.reduce((n, s) => n + s.length, 0);
  const routeAvailable = usable >= MIN_POINTS;
  if (!routeAvailable) {
    findings.push({
      code: "too_few_points",
      count: usable,
      message: `Only ${plural(usable, "usable point")}; at least ${MIN_POINTS} are needed to draw the route.`,
    });
  }

  let total = 0;
  let covered = 0;
  for (const s of segs)
    for (let i = 1; i < s.length; i++) {
      const d = haversineM(s[i - 1].lat, s[i - 1].lon, s[i].lat, s[i].lon);
      total += d;
      if (speedOf(s[i]) !== null) covered += d;
    }
  const speedAvailable = total > 0 && covered / total >= SPEED_COVERAGE_MIN;

  let eventAnalysisAvailable = false;
  if (timed && speedAvailable) {
    const med = median(intervals(segments));
    if (med !== null && med > SPARSE_MEDIAN_S) {
      findings.push({
        code: "sparse_sampling",
        message: `Points are about ${Math.round(med)} s apart, too far apart for speed-change observations.`,
      });
    } else eventAnalysisAvailable = med !== null;
  }

  return { segments, quality: { routeAvailable, speedAvailable, eventAnalysisAvailable, findings } };
}
