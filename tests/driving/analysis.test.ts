import { describe, expect, it } from "vitest";
import type { TripRecord } from "@/contracts";
import { analyzeFile } from "@/domain/driving/analyze";
import { METERS_PER_MILE, PREVIEW_POINTS } from "@/domain/driving/constants";
import { decimate } from "@/domain/driving/decimate";
import { parseGpx } from "@/domain/driving/parse-gpx";
import { buildDrivingProfile } from "@/domain/driving/profile";
import { gpx, northTrack, pathLength, type Pt } from "./fixtures/gpx";

const analyze = (segments: Pt[][]) => {
  const p = parseGpx(gpx(segments));
  if (!p.ok) throw new Error(p.code);
  return analyzeFile(p);
};
const codes = (a: ReturnType<typeof analyze>) => a.quality.findings.map((f) => f.code);

describe("normalize and summarize", () => {
  it("A5: no timestamps → route only; duration and events unknown, never 0", () => {
    const a = analyze([northTrack(30).map(({ lat, lon }) => ({ lat, lon }))]);
    expect(codes(a)).toContain("missing_timestamps");
    expect(a.quality).toMatchObject({ routeAvailable: true, speedAvailable: false, eventAnalysisAvailable: false });
    expect(a.summary.durationS).toEqual({ known: false, reason: "missing_timestamps" });
    expect(a.summary.sharpDecelEvents.known).toBe(false);
    expect(a.summary.cityShare.known).toBe(false);
    expect(a.summary.distanceMeters).toBeGreaterThan(0);
  });

  it("A6: a 90 s gap splits the trip and the distance doesn't bridge it", () => {
    const first = northTrack(40);
    const second = northTrack(40, { start: 39 + 90 }).map((p) => ({ ...p, lat: p.lat + 0.01 })); // ~1.1 km further on
    const a = analyze([[...first, ...second]]);
    expect(a.segments).toHaveLength(2);
    expect(a.segmentBreaks).toHaveLength(1);
    expect(codes(a)).toContain("long_gap");
    expect(a.summary.distanceMeters).toBeCloseTo(pathLength(first) + pathLength(second), 0);
  });

  it("A7: points 5 s apart → sparse_sampling and no event analysis", () => {
    const a = analyze([northTrack(30, { dt: 5 })]);
    expect(codes(a)).toContain("sparse_sampling");
    expect(a.quality.speedAvailable).toBe(true);
    expect(a.quality.eventAnalysisAvailable).toBe(false);
    expect(a.summary.sharpDecelEvents).toEqual({ known: false, reason: "event_analysis_unavailable" });
  });

  it("A8: same timestamp, positions 50 m apart → both points excluded", () => {
    const pts = northTrack(30);
    const clash = { ...pts[15], lat: pts[15].lat + 50 / 111_195 };
    const a = analyze([[...pts.slice(0, 16), clash, ...pts.slice(16)]]);
    const f = a.quality.findings.find((x) => x.code === "duplicate_time_conflict");
    expect(f?.count).toBe(2);
    expect(a.summary.usedSampleCount).toBe(29); // 31 points in, both clashing points out
    expect(a.segments).toHaveLength(2); // treated as a gap, never drawn through
  });

  it("same timestamp in the same place keeps one point and adds no finding", () => {
    const pts = northTrack(20);
    const a = analyze([[...pts.slice(0, 10), { ...pts[9] }, ...pts.slice(10)]]);
    expect(codes(a)).not.toContain("duplicate_time_conflict");
    expect(a.summary.usedSampleCount).toBe(20);
  });

  it("sorts timed points that arrive out of order", () => {
    const pts = northTrack(20);
    const a = analyze([[pts[1], pts[0], ...pts.slice(2)]]);
    expect(a.summary.distanceMeters).toBeCloseTo(pathLength(pts), 0);
  });

  it("fewer than 10 points → too_few_points and no route", () => {
    const a = analyze([northTrack(5)]);
    expect(a.quality.routeAvailable).toBe(false);
    expect(codes(a)).toContain("too_few_points");
  });

  it("A20: 15 → 5 m/s over 3 s is exactly one sharp deceleration; at 5 s sampling it is unknown", () => {
    const speeds = [...Array(10).fill(15), 11.67, 8.33, 5, ...Array(10).fill(5)];
    const trace = northTrack(speeds.length, { speed: (i) => speeds[i] }).map((p, i) => ({ ...p, speed: speeds[i] }));
    expect(analyze([trace]).summary.sharpDecelEvents).toEqual({ known: true, value: 1 });

    const sparse = trace.filter((p) => p.t! % 5 === 0);
    expect(analyze([sparse]).summary.sharpDecelEvents.known).toBe(false);
  });

  it("gentle braking is not a sharp deceleration", () => {
    const speeds = [...Array(10).fill(15), 13, 11, 9, 7, 5, ...Array(10).fill(5)];
    const trace = northTrack(speeds.length, { speed: (i) => speeds[i] }).map((p, i) => ({ ...p, speed: speeds[i] }));
    expect(analyze([trace]).summary.sharpDecelEvents).toEqual({ known: true, value: 0 });
  });

  it("city share is the distance share below 45 mph", () => {
    const speeds = Array.from({ length: 60 }, (_, i) => (i < 30 ? 10 : 30));
    const trace = northTrack(60, { speed: (i) => speeds[i] }).map((p, i) => ({ ...p, speed: speeds[i] }));
    const share = analyze([trace]).summary.cityShare;
    expect(share.known && share.value).toBeCloseTo((29 * 10) / (29 * 10 + 30 * 30), 2);
  });
});

