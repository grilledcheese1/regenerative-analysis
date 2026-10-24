// Coaching tip: trip-level facts in, short friendly text out. Uses the Claude API through plain fetch, and
// always has a deterministic fallback so the demo never shows an error because the AI call failed.
// Never sends raw samples. Server only.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MissedCause, Trip } from "../../src/lib/trip/types";
import { anthropicKey, coachModel } from "./env.ts";

export interface WeatherSummary {
  temperatureC: number;
  rain24hMm: number;
  snow24hCm: number;
  suggestedCondition: string;
}

export interface CoachFacts {
  driver: string;
  condition: string;
  regenEnabled: boolean;
  score: number;
  energyRecoveredKwh: number;
  energyCeilingKwh: number | null;
  missedByCause: Partial<Record<MissedCause, number>>;
  worstMissed: { timeS: number; speedMph: number; gradePct: number; cause: MissedCause; frictionKw: number } | null;
  /** Today's real weather at the route, for reference only. The trip's own condition is the simulated one. */
  realWeatherNow: WeatherSummary | null;
}

export interface CoachResult {
  tip: string;
  basedOn: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function loadWeather(routeId: string): WeatherSummary | null {
  const file = path.join(process.cwd(), "data", "cache", "weather", `${routeId}.json`);
  if (!existsSync(file)) return null;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { summary: WeatherSummary }).summary ?? null;
  } catch {
    return null;
  }
}

/** Route id is the prefix of tripId: <routeId>-<driver>-<condition>[-noregen]. */
export const routeIdOf = (tripId: string) => tripId.split("-")[0];

export function factsFromTrip(trip: Trip, weather: WeatherSummary | null): CoachFacts {
  const missedByCause: CoachFacts["missedByCause"] = {};
  for (const e of trip.summary.missedEvents ?? []) missedByCause[e.cause] = (missedByCause[e.cause] ?? 0) + 1;
  let worst: CoachFacts["worstMissed"] = null;
  for (const s of trip.samples) {
    if (s.missed && (!worst || s.frictionKw > worst.frictionKw)) {
      worst = { timeS: s.t, speedMph: Math.round(s.speed * 2.23694), gradePct: r2(s.grade), cause: s.missed, frictionKw: r2(s.frictionKw) };
    }
  }
  return {
    driver: trip.header.driver,
    condition: trip.header.condition,
    regenEnabled: trip.header.regenEnabled,
    score: trip.summary.score,
    energyRecoveredKwh: r2(trip.summary.energyRecoveredKwh),
    energyCeilingKwh: trip.summary.energyCeilingKwh !== undefined ? r2(trip.summary.energyCeilingKwh) : null,
    missedByCause,
    worstMissed: worst,
    realWeatherNow: weather,
  };
}

export function basedOnString(f: CoachFacts): string {
  const parts = [f.regenEnabled ? `score ${f.score}` : "regen off"];
  for (const [cause, n] of Object.entries(f.missedByCause)) parts.push(`${n} ${cause} event${n === 1 ? "" : "s"}`);
  parts.push(`${f.condition} road`);
  return parts.join(", ");
}

const ADVICE: Record<MissedCause, string> = {
  "late braking": "start easing off the pedal earlier and brake more gently, so the motor can take the load",
  "low grip": "brake earlier and lighter, since slippery roads limit how much the motor can recover",
  "full battery": "expect less regen when the battery is nearly full, and use the extra coasting time to slow down gradually",
  "cold battery": "give the battery a few minutes to warm up, and brake gently while it is cold",
};

/** Deterministic tip built only from the facts. Used when there is no saved tip and the AI call is unavailable. */
export function fallbackTip(f: CoachFacts): CoachResult {
  const basedOn = basedOnString(f);
  if (!f.regenEnabled) {
    const ceiling = f.energyCeilingKwh !== null ? ` Regen could recover up to about ${f.energyCeilingKwh} kWh on this route.` : "";
    return {
      tip: `Regen is off on this conventional-car baseline, so every stop turned into brake heat.${ceiling} Turn regen on and ease off the pedal early before stops to see the difference.`,
      basedOn,
    };
  }
  const entries = Object.entries(f.missedByCause) as [MissedCause, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const lead = f.score >= 75 ? "Nice, smooth driving." : f.score >= 50 ? "A decent trip with room to improve." : "A lot of braking energy was lost to heat.";
  const weather = f.condition === "wet" || f.condition === "snow" || f.condition === "mud" ? ` With a ${f.condition} road, brake earlier than you would on dry pavement.` : "";
  if (entries.length === 0) {
    return { tip: `${lead} You recovered ${f.energyRecoveredKwh} kWh and missed no regen opportunities, so keep braking early and gently.${weather}`, basedOn };
  }
  const [cause, n] = entries[0];
  return {
    tip: `${lead} The biggest loss was ${n} ${cause} event${n === 1 ? "" : "s"}: ${ADVICE[cause]}.${weather}`,
    basedOn,
  };
}

const SYSTEM_PROMPT =
  "You are the coach in Regen Coach, a demo app that scores regenerative braking from SIMULATED drives. " +
  "Write 2 or 3 friendly, specific sentences with one concrete action. Adapt to the road condition (for example brake " +
  "earlier in the wet). Use only the facts provided and never invent numbers. Do not claim this is real telemetry. " +
  "For a no-regen baseline trip, say regen is off and explain what regen would have recovered. No markdown.";

/** Asks Claude for a tip. Returns null on any failure so the caller can fall back. */
export async function claudeTip(f: CoachFacts): Promise<CoachResult | null> {
  const key = anthropicKey();
  if (!key) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: coachModel(),
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Trip facts (JSON). The trip condition is simulated; realWeatherNow is only today's actual weather for context.\n${JSON.stringify(f)}` }],
      }),
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text?.trim();
    return text ? { tip: text, basedOn: basedOnString(f) } : null;
  } catch {
    return null;
  }
}

/** Claude when allowed and available, otherwise the deterministic tip. Never throws. */
export async function coachFor(trip: Trip, opts: { allowApi: boolean }): Promise<CoachResult & { source: "claude" | "fallback" }> {
  const facts = factsFromTrip(trip, loadWeather(routeIdOf(trip.header.tripId)));
  if (opts.allowApi) {
    const tip = await claudeTip(facts);
    if (tip) return { ...tip, source: "claude" };
  }
  return { ...fallbackTip(facts), source: "fallback" };
}
