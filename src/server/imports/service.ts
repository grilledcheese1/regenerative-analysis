import "server-only";
import { PARSER_VERSION, unknown, type ImportFormat, type ImportPreview, type TripQuality, type TripRecord, type TripSummary } from "@/contracts";
import { analyzeFile, analyzeTracks, parseFile } from "@/domain/driving/analyze";
import { CSV_HEADER } from "@/domain/driving/parse-csv";
import { routeFromTrack } from "@/domain/driving/replay";
import type { DemoRoute } from "@/lib/mock/route";
import { ownedStore } from "@/server/store";

// production: private owner-scoped object storage, 14-day retention (engineering guide).
// Here the original bytes live in memory with the job only until it is confirmed or cancelled.
export type ImportJob = ImportPreview & { bytes?: Uint8Array };

export const imports = ownedStore<ImportJob>("imports", { maxPerOwner: 50 });
export const trips = ownedStore<TripRecord>("trips", { maxPerOwner: 200 });
/** Replay routes built from each confirmed trip's full track (the trip record keeps only a preview line). */
export const tripRoutes = ownedStore<DemoRoute>("trip_routes", { maxPerOwner: 200 });

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
export const maxImportBytes = () => {
  const n = Number(process.env.IMPORT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
};

export interface ImportFailure {
  status: number;
  code: string;
  message: string;
}

export const publicPreview = ({ bytes, ...preview }: ImportJob): ImportPreview => {
  void bytes;
  return preview;
};

/** Never logs bytes, coordinates or filenames. */
export function logImport(requestId: string, importId: string | null, code: string, startedAt: number) {
  console.info(JSON.stringify({ at: "imports", requestId, importId, code, ms: Date.now() - startedAt }));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isArchive = (b: Uint8Array) =>
  (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) || (b[0] === 0x1f && b[1] === 0x8b);

/** Extension first, then magic bytes, strict UTF-8, then a content sniff that must agree. */
export function detectFormat(filename: string, bytes: Uint8Array): { format: ImportFormat; text: string } | ImportFailure {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext !== "gpx" && ext !== "csv") {
    return { status: 400, code: "unsupported_format", message: "Upload a .gpx file or a .csv in the documented format." };
  }
  if (isArchive(bytes)) {
    return { status: 400, code: "archive_not_supported", message: "Compressed files aren't supported. Upload the .gpx or .csv itself." };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // also drops a leading BOM
  } catch {
    return { status: 400, code: "unsupported_encoding", message: "This file isn't valid UTF-8 text." };
  }
  if (ext === "gpx" && !/<gpx[\s>]/.test(text)) {
    return { status: 400, code: "unsupported_format", message: "This .gpx file has no <gpx> element." };
  }
  // A wrong CSV header is reported by the parser (csv_header_mismatch); here we only refuse markup posing as CSV.
  if (ext === "csv" && text.trimStart().startsWith("<")) {
    return { status: 400, code: "unsupported_format", message: `This doesn't look like a CSV. Expected the header: ${CSV_HEADER}` };
  }
  return { format: ext, text };
}

const EMPTY_QUALITY: TripQuality = { routeAvailable: false, speedAvailable: false, eventAnalysisAvailable: false, findings: [] };
const emptySummary = (): TripSummary => ({
  distanceMeters: 0,
  startAt: null,
  endAt: null,
  durationS: unknown("import_failed"),
  movingTimeS: unknown("import_failed"),
  avgMovingSpeedMps: unknown("import_failed"),
  cityShare: unknown("import_failed"),
  sharpDecelEvents: unknown("import_failed"),
  originalSampleCount: 0,
  usedSampleCount: 0,
});

export interface NewImport {
  owner: string;
  vehicleId: string;
  filename: string;
  bytes: Uint8Array;
  contentHash: string;
  format: ImportFormat;
  text: string;
  sample: boolean;
}

/**
 * Parses and stores a job. A refused file is stored as `failed` so its error can be inspected.
 * Returns the stored job plus the failure, if any.
 */
export function createImport(input: NewImport): { job: ImportJob; failure?: ImportFailure } {
  const importId = "imp_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const base = {
    importId,
    vehicleId: input.vehicleId,
    filename: input.filename,
    byteCount: input.bytes.byteLength,
    contentHash: input.contentHash,
    format: input.format,
    parserVersion: PARSER_VERSION,
    source: input.sample
      ? { kind: "sample" as const, mode: "synthetic" as const }
      : { kind: input.format === "gpx" ? ("gpx_upload" as const) : ("csv_upload" as const), mode: "observed" as const },
    createdAt: new Date().toISOString(),
  };

  const parsed = parseFile(input.format, input.text);
  if (!parsed.ok) {
    const job: ImportJob = {
      ...base,
      state: "failed",
      quality: EMPTY_QUALITY,
      summary: emptySummary(),
      previewGeometry: [],
      segmentBreaks: [],
      error: { code: parsed.code, message: parsed.message },
    };
    imports.put(input.owner, importId, job);
    return { job, failure: { status: parsed.status, code: parsed.code, message: parsed.message } };
  }

  const a = analyzeFile(parsed, input.sample);
  const job: ImportJob = {
    ...base,
    state: "preview_ready",
    quality: a.quality,
    summary: a.summary,
    previewGeometry: a.geometry,
    segmentBreaks: a.segmentBreaks,
    bytes: input.bytes,
  };
  imports.put(input.owner, importId, job);
  return { job };
}

/**
 * An earlier non-cancelled import of the same bytes for this vehicle. Failed jobs are skipped
 * too, so re-uploading a refused file simply reports the same error again.
 */
export const findDuplicate = (owner: string, vehicleId: string, contentHash: string) =>
  imports.list(owner).find((j) => j.vehicleId === vehicleId && j.contentHash === contentHash && j.state !== "cancelled" && j.state !== "failed");

/** One TripRecord per source track; gap-split segments stay inside their trip as segmentBreaks. */
export function confirmImport(owner: string, job: ImportJob): string[] {
  const parsed = parseFile(job.format, new TextDecoder().decode(job.bytes!));
  if (!parsed.ok) throw new Error("stored import no longer parses"); // can't happen: same bytes, same parser
  const synthetic = job.source.kind === "sample";
  const createdAt = new Date().toISOString();
  const tripIds: string[] = [];
  for (const a of analyzeTracks(parsed, synthetic)) {
    if (!a.geometry.length) continue;
    const tripId = "trip_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    trips.put(owner, tripId, {
      tripId,
      importId: job.importId,
      vehicleId: job.vehicleId,
      source: job.source,
      summary: a.summary,
      quality: a.quality,
      geometry: a.geometry,
      segmentBreaks: a.segmentBreaks,
      driverConfirmed: true,
      createdAt,
    });
    const route = routeFromTrack(a.segments, "Your drive");
    if (route) tripRoutes.put(owner, tripId, route);
    tripIds.push(tripId);
  }
  imports.put(owner, job.importId, { ...job, state: "confirmed", tripIds, bytes: undefined });
  return tripIds;
}

export function cancelImport(owner: string, job: ImportJob): ImportJob {
  const cancelled: ImportJob = { ...job, state: "cancelled", bytes: undefined };
  imports.put(owner, job.importId, cancelled);
  return cancelled;
}
