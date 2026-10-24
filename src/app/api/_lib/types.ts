// Response types for every Stream 2 API route, so other streams get autocomplete:
//   import type { TripStory } from "@/app/api/_lib/types";
// The Trip and TripHeader shapes themselves come from the locked contract in @/lib/trip/types.

import type { Condition, MissedCause } from "@/lib/trip/types";

export interface SuggestedCondition {
  condition: Condition;
  reason: string; // e.g. "No rain in the last 24 hours and 29°C"
}

// GET /api/routes
export interface RouteListItem {
  routeId: string;
  name: string;
  terrain: string;
  distanceM: number;
  miles: number;
  stops: number;
  label: string; // e.g. "Hilly · 4.9 mi · 10 stops"
  suggestedCondition: SuggestedCondition;
}

// GET /api/routes/[id]: DemoRoute plus these extras on each point and on the route
export interface RoutePointExtras {
  surface: "asphalt" | "gravel" | "dirt" | "unknown";
  surfaceDetail: SurfaceDetail;
  roadClass: string;
  street: string | null;
}

// GET /api/trips/[id]/story
export interface MissedMoment {
  t: number; // seconds since trip start
  time: string; // "3:26"
  lat: number;
  lon: number;
  street: string | null;
  cause: MissedCause;
  lostWh: number;
  sentence: string; // "At 3:26 on Redbud Trail you braked too hard for regen to keep up and lost 12 Wh."
}

export interface TripStory {
  tripId: string;
  simulated: true;
  estimate: true;
  headline: string; // "Decent capture · 68/100"
  sentences: string[]; // short plain-English summary, in reading order
  stats: {
    miles: number;
    minutes: number;
    avgMph: number;
    score: number;
    regenSharePct: number;
    savedDollars: number;
    leftOnTableDollars: number;
  };
  biggestMisses: MissedMoment[]; // up to three, largest first
  missedCount: number;
  bestStretch: { street: string; recoveredWh: number } | null;
}

// GET /api/trips/[id]/coach
export interface CoachResponse {
  tip: string;
  basedOn: string; // the facts the tip was written from, one per line
  source: "claude" | "rules";
}

// GET /api/conditions
export interface LocalWeather {
  temperatureC: number;
  precipitationLast24hMm: number;
  snowfallLast24hCm: number;
  rainingNow: boolean;
}

export interface ConditionsResponse {
  source: "location" | "route"; // "route" = the user's location wasn't available, so the route's weather was used
  place: string; // "Near you" or the route's city
  weather: LocalWeather;
  condition: Condition;
  reason: string; // "No rain in the last 24 hours and 29°C"
  unpavedPct: number; // share of the route on gravel or dirt
}

// Surface kinds on each route point (surfaceDetail), used by the map's surface view
export type SurfaceDetail = "asphalt" | "concrete" | "gravel" | "dirt" | "unknown";
