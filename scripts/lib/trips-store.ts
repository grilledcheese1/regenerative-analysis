// Read-only access to data/trips for the API routes. Reads local files only, never calls an external API.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Trip, TripHeader } from "../../src/lib/trip/types";

export const ID_RE = /^[a-z0-9-]+$/;
const dir = () => path.join(process.cwd(), "data", "trips");

export const isValidId = (id: string) => ID_RE.test(id);

export function tripFile(id: string): string | null {
  if (!isValidId(id)) return null;
  const file = path.join(dir(), `${id}.json`);
  return existsSync(file) ? file : null;
}

export function readTrip(id: string): Trip | null {
  const file = tripFile(id);
  if (!file) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Trip;
  } catch {
    return null;
  }
}

export function readSavedCoach(id: string): { tip: string; basedOn: string } | null {
  if (!isValidId(id)) return null;
  const file = path.join(dir(), `${id}.coach.json`);
  if (!existsSync(file)) return null;
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as { tip?: string; basedOn?: string };
    return c.tip && c.basedOn ? { tip: c.tip, basedOn: c.basedOn } : null;
  } catch {
    return null;
  }
}

let cache: { mtime: number; headers: TripHeader[] } | null = null;

/** Headers of every generated trip (not sample.json or coach files), sorted by tripId. */
export function listHeaders(): TripHeader[] {
  const d = dir();
  if (!existsSync(d)) return [];
  const mtime = statSync(d).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.headers;
  const headers: TripHeader[] = [];
  for (const name of readdirSync(d)) {
    if (!name.endsWith(".json") || name.endsWith(".coach.json") || name === "sample.json") continue;
    try {
      const t = JSON.parse(readFileSync(path.join(d, name), "utf8")) as Trip;
      if (t.header?.tripId) headers.push(t.header);
    } catch {
      // skip unreadable files
    }
  }
  headers.sort((a, b) => a.tripId.localeCompare(b.tripId));
  cache = { mtime, headers };
  return headers;
}
