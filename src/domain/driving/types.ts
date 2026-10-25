import type { TripPoint } from "@/contracts";

/** Points straight from a file: one entry per source track, each split into the file's own segments. */
export interface ParsedPoints {
  ok: true;
  tracks: TripPoint[][][];
  originalCount: number; // every point in the file, including dropped ones
  droppedCount: number; // points with missing or out-of-range coordinates
}

/** A file we refuse or can't use. `status` is the HTTP status the import route returns. */
export interface ParseFailure {
  ok: false;
  status: 400 | 413 | 422;
  code: string;
  message: string;
}

export const fail = (status: ParseFailure["status"], code: string, message: string): ParseFailure => ({ ok: false, status, code, message });

export const point = (lat: number, lon: number, rest: Partial<TripPoint> = {}): TripPoint => ({
  t: null,
  lat,
  lon,
  observedSpeedMps: null,
  derivedSpeedMps: null,
  accuracyM: null,
  altitudeM: null,
  ...rest,
});

export const validLatLon = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** A finite number from a string, or null for an empty or unreadable value. */
export function num(text: unknown): number | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}
