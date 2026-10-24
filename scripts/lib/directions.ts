// Shared reader for cached Mapbox Directions responses.
import { cachePath, readJson } from "./cache.ts";
import type { LonLat } from "./geo.ts";

export interface DirectionsRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: LonLat[] };
  legs: {
    annotation?: {
      distance?: number[];
      maxspeed?: ({ speed?: number; unit?: string; unknown?: boolean; none?: boolean })[];
    };
    steps: { name: string }[];
  }[];
}

export function readDirections(routeId: string): DirectionsRoute {
  const raw = readJson<{ routes?: DirectionsRoute[] }>(cachePath("directions", routeId));
  if (!raw.routes?.[0]) throw new Error(`No cached Directions route for ${routeId}. Run fetch-directions.ts first.`);
  return raw.routes[0];
}
