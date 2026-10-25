import { VEHICLE } from "@/lib/model/config";
import type { MissedEvent } from "@/lib/model/score";
import type { SimSample } from "@/lib/model/simulate";
import { CAUSE_LABEL } from "@/lib/segments";

/** Must match `buildSegments`' default chunk: segment k covers samples [k*chunk, k*chunk + chunk]. */
export const SEGMENT_CHUNK = 6;

const MPH_PER_MS = 2.23694;

export const segmentSamples = (samples: SimSample[], k: number, chunk = SEGMENT_CHUNK) => samples.slice(k * chunk, k * chunk + chunk + 1);

export interface SegmentSummary {
  tStart: number;
  tEnd: number;
  startMph: number;
  endMph: number;
  gradePct: number; // average
  elevationM: number; // at the end of the segment
  peakBrake: number; // 0..1
  regenKw: number; // average power handled by regen
  frictionKw: number; // average power handled by the friction brakes
  capturePct: number; // share of braking energy that went to regen
  cause: string | null; // why regen was missed, in words
  lostKwh: number; // modeled regen lost in this stretch
}

/** The numbers behind one stretch of route, for the popup. Pure; estimates from the simulation. */
export function summarizeSegment(slice: SimSample[], missed: MissedEvent[]): SegmentSummary | null {
  if (slice.length === 0) return null;
  const first = slice[0];
  const last = slice[slice.length - 1];
  const avg = (f: (s: SimSample) => number) => slice.reduce((a, s) => a + f(s), 0) / slice.length;
  const wheelRegen = slice.reduce((a, s) => a + s.regenKw / VEHICLE.regenEfficiency, 0);
  const friction = slice.reduce((a, s) => a + s.frictionKw, 0);
  const braking = wheelRegen + friction;
  const causeKey = slice.find((s) => s.missed)?.missed;
  const lostKwh = missed.filter((e) => e.t >= first.t && e.t <= last.t).reduce((a, e) => a + e.lostKwh, 0);
  return {
    tStart: first.t,
    tEnd: last.t,
    startMph: first.speedMs * MPH_PER_MS,
    endMph: last.speedMs * MPH_PER_MS,
    gradePct: avg((s) => s.gradePct),
    elevationM: last.elevationM,
    peakBrake: Math.max(...slice.map((s) => s.brakePressure)),
    regenKw: avg((s) => s.regenKw),
    frictionKw: avg((s) => s.frictionKw),
    capturePct: braking > 0 ? Math.round((wheelRegen / braking) * 100) : 0,
    cause: causeKey ? CAUSE_LABEL[causeKey] : null,
    lostKwh,
  };
}

/**
 * 0..1: how hard the car is about to brake. Looks `window` samples ahead and weights nearer braking more,
 * so it rises as the car approaches a braking zone and falls once it is through. The map uses it to swing the camera.
 */
export function brakeFocus(samples: SimSample[], index: number, window: number): number {
  const from = Math.max(0, Math.floor(index));
  let focus = 0;
  for (let j = 0; j <= window; j++) {
    const s = samples[from + j];
    if (!s) break;
    focus = Math.max(focus, s.brakePressure * (1 - j / (window + 1)));
  }
  return Math.min(1, focus * 1.6);
}
