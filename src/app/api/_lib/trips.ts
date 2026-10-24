// Stream 2 helpers shared by the API routes. The leading underscore keeps this folder out of routing.
// Trips are simulated on request from the cached real routes in data/cache/routes, using Stream 1's
// model, so physics changes show up without regenerating any files and the demo makes no live API calls.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { DemoRoute } from "@/lib/mock/route";
import { analyzeTrip, type TripAnalysis } from "@/lib/model/score";
import { simulateTrip, type SimTrip } from "@/lib/model/simulate";
import { toContractTrip } from "@/lib/trip/adapt";
import type { Condition, Driver, Trip, TripHeader } from "@/lib/trip/types";
import type { RouteListItem, SuggestedCondition } from "./types";

export const DRIVERS: Driver[] = ["smooth", "aggressive", "mixed"];
export const CONDITIONS: Condition[] = ["dry", "wet", "snow", "mud"];

const ROUTES_DIR = path.join(process.cwd(), "data", "cache", "routes");
const SAFE_ID = /^[a-z0-9-]+$/;

export type CachedRoute = DemoRoute & {
  routeId: string;
  terrain: string;
  weather: { temperatureC: number; precipitationLast24hMm: number; snowfallLast24hCm: number };
  suggestedCondition: SuggestedCondition;
  source: string;
};

export async function listRoutes(): Promise<Omit<RouteListItem, "miles" | "label">[]> {
  return JSON.parse(await readFile(path.join(ROUTES_DIR, "index.json"), "utf8"));
}

const routeCache = new Map<string, CachedRoute>();

export async function getRoute(routeId: string): Promise<CachedRoute | null> {
  if (!SAFE_ID.test(routeId) || routeId === "index") return null;
  if (!routeCache.has(routeId)) {
    try {
      routeCache.set(routeId, JSON.parse(await readFile(path.join(ROUTES_DIR, `${routeId}.json`), "utf8")));
    } catch {
      return null;
    }
  }
  return routeCache.get(routeId)!;
}

// Trip ids look like "hill-smooth-dry", with "-noregen" on the end for the conventional-car baseline.
export function parseTripId(tripId: string) {
  const m = tripId.match(/^([a-z0-9]+)-(smooth|aggressive|mixed)-(dry|wet|snow|mud)(-noregen)?$/);
  if (!m) return null;
  return { routeId: m[1], driver: m[2] as Driver, condition: m[3] as Condition, regen: !m[4] };
}

export function tripIdFor(routeId: string, driver: Driver, condition: Condition, regen = true) {
  return `${routeId}-${driver}-${condition}${regen ? "" : "-noregen"}`;
}

export interface SimulatedTrip {
  trip: Trip; // the locked contract shape
  sim: SimTrip;
  analysis: TripAnalysis;
  route: CachedRoute;
}

const tripCache = new Map<string, SimulatedTrip>();

export async function getTrip(tripId: string): Promise<SimulatedTrip | null> {
  const cached = tripCache.get(tripId);
  if (cached) return cached;
  const parts = parseTripId(tripId);
  const route = parts && (await getRoute(parts.routeId));
  if (!parts || !route) return null;
  const sim = simulateTrip(route, { driver: parts.driver, condition: parts.condition, regen: parts.regen });
  const analysis = analyzeTrip(sim);
  const trip = toContractTrip(sim, analysis, env.defaultGasPrice);
  trip.header.tripId = tripId;
  const result = { trip, sim, analysis, route };
  tripCache.set(tripId, result);
  return result;
}

export async function listTripHeaders(): Promise<TripHeader[]> {
  const headers: TripHeader[] = [];
  for (const { routeId } of await listRoutes())
    for (const condition of CONDITIONS)
      for (const driver of DRIVERS)
        for (const regen of [true, false]) {
          const found = await getTrip(tripIdFor(routeId, driver, condition, regen));
          if (found) headers.push(found.trip.header);
        }
  return headers;
}
