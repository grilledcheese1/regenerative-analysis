import { VEHICLE } from "@/lib/model/config";
import type { SimSample } from "@/lib/model/simulate";

export type SegmentGrade = "good" | "mid" | "bad" | "idle";

export interface Segment {
  coords: [number, number][]; // [lon, lat]
  grade: SegmentGrade;
  /** Average regen power recovered over this stretch, in kW. The map draws a thicker line where more is recovered. */
  regenKw: number;
}

/** Chunk a trip into short segments colored by how much braking went to regen. */
export function buildSegments(samples: SimSample[], chunk = 6, regenEfficiency: number = VEHICLE.regenEfficiency): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < samples.length - 1; i += chunk) {
    const slice = samples.slice(i, i + chunk + 1);
    const wheelRegen = slice.reduce((a, x) => a + x.regenKw / regenEfficiency, 0);
    const friction = slice.reduce((a, x) => a + x.frictionKw, 0);
    const braking = wheelRegen + friction;
    let grade: SegmentGrade = "idle";
    if (braking > 1) {
      const ratio = wheelRegen / braking;
      grade = ratio >= 0.9 ? "good" : ratio >= 0.6 ? "mid" : "bad";
    }
    out.push({ coords: slice.map((x) => [x.lon, x.lat]), grade, regenKw: slice.reduce((a, x) => a + x.regenKw, 0) / slice.length });
  }
  return out;
}

export const GRADE_VAR: Record<SegmentGrade, string> = {
  good: "--map-good",
  mid: "--map-mid",
  bad: "--map-bad",
  idle: "--map-idle",
};

export const CAUSE_LABEL = {
  "late-braking": "Late braking",
  "low-grip": "Low grip",
  "full-battery": "Full battery",
  "cold-battery": "Cold battery",
} as const;
