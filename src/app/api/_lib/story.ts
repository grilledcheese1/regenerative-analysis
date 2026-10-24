// Turns a simulated trip into plain-English sentences in miles and mph, with street names.

import { env } from "@/lib/env";
import { SAVINGS } from "@/lib/model/config";
import type { MissedEvent } from "@/lib/model/score";
import type { MissedCause } from "@/lib/trip/types";
import type { MissedMoment, TripStory } from "./types";
import type { SimulatedTrip } from "./trips";

const METERS_PER_MILE = 1609.34;
const MPH_PER_MS = 2.23694;
const BIGGEST_MISSES = 3;

const CAUSE: Record<string, MissedCause> = {
  "late-braking": "late braking",
  "low-grip": "low grip",
  "full-battery": "full battery",
  "cold-battery": "cold battery",
};

const WHY: Record<MissedCause, string> = {
  "late braking": "you braked too hard for regen to keep up",
  "low grip": "the slippery road made the car limit regen",
  "full battery": "the battery was full",
  "cold battery": "the cold battery couldn't take the charge",
};

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
export const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
export const miles = (m: number) => round(m / METERS_PER_MILE);

// Street name at a lat/lon on this route (simulator samples sit exactly on route points).
export function streetLookup({ route }: SimulatedTrip) {
  const byPos = new Map<string, string | null>();
  for (const p of route.points) byPos.set(`${p.lat},${p.lon}`, (p as { street?: string | null }).street ?? null);
  return (lat: number, lon: number) => byPos.get(`${lat},${lon}`) ?? null;
}

export function missedMoment(e: MissedEvent, street: string | null): MissedMoment {
  const cause = CAUSE[e.cause];
  const lostWh = Math.round(e.lostKwh * 1000);
  return {
    t: e.t,
    time: clock(e.t),
    lat: e.lat,
    lon: e.lon,
    street,
    cause,
    lostWh,
    sentence: `At ${clock(e.t)}${street ? ` on ${street}` : ""} ${WHY[cause]}, so ${lostWh} Wh went to the brake pads.`,
  };
}

export function buildStory(found: SimulatedTrip): TripStory {
  const { trip, sim, analysis: a } = found;
  const streetAt = streetLookup(found);
  const dist = miles(trip.header.distanceM);
  const minutes = Math.round(a.durationS / 60);
  const usefulKwhPerGallon = SAVINGS.kwhPerGallon * SAVINGS.engineEfficiency;
  const saved = (a.regenKwh / usefulKwhPerGallon) * env.defaultGasPrice;
  const leftOnTable = (a.missed.reduce((sum, e) => sum + e.lostKwh, 0) / usefulKwhPerGallon) * env.defaultGasPrice;
  const regenSharePct = Math.round(a.regenShare * 100);

  const biggestMisses = [...a.missed]
    .sort((x, y) => y.lostKwh - x.lostKwh)
    .slice(0, BIGGEST_MISSES)
    .map((e) => missedMoment(e, streetAt(e.lat, e.lon)));

  // Street where the most energy went back into the battery
  const regenByStreet = new Map<string, number>();
  for (const s of sim.samples) {
    const street = streetAt(s.lat, s.lon);
    if (street && s.regenKw > 0) regenByStreet.set(street, (regenByStreet.get(street) ?? 0) + s.regenKw / 3600);
  }
  const best = [...regenByStreet].sort((x, y) => y[1] - x[1])[0];
  const bestStretch = best ? { street: best[0], recoveredWh: Math.round(best[1] * 1000) } : null;

  const sentences = [`You drove ${dist} miles in ${minutes} minutes (simulated trip).`];
  if (!trip.header.regenEnabled) {
    sentences.push(
      `This is the conventional-car baseline: all ${Math.round(a.frictionKwh * 1000)} Wh of braking energy turned into brake heat.`,
      "Compare it with the hybrid trips to see what regen is worth on this route.",
    );
  } else {
    sentences.push(
      `You recovered ${a.score}% of the braking energy that was available.`,
      `${regenSharePct}% of your braking was done by regen instead of the brake pads.`,
    );
    if (bestStretch) sentences.push(`Your best stretch was ${bestStretch.street}, where you recovered ${bestStretch.recoveredWh} Wh.`);
    if (biggestMisses.length) {
      const counts: Record<string, number> = {};
      for (const e of a.missed) counts[CAUSE[e.cause]] = (counts[CAUSE[e.cause]] ?? 0) + 1;
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0] as MissedCause;
      sentences.push(
        `You missed regen ${a.missed.length} time${a.missed.length === 1 ? "" : "s"}, mostly because ${WHY[top]}.`,
        `Biggest one: ${biggestMisses[0].sentence.charAt(0).toLowerCase()}${biggestMisses[0].sentence.slice(1)}`,
      );
    } else {
      sentences.push("You didn't miss a single regen opportunity.");
    }
    sentences.push(
      `Regen saved about $${saved.toFixed(2)} in gas on this trip` +
        (leftOnTable >= 0.005 ? `, and you left about $${leftOnTable.toFixed(2)} on the table (estimates).` : " (estimate)."),
    );
  }

  return {
    tripId: trip.header.tripId,
    simulated: true,
    estimate: true,
    headline: trip.header.regenEnabled ? `${a.label} · ${a.score}/100` : "Conventional car · no regen",
    sentences,
    stats: {
      miles: dist,
      minutes,
      avgMph: round((trip.header.distanceM / Math.max(a.durationS, 1)) * MPH_PER_MS),
      score: a.score,
      regenSharePct,
      savedDollars: round(saved, 2),
      leftOnTableDollars: round(leftOnTable, 2),
    },
    biggestMisses,
    missedCount: a.missed.length,
    bestStretch,
  };
}
