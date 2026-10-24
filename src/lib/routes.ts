// Real demo routes cached by scripts/fetch-routes.mjs (Mapbox Directions geometry and
// speed limits, Open-Meteo elevation, OpenStreetMap signals and stop signs).

import type { DemoRoute } from "@/lib/mock/route";
import cached from "@/data/routes.json";

export interface CachedRoute extends DemoRoute {
  id: string;
  kind: string;
  sources: { geometry: string; elevation: string; stops: string };
  fetchedAt: string;
}

export const ROUTES = cached as CachedRoute[];

/** Stop positions as [lon, lat] for the map markers. */
export function stopCoords(route: DemoRoute): [number, number][] {
  return route.stopsM.map((s) => {
    const p = route.points[Math.min(route.points.length - 1, Math.round(s / route.stepM))];
    return [p.lon, p.lat];
  });
}
