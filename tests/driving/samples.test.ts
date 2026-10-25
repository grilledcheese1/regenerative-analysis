import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFile, supportsLine } from "@/domain/driving/analyze";
import { PREVIEW_POINTS } from "@/domain/driving/constants";
import { parseGpx } from "@/domain/driving/parse-gpx";
import { SAMPLE_DRIVES } from "@/domain/driving/samples";

const DIR = path.join(process.cwd(), "public", "samples");
const load = (file: string) => {
  const text = readFileSync(path.join(DIR, file), "utf8");
  const p = parseGpx(text);
  if (!p.ok) throw new Error(`${file}: ${p.code}`);
  return { text, a: analyzeFile(p, true) };
};
const codes = (file: string) => load(file).a.quality.findings.map((f) => f.code);

describe("A21: sample drives", () => {
  it("the sample list matches public/samples exactly", () => {
    expect(readdirSync(DIR).sort()).toEqual(SAMPLE_DRIVES.map((s) => s.file).sort());
  });

  it.each(SAMPLE_DRIVES.map((s) => s.file))("%s parses, says it is synthetic and fits the preview", (file) => {
    const { text, a } = load(file);
    expect(text).toContain("Synthetic sample generated from a cached Austin route for the Next Move demo. Not a recorded drive.");
    expect(a.quality.routeAvailable).toBe(true);
    expect(a.quality.findings.map((f) => f.code)).toContain("synthetic_sample");
    expect(a.geometry.length).toBeLessThanOrEqual(PREVIEW_POINTS);
  });

  it.each(["maria-commute-am.gpx", "maria-commute-pm.gpx", "devon-errand.gpx", "kai-highway.gpx"])("%s is a clean trip with event analysis", (file) => {
    const { a } = load(file);
    expect(a.quality).toMatchObject({ speedAvailable: true, eventAnalysisAvailable: true });
    expect(codes(file).filter((c) => c !== "synthetic_sample")).toEqual([]);
    expect(a.segments).toHaveLength(1);
  });

  it("Maria's evening trip starts 9 h after the morning one, the same route reversed", () => {
    const am = load("maria-commute-am.gpx").a;
    const pm = load("maria-commute-pm.gpx").a;
    expect(Date.parse(pm.summary.startAt!) - Date.parse(am.summary.startAt!)).toBe(9 * 3600 * 1000);
    expect(pm.geometry[0][1]).toBeCloseTo(am.geometry.at(-1)![1], 3);
    expect(am.summary.startAt).toBe("2026-10-20T12:45:00.000Z"); // 7:45 am in Austin
  });

  it("Kai's faster roads have the lowest city share and one hard stop observed", () => {
    const share = (f: string) => {
      const s = load(f).a.summary.cityShare;
      return s.known ? s.value : NaN;
    };
    expect(share("kai-highway.gpx")).toBeLessThan(share("maria-commute-am.gpx"));
    expect(share("kai-highway.gpx")).toBeLessThan(share("devon-errand.gpx"));
    const ev = load("kai-highway.gpx").a.summary.sharpDecelEvents;
    expect(ev.known && ev.value).toBeGreaterThanOrEqual(1);
  });

  it("Devon's errand is the short one", () => {
    expect(load("devon-errand.gpx").a.summary.distanceMeters).toBeLessThan(load("maria-commute-am.gpx").a.summary.distanceMeters);
  });

  it("sparse-no-time.gpx supports route and mileage only", () => {
    const { a } = load("sparse-no-time.gpx");
    expect(codes("sparse-no-time.gpx")).toContain("missing_timestamps");
    expect(supportsLine(a.quality)).toBe("Route and mileage only.");
    expect(a.summary.sharpDecelEvents.known).toBe(false);
  });

  it("gap-and-noise.gpx shows the gap and the excluded duplicate-time points", () => {
    const { a } = load("gap-and-noise.gpx");
    expect(codes("gap-and-noise.gpx")).toEqual(expect.arrayContaining(["long_gap", "duplicate_time_conflict"]));
    expect(a.segmentBreaks.length).toBeGreaterThanOrEqual(1);
    expect(a.summary.usedSampleCount).toBeLessThan(a.summary.originalSampleCount);
  });
});
