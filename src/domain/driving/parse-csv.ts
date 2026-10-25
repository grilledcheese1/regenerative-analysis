import type { TripPoint } from "@/contracts";
import { MAX_TRACK_POINTS } from "./constants";
import { fail, num, point, validLatLon, type ParsedPoints, type ParseFailure } from "./types";

export const CSV_HEADER = "timestamp,latitude,longitude,speedMps,horizontalAccuracyMeters,altitudeMeters";

const ZONED = /(Z|[+-]\d{2}:\d{2})$/i;

/** The documented CSV format: exact header, no quoting, zoned timestamps, empty optional fields → null. */
export function parseCsv(input: string): ParsedPoints | ParseFailure {
  const lines = input.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== CSV_HEADER) {
    return fail(400, "csv_header_mismatch", `The first line must be exactly: ${CSV_HEADER}`);
  }
  if (input.includes('"')) return fail(400, "csv_quoting_not_supported", "Quoted CSV fields aren't supported.");

  const rows = lines.slice(1).filter((l) => l.trim() !== "");
  if (rows.length > MAX_TRACK_POINTS) {
    return fail(413, "too_many_points", `This file has ${rows.length.toLocaleString()} rows; the limit is ${MAX_TRACK_POINTS.toLocaleString()}.`);
  }

  const pts: TripPoint[] = [];
  let droppedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = i + 2; // 1-based, counting the header
    const cols = rows[i].split(",").map((c) => c.trim());
    if (cols.length !== 6) return fail(400, "csv_column_count", `Row ${row} has ${cols.length} columns; expected 6.`);
    const [ts, latS, lonS, speedS, accS, altS] = cols;
    if (!ts) return fail(400, "csv_missing_timestamp", `Row ${row} has no timestamp.`);
    if (!ZONED.test(ts)) {
      return fail(400, "csv_timestamp_without_zone", `Row ${row}: the timestamp needs a time zone (Z or ±hh:mm).`);
    }
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return fail(400, "csv_invalid_timestamp", `Row ${row}: "${ts}" isn't a valid timestamp.`);

    const optional = [speedS, accS, altS].map((s) => (s === "" ? null : num(s)));
    if ([speedS, accS, altS].some((s, k) => s !== "" && optional[k] === null)) {
      return fail(400, "csv_invalid_value", `Row ${row} has a value that isn't a number.`);
    }
    const lat = num(latS);
    const lon = num(lonS);
    if (lat === null || lon === null || !validLatLon(lat, lon)) {
      droppedCount++;
      continue;
    }
    const [speed, accuracy, altitude] = optional;
    pts.push(
      point(lat, lon, {
        t: new Date(ms).toISOString(),
        observedSpeedMps: speed !== null && speed >= 0 ? speed : null,
        accuracyM: accuracy !== null && accuracy >= 0 ? accuracy : null,
        altitudeM: altitude,
      }),
    );
  }
  if (!pts.length) return fail(422, "csv_no_points", "This CSV file has no usable rows.");
  return { ok: true, tracks: [[pts]], originalCount: rows.length, droppedCount };
}
