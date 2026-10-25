// Drive import and driving profile contracts (owned by the drive-imports stream; frozen shape).
import type { Maybe, SourceKind } from "./index";

export const PARSER_VERSION = "gpx-1"; // bump when parsing behavior changes
export type ImportFormat = "gpx" | "csv";
// uploaded/validating/processing exist in the spec; parsing is synchronous, so jobs go straight to preview_ready
export type ImportState = "preview_ready" | "confirmed" | "failed" | "cancelled";

export type QualityCode =
  | "missing_timestamps" // geometry usable, speed-change analysis disabled
  | "duplicate_time_conflict" // same timestamp, different position → interval excluded
  | "long_gap" // > GAP_BREAK_S between points → segment break, no inferred path
  | "sparse_sampling" // median interval > 2 s → event analysis restricted
  | "low_accuracy" // horizontal accuracy > ACCURACY_MAX_M → excluded from derivatives
  | "too_few_points" // < 10 usable points
  | "single_trip_only" // < 2 confirmed trips → no "recurring journey" claims
  | "weekly_driving_unconfirmed" // annual mileage projection needs confirmation
  | "synthetic_sample"; // file came from our sample set

export interface QualityFinding {
  code: QualityCode;
  message: string;
  count?: number;
}

export interface TripPoint {
  t: string | null; // ISO UTC; null when the file had no time
  lat: number;
  lon: number; // decimal degrees
  observedSpeedMps: number | null; // only from the file (<speed> extension or CSV speedMps)
  derivedSpeedMps: number | null; // computed by us; never written into observedSpeedMps
  accuracyM: number | null;
  altitudeM: number | null;
}

export interface TripSegment {
  points: TripPoint[];
} // a long gap starts a new segment

export interface TripQuality {
  routeAvailable: boolean; // geometry is drawable
  speedAvailable: boolean; // observed or derivable speed exists for most of the trip
  eventAnalysisAvailable: boolean; // timing dense enough for speed-change observations
  findings: QualityFinding[];
}

export interface TripSummary {
  distanceMeters: number; // sum within segments only; gaps are not bridged
  startAt: string | null;
  endAt: string | null;
  durationS: Maybe<number>;
  movingTimeS: Maybe<number>;
  avgMovingSpeedMps: Maybe<number>;
  cityShare: Maybe<number>; // share of distance below CITY_SPEED_MPS; modeled heuristic
  sharpDecelEvents: Maybe<number>; // only when eventAnalysisAvailable
  originalSampleCount: number;
  usedSampleCount: number;
}

export interface ImportPreview {
  importId: string;
  vehicleId: string; // persona id for the demo
  filename: string;
  byteCount: number;
  contentHash: string; // sha256 hex
  format: ImportFormat;
  parserVersion: string;
  source: { kind: "gpx_upload" | "csv_upload" | "sample"; mode: SourceKind }; // sample → "synthetic"
  state: ImportState;
  quality: TripQuality;
  summary: TripSummary;
  previewGeometry: [number, number][]; // [lon, lat], decimated to ≤ 500 points, NaN-free
  segmentBreaks: number[]; // indexes in previewGeometry where a new segment starts
  createdAt: string;
  duplicateOf?: string; // set when the same hash was already imported
  tripIds?: string[]; // after confirm
  error?: { code: string; message: string };
}

export interface TripRecord {
  tripId: string;
  importId: string;
  vehicleId: string;
  source: ImportPreview["source"];
  summary: TripSummary;
  quality: TripQuality;
  geometry: [number, number][]; // decimated; full points are not returned by the API
  segmentBreaks: number[];
  driverConfirmed: true;
  createdAt: string;
}

export interface WeeklyDriving {
  tripsPerWeek: number; // user confirmed, e.g. 10 for a 5-day two-way commute
  otherMilesPerWeek: number; // user confirmed errands etc.
  weeksPerYear: number; // default 48 (spec: vacation weeks excluded)
}

export interface DrivingProfile {
  vehicleId: string;
  tripCount: number;
  avgTripMiles: Maybe<number>;
  monthlyMiles: Maybe<number>; // unknown("weekly_driving_unconfirmed") without WeeklyDriving
  cityShare: Maybe<number>;
  source: SourceKind; // "derived" (trips only) or "user_reported" (with the weekly confirmation)
  findings: QualityFinding[];
  computedAt: string;
}
