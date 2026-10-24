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
