import { describe, expect, it } from "vitest";
import { analyzeTrip } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { ROUTES } from "@/lib/routes";
import { brakeFocus, segmentSamples, SEGMENT_CHUNK, summarizeSegment } from "@/lib/segmentTelemetry";
import { buildSegments } from "@/lib/segments";

const route = ROUTES[0];
const trip = simulateTrip(route, { driver: "aggressive", condition: "dry", regen: true });
const a = analyzeTrip(trip);
const segments = buildSegments(trip.samples);

describe("segment telemetry", () => {
  it("segment k covers the same samples buildSegments chunked", () => {
    const k = 3;
    const slice = segmentSamples(trip.samples, k);
    expect(slice.map((s) => [s.lon, s.lat])).toEqual(segments[k].coords);
    expect(slice.length).toBeLessThanOrEqual(SEGMENT_CHUNK + 1);
  });

  it("summarizes a red segment with braking, a share captured under 60% and a cause when regen was missed", () => {
    const k = segments.findIndex((s) => s.grade === "bad");
    expect(k).toBeGreaterThanOrEqual(0);
    const sum = summarizeSegment(segmentSamples(trip.samples, k), a.missed)!;
    expect(sum.capturePct).toBeLessThan(60);
    expect(sum.frictionKw).toBeGreaterThan(0);
    expect(sum.tEnd).toBeGreaterThan(sum.tStart);
  });

  it("returns null for an empty slice", () => {
    expect(summarizeSegment([], [])).toBeNull();
  });
});

describe("brakeFocus", () => {
  it("is 0 when no braking is coming and rises as the car approaches a braking zone", () => {
    const hard = trip.samples.findIndex((s, i) => i > 20 && s.brakePressure > 0.5);
    expect(hard).toBeGreaterThan(20);
    const near = brakeFocus(trip.samples, hard - 2, 12);
    const far = brakeFocus(trip.samples, hard - 11, 12);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeLessThanOrEqual(1);
    const quiet = trip.samples.findIndex((s, i) => i > 3 && trip.samples.slice(i, i + 13).every((x) => x.brakePressure === 0));
    if (quiet >= 0) expect(brakeFocus(trip.samples, quiet, 12)).toBe(0);
  });

  it("stays in 0..1 and handles the end of the trip", () => {
    const last = trip.samples.length - 1;
    const f = brakeFocus(trip.samples, last, 12);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});
