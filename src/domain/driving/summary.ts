import { known, unknown, type TripQuality, type TripSegment, type TripSummary } from "@/contracts";
import { CITY_SPEED_MPS, MOVING_SPEED_MPS, SHARP_DECEL_MERGE_S, SHARP_DECEL_MIN_S, SHARP_DECEL_MPS2 } from "./constants";
import { haversineM, secondsBetween } from "./geo";
import { speedOf } from "./normalize";

/**
 * Sharp decelerations observed in a recording: runs where speed drops at ≥ SHARP_DECEL_MPS2 for
 * ≥ SHARP_DECEL_MIN_S, with runs less than SHARP_DECEL_MERGE_S apart counted once.
 * Only meaningful on dense, timed data; callers check eventAnalysisAvailable first.
 */
export function countSharpDecels(segments: TripSegment[]): number {
  let events = 0;
  for (const { points } of segments) {
    const runs: { start: number; end: number }[] = [];
    let start: number | null = null;
    let end = 0;
    for (let i = 1; i < points.length; i++) {
      const v0 = speedOf(points[i - 1]);
      const v1 = speedOf(points[i]);
      const t0 = Date.parse(points[i - 1].t!) / 1000;
      const t1 = Date.parse(points[i].t!) / 1000;
      const dt = t1 - t0;
      const sharp = v0 !== null && v1 !== null && dt > 0 && (v0 - v1) / dt >= SHARP_DECEL_MPS2;
      if (sharp) {
        start ??= t0;
        end = t1;
      } else if (start !== null) {
        runs.push({ start, end });
        start = null;
      }
    }
    if (start !== null) runs.push({ start, end });
    let lastEnd = -Infinity;
    for (const r of runs.filter((r) => r.end - r.start >= SHARP_DECEL_MIN_S)) {
      if (r.start - lastEnd >= SHARP_DECEL_MERGE_S) events++;
      lastEnd = r.end;
    }
  }
  return events;
}

export function summarizeTrip(segments: TripSegment[], quality: TripQuality, originalSampleCount: number): TripSummary {
  const points = segments.flatMap((s) => s.points);
  const timed = points.length > 0 && points.every((p) => p.t !== null);

  let distanceMeters = 0;
  let movingS = 0;
  let movingM = 0;
  let speedM = 0;
  let cityM = 0;
  for (const { points: pts } of segments)
    for (let i = 1; i < pts.length; i++) {
      const d = haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      distanceMeters += d;
      const v = speedOf(pts[i]);
      if (v === null) continue;
      speedM += d;
      if (v < CITY_SPEED_MPS) cityM += d;
      if (timed && v > MOVING_SPEED_MPS) {
        movingS += secondsBetween(pts[i - 1].t!, pts[i].t!);
        movingM += d;
      }
    }

  const times = timed ? points.map((p) => Date.parse(p.t!)) : [];
  const startAt = timed ? new Date(Math.min(...times)).toISOString() : null;
  const endAt = timed ? new Date(Math.max(...times)).toISOString() : null;
  const movingKnown = timed && quality.speedAvailable;

  return {
    distanceMeters,
    startAt,
    endAt,
    durationS: startAt && endAt ? known(secondsBetween(startAt, endAt)) : unknown("missing_timestamps"),
    movingTimeS: movingKnown ? known(movingS) : unknown(timed ? "speed_unavailable" : "missing_timestamps"),
    avgMovingSpeedMps: movingKnown && movingS > 0 ? known(movingM / movingS) : unknown(movingKnown ? "not_moving" : "speed_unavailable"),
    cityShare: quality.speedAvailable && speedM > 0 ? known(cityM / speedM) : unknown("speed_unavailable"),
    sharpDecelEvents: quality.eventAnalysisAvailable ? known(countSharpDecels(segments)) : unknown("event_analysis_unavailable"),
    originalSampleCount,
    usedSampleCount: points.length,
  };
}
