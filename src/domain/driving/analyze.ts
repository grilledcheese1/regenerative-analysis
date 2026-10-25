import type { ImportFormat, QualityFinding, TripPoint, TripQuality, TripSegment, TripSummary } from "@/contracts";
import { decimate } from "./decimate";
import { normalizeTrack } from "./normalize";
import { parseCsv } from "./parse-csv";
import { parseGpx } from "./parse-gpx";
import { summarizeTrip } from "./summary";
import type { ParsedPoints, ParseFailure } from "./types";

export interface TrackAnalysis {
  segments: TripSegment[];
  quality: TripQuality;
  summary: TripSummary;
  geometry: [number, number][];
  segmentBreaks: number[];
}

export const SYNTHETIC_FINDING: QualityFinding = {
  code: "synthetic_sample",
  message: "Synthetic sample built from a cached Austin route. Not a recorded drive.",
};

export const parseFile = (format: ImportFormat, text: string): ParsedPoints | ParseFailure =>
  format === "gpx" ? parseGpx(text) : parseCsv(text);

/** normalize → summarize → decimate for one track (its own segments). */
export function analyzeTrack(segments: TripPoint[][], originalCount: number, synthetic = false): TrackAnalysis {
  const n = normalizeTrack(segments);
  const quality = synthetic ? { ...n.quality, findings: [...n.quality.findings, SYNTHETIC_FINDING] } : n.quality;
  return { segments: n.segments, quality, summary: summarizeTrip(n.segments, quality, originalCount), ...decimate(n.segments) };
}

/** The preview covers the whole file: every track's segments, each track starting a new segment. */
export const analyzeFile = (parsed: ParsedPoints, synthetic = false) =>
  analyzeTrack(parsed.tracks.flat(), parsed.originalCount, synthetic);

/** One analysis per source track, for confirmation (one TripRecord each). */
export const analyzeTracks = (parsed: ParsedPoints, synthetic = false) =>
  parsed.tracks.map((t) => analyzeTrack(t, t.reduce((n, s) => n + s.length, 0), synthetic));

export { supportsLine } from "./supports";
