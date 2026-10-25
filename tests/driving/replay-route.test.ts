import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeTracks, parseFile } from "@/domain/driving/analyze";
import { routeFromTrack } from "@/domain/driving/replay";
import { analyzeTrip } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";

const load = (rel: string) => {
  const parsed = parseFile("gpx", readFileSync(path.join(process.cwd(), rel), "utf8"));
  if (!parsed.ok) throw new Error(parsed.message);
  return analyzeTracks(parsed)[0];
};

describe("routeFromTrack", () => {
  const a = load("docs/demo/drives/demo-drive-1-commute.gpx");
  const route = routeFromTrack(a.segments, "Your drive")!;

  it("resamples the driven path every 10 m over its full length", () => {
    expect(route.stepM).toBe(10);
    expect(route.points[0].s).toBe(0);
    const len = route.points.at(-1)!.s;
    expect(Math.abs(len - a.summary.distanceMeters) / a.summary.distanceMeters).toBeLessThan(0.02);
  });

  it("finds the stops the driver actually made, and ends with one", () => {
    expect(route.stopsM.length).toBeGreaterThanOrEqual(4);
    expect(route.stopsM.at(-1)).toBe(route.points.at(-1)!.s);
  });

  it("keeps elevation from GPS altitude and plausible speed targets", () => {
    const ele = route.points.map((p) => p.elevationM);
    expect(Math.max(...ele) - Math.min(...ele)).toBeGreaterThan(10);
    for (const p of route.points) {
      expect(p.limitMs).toBeGreaterThanOrEqual(8.9);
      expect(p.limitMs).toBeLessThanOrEqual(31.3);
    }
  });

  it("feeds the regen model: a full scored replay", () => {
    const trip = simulateTrip(route, { driver: "mixed", condition: "dry", regen: true });
    const score = analyzeTrip(trip).score;
    expect(trip.samples.length).toBeGreaterThan(100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("still builds a route without timestamps (no stops but the end)", () => {
    const sparse = routeFromTrack(load("public/samples/sparse-no-time.gpx").segments, "Sparse")!;
    expect(sparse.stopsM).toEqual([sparse.points.at(-1)!.s]);
  });

  it("returns null for a track too short to replay", () => {
    expect(routeFromTrack([{ points: a.segments[0].points.slice(0, 2) }], "Tiny")).toBeNull();
  });
});
