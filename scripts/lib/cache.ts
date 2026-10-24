// File cache for raw and processed API responses. Every fetch script skips work when the file exists,
// unless --refresh is passed. Use --route=<id> to limit a script to one route.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export type CacheKind = "directions" | "elevation" | "overpass" | "weather" | "routes";

export const refreshRequested = () => process.argv.includes("--refresh");
export const routeFilter = (): string | undefined =>
  process.argv.find((a) => a.startsWith("--route="))?.slice("--route=".length);

export function cachePath(kind: CacheKind, routeId: string): string {
  const name = kind === "routes" ? `${routeId}.routepoints.json` : `${routeId}.json`;
  return path.join(ROOT, "data", "cache", kind, name);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, data: unknown, pretty = false): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : undefined) + "\n");
}

/** Reads the cache file when present, otherwise produces and writes it. */
export async function cached<T>(
  kind: CacheKind,
  routeId: string,
  produce: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean }> {
  const file = cachePath(kind, routeId);
  if (existsSync(file) && !refreshRequested()) return { data: readJson<T>(file), fromCache: true };
  const data = await produce();
  writeJson(file, data);
  return { data, fromCache: false };
}
