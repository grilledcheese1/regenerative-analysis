import type { TripQuality } from "@/contracts";

/** "What the file supports", exactly one line. */
export function supportsLine(q: TripQuality): string {
  if (q.eventAnalysisAvailable) return "Route, mileage, speed and speed-change observations.";
  if (q.speedAvailable) return "Route, mileage and speed.";
  return "Route and mileage only.";
}
