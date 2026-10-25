import type { ReliabilityInfo } from "@/contracts";
import raw from "@/fixtures/reliability.json";

// NHTSA recall and owner-complaint counts per catalog car, fetched by scripts/fetch-reliability.mjs.
// Counts are for the whole model year (every trim), so they compare models, not individual cars.

export type { ReliabilityInfo };

const CARS = (raw as { cars: Record<string, ReliabilityInfo & { nhtsaModel: string }> }).cars;

export function reliabilityFor(catalogId: string): ReliabilityInfo & { nhtsaModel?: string } {
  return CARS[catalogId] ?? { catalogId, recalls: null, complaints: null, retrievedAt: "", source: "observed" };
}

/** −1 when `a` is more reliable (fewer complaints, then fewer recalls), 1 when `b` is, 0 when equal or unknown. */
export function moreReliable(a: ReliabilityInfo, b: ReliabilityInfo): -1 | 0 | 1 {
  if (a.complaints === null || b.complaints === null || a.recalls === null || b.recalls === null) return 0;
  if (a.complaints !== b.complaints) return a.complaints < b.complaints ? -1 : 1;
  if (a.recalls !== b.recalls) return a.recalls < b.recalls ? -1 : 1;
  return 0;
}
