// Where one simulated person's regen score sits among all the others. Pure and deterministic: each person is scored by
// replaying their cached route at their driving style in dry conditions. APPROXIMATION on simulated drives.

import type { Persona } from "@/contracts";
import { PEOPLE, styleOf, type DriveStyle } from "@/fixtures/personas";
import { analyzeTrip } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { ROUTES } from "@/lib/routes";

const cache = new Map<string, number>();

/** 0..100 regen score for a route at a driving style. Only a handful of combinations exist, so they are cached. */
export function driveScore(routeId: string, style: DriveStyle): number {
  const key = `${routeId}:${style}`;
  let score = cache.get(key);
  if (score === undefined) {
    const route = ROUTES.find((r) => r.id === routeId) ?? ROUTES[0];
    score = Math.round(analyzeTrip(simulateTrip(route, { driver: style, condition: "dry", regen: true })).score);
    cache.set(key, score);
  }
  return score;
}

export interface PeerRank {
  score: number;
  /** Share of the other simulated people this score beats, 0..100. A tie counts as half. */
  betterThanPct: number;
  /** Everyone else's score, for drawing the strip. */
  others: number[];
  /** How many other people. */
  n: number;
}

/** Ranks anyone (a case study or an onboarded user) against the simulated people, never against themselves. */
export function peerRank(persona: Persona): PeerRank {
  const me = { score: driveScore(persona.usage.routeId, styleOf(persona.id)) };
  const others = PEOPLE.filter((p) => p.id !== persona.id).map((p) => driveScore(p.usage.routeId, styleOf(p.id)));
  const beaten = others.reduce((acc, s) => acc + (me.score > s ? 1 : me.score === s ? 0.5 : 0), 0);
  return { score: me.score, betterThanPct: Math.round((100 * beaten) / others.length), others, n: others.length };
}