describe("decimate", () => {
  it("lands at or under PREVIEW_POINTS, keeps segment breaks and has no NaN", () => {
    const seg = (n: number, start: number) => ({ points: northTrack(n, { start }).map((p) => ({ t: null, lat: p.lat + Math.sin(p.t!) * 1e-4, lon: p.lon, observedSpeedMps: null, derivedSpeedMps: null, accuracyM: null, altitudeM: null })) });
    const { geometry, segmentBreaks } = decimate([seg(3000, 0), seg(3000, 5000)]);
    expect(geometry.length).toBeLessThanOrEqual(PREVIEW_POINTS);
    expect(segmentBreaks).toHaveLength(1);
    expect(geometry.flat().every(Number.isFinite)).toBe(true);
  });
});

describe("driving profile", () => {
  const trip = (miles: number, cityShare: number | null = null): TripRecord =>
    ({
      tripId: `t${miles}`,
      summary: {
        distanceMeters: miles * METERS_PER_MILE,
        cityShare: cityShare === null ? { known: false, reason: "x" } : { known: true, value: cityShare },
      },
    }) as TripRecord;

  it("A17: no weekly input → monthly miles unknown weekly_driving_unconfirmed", () => {
    const p = buildDrivingProfile("maria", [trip(6.4), trip(6.4)], null);
    expect(p.monthlyMiles).toEqual({ known: false, reason: "weekly_driving_unconfirmed" });
    expect(p.findings.map((f) => f.code)).toContain("weekly_driving_unconfirmed");
    expect(p.source).toBe("derived");
  });

  it("A18: 10 trips/wk × 6.4 mi × 48 wk ÷ 12 = 256 mi/mo, user reported", () => {
    const p = buildDrivingProfile("maria", [trip(6.4), trip(6.4)], { tripsPerWeek: 10, otherMilesPerWeek: 0, weeksPerYear: 48 });
    expect(p.monthlyMiles).toEqual({ known: true, value: 256 });
    expect(p.source).toBe("user_reported");
    expect(p.findings).toEqual([]);
  });

  it("spec check: a 5-day two-way commute is 480 trips a year, not 730", () => {
    const p = buildDrivingProfile("maria", [trip(1), trip(1)], { tripsPerWeek: 5 * 2, otherMilesPerWeek: 0, weeksPerYear: 48 });
    expect(p.monthlyMiles.known && p.monthlyMiles.value * 12).toBe(480);
  });

  it("A19: one trip → single_trip_only", () => {
    const p = buildDrivingProfile("maria", [trip(6.4)], { tripsPerWeek: 10, otherMilesPerWeek: 0, weeksPerYear: 48 });
    expect(p.findings.map((f) => f.code)).toEqual(["single_trip_only"]);
  });

  it("city share is distance weighted over trips that know it", () => {
    const p = buildDrivingProfile("maria", [trip(10, 1), trip(30, 0), trip(5)], null);
    expect(p.cityShare).toEqual({ known: true, value: 0.25 });
    expect(buildDrivingProfile("maria", [trip(5)], null).cityShare.known).toBe(false);
  });
});
