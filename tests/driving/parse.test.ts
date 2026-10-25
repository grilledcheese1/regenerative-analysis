import { XMLParser } from "fast-xml-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeFile } from "@/domain/driving/analyze";
import { CSV_HEADER, parseCsv } from "@/domain/driving/parse-csv";
import { parseGpx } from "@/domain/driving/parse-gpx";
import type { ParsedPoints, ParseFailure } from "@/domain/driving/types";
import { gpx, northTrack, pathLength } from "./fixtures/gpx";

const ok = (r: ParsedPoints | ParseFailure): ParsedPoints => {
  if (!r.ok) throw new Error(`expected a parse, got ${r.code}`);
  return r;
};
const failed = (r: ParsedPoints | ParseFailure): ParseFailure => {
  if (r.ok) throw new Error("expected a failure");
  return r;
};

afterEach(() => vi.restoreAllMocks());

describe("GPX", () => {
  it("A1: a clean 1 Hz track supports route, speed and events, with an accurate distance", () => {
    const pts = northTrack(120);
    const a = analyzeFile(ok(parseGpx(gpx([pts]))));
    expect(a.quality).toMatchObject({ routeAvailable: true, speedAvailable: true, eventAnalysisAvailable: true });
    const expected = pathLength(pts);
    expect(Math.abs(a.summary.distanceMeters - expected) / expected).toBeLessThan(0.01);
    expect(a.summary.durationS).toEqual({ known: true, value: 119 });
  });

  it("A2: a DOCTYPE/XXE payload is refused before the XML parser runs", () => {
    const spy = vi.spyOn(XMLParser.prototype, "parse");
    const xxe = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx><trk><trkseg><trkpt lat="1" lon="1"><name>&xxe;</name></trkpt></trkseg></trk></gpx>`;
    expect(failed(parseGpx(xxe)).code).toBe("unsupported_xml_feature");
    expect(spy).not.toHaveBeenCalled();
  });

  it("A3: a billion-laughs payload is refused", () => {
    const lol = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><gpx>&lol2;</gpx>`;
    expect(failed(parseGpx(lol)).code).toBe("unsupported_xml_feature");
    expect(failed(parseGpx(`<gpx><!entity x "y"></gpx>`)).code).toBe("unsupported_xml_feature"); // case-insensitive
  });

  it("refuses non-UTF-8, archives, deep nesting, malformed XML and route-only files", () => {
    expect(failed(parseGpx(gpx([northTrack(3)], `<?xml version="1.0" encoding="ISO-8859-1"?>`))).code).toBe("unsupported_encoding");
    expect(failed(parseGpx("PK\x03\x04rest")).code).toBe("archive_not_supported");
    expect(failed(parseGpx("<gpx>" + "<a>".repeat(20) + "</a>".repeat(20) + "</gpx>")).code).toBe("xml_too_deep");
    expect(failed(parseGpx("<gpx><trk></gpx>")).code).toBe("gpx_malformed");
    const route = failed(parseGpx(`<gpx><rte><rtept lat="1" lon="1"/></rte></gpx>`));
    expect(route).toMatchObject({ status: 422, code: "gpx_route_not_track", message: "This file has a planned route, not a recorded drive." });
    expect(failed(parseGpx(`<gpx><trk><trkseg/></trk></gpx>`))).toMatchObject({ status: 422, code: "gpx_no_track_points" });
  });

  it("drops points with bad coordinates, normalizes offsets to UTC and reads Garmin speed", () => {
    const text = `<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2"><trk><trkseg>
      <trkpt lat="30.1" lon="-97.7"><ele>150.5</ele><time>2026-10-24T11:00:00-05:00</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:speed>12.5</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="95" lon="-97.7"><time>2026-10-24T11:00:01-05:00</time></trkpt>
      <trkpt lat="abc" lon="-97.7"/>
    </trkseg></trk></gpx>`;
    const p = ok(parseGpx(text));
    expect(p.originalCount).toBe(3);
    expect(p.droppedCount).toBe(2);
    expect(p.tracks[0][0][0]).toMatchObject({ t: "2026-10-24T16:00:00.000Z", altitudeM: 150.5, observedSpeedMps: 12.5, derivedSpeedMps: null, accuracyM: null });
  });

  it("keeps one track per <trk> and one segment per <trkseg>", () => {
    const two = gpx([northTrack(5), northTrack(5, { start: 10 })]).replace("</trkseg><trkseg>", "</trkseg></trk><trk><trkseg>");
    const p = ok(parseGpx(two));
    expect(p.tracks).toHaveLength(2);
    expect(ok(parseGpx(gpx([northTrack(5), northTrack(5, { start: 10 })]))).tracks[0]).toHaveLength(2);
  });
});

describe("CSV", () => {
  const csv = (...rows: string[]) => [CSV_HEADER, ...rows].join("\n");

  it("A9: a wrong header is a 400 csv_header_mismatch naming the expected header", () => {
    const f = failed(parseCsv("time,lat,lon\n2026-10-24T16:00:00Z,30,-97"));
    expect(f).toMatchObject({ status: 400, code: "csv_header_mismatch" });
    expect(f.message).toContain(CSV_HEADER);
  });

  it("A10: empty optional fields are null, not 0", () => {
    const p = ok(parseCsv(csv("2026-10-24T16:00:00Z,30.27,-97.74,,,")));
    expect(p.tracks[0][0][0]).toMatchObject({ observedSpeedMps: null, accuracyM: null, altitudeM: null });
  });

  it("A11: an offset timestamp is stored as UTC", () => {
    const p = ok(parseCsv(csv("2026-10-24T11:00:00-05:00,30.27,-97.74,12.1,5,150")));
    expect(p.tracks[0][0][0]).toMatchObject({ t: "2026-10-24T16:00:00.000Z", observedSpeedMps: 12.1, accuracyM: 5, altitudeM: 150 });
  });

  it("A12: a timestamp without a zone is a 400 naming the row", () => {
    const f = failed(parseCsv(csv("2026-10-24T16:00:00Z,30.27,-97.74,,,", "2026-10-24T16:00:01,30.27,-97.74,,,")));
    expect(f).toMatchObject({ status: 400, code: "csv_timestamp_without_zone" });
    expect(f.message).toContain("Row 3");
  });

  it("accepts a BOM and CRLF, and refuses quoting", () => {
    expect(ok(parseCsv("﻿" + csv("2026-10-24T16:00:00Z,30.27,-97.74,,,").replace(/\n/g, "\r\n"))).tracks[0][0]).toHaveLength(1);
    expect(failed(parseCsv(csv('"2026-10-24T16:00:00Z",30.27,-97.74,,,'))).code).toBe("csv_quoting_not_supported");
  });
});
