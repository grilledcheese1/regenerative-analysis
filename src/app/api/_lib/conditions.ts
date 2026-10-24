// Works out the road condition from real weather: at the user's location when we have it,
// otherwise from the route's cached weather. Mirrors suggestCondition() in scripts/fetch-routes.mjs.

import { serverEnv } from "@/lib/env";
import type { Condition } from "@/lib/trip/types";
import { DATA_CONFIG as C } from "../../../../scripts/data.config.mjs";
import type { CachedRoute } from "./trips";
import type { ConditionsResponse, LocalWeather } from "./types";

const COORD_DECIMALS = 2; // ~1 km: enough for weather, without sending a precise location anywhere
const WEATHER_TIMEOUT_MS = 4000;
const CACHE_MS = 10 * 60 * 1000;

const weatherCache = new Map<string, { at: number; weather: LocalWeather }>();

export function unpavedShare(route: CachedRoute): number {
  const pts = route.points as { surface?: string }[];
  return pts.filter((p) => p.surface === "gravel" || p.surface === "dirt").length / pts.length;
}

export function decideCondition(w: LocalWeather, unpaved: number): { condition: Condition; reason: string } {
  const rain = w.precipitationLast24hMm;
  if (rain >= C.wetAfterRainMm && unpaved >= C.mudUnpavedShare)
    return { condition: "mud", reason: `${rain} mm of rain on a route that is ${Math.round(unpaved * 100)}% unpaved` };
  if (w.snowfallLast24hCm >= C.snowAfterSnowCm)
    return { condition: "snow", reason: `${w.snowfallLast24hCm} cm of snow fell in the last 24 hours` };
  if (w.temperatureC < 0) return { condition: "snow", reason: `It's ${w.temperatureC}°C, below freezing` };
  if (rain >= C.wetAfterRainMm) return { condition: "wet", reason: `${rain} mm of rain fell in the last 24 hours` };
  const rainNote = rain > 0 ? `Only ${rain} mm of rain` : "No rain";
  return { condition: "dry", reason: `${rainNote} in the last 24 hours and ${w.temperatureC}°C` };
}

export async function weatherAt(lat: number, lon: number): Promise<LocalWeather> {
  const [la, lo] = [lat.toFixed(COORD_DECIMALS), lon.toFixed(COORD_DECIMALS)];
  const key = `${la},${lo}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.weather;

  const url =
    `${serverEnv().openMeteoBaseUrl}/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&current=temperature_2m,precipitation,snowfall&hourly=precipitation,snowfall&past_days=1&forecast_days=1&timezone=UTC`;
  const res = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();

  let rain = 0;
  let snow = 0;
  json.hourly.time.forEach((t: string, i: number) => {
    const age = Date.now() - Date.parse(t + "Z");
    if (age >= 0 && age <= 24 * 3600 * 1000) {
      rain += json.hourly.precipitation[i] ?? 0;
      snow += json.hourly.snowfall[i] ?? 0;
    }
  });
  const weather: LocalWeather = {
    temperatureC: Math.round(json.current.temperature_2m),
    precipitationLast24hMm: Math.round(rain * 10) / 10,
    snowfallLast24hCm: Math.round(snow * 10) / 10,
    rainingNow: (json.current.precipitation ?? 0) > 0,
  };
  weatherCache.set(key, { at: Date.now(), weather });
  return weather;
}

export async function conditionsFor(route: CachedRoute, lat?: number, lon?: number): Promise<ConditionsResponse> {
  const unpaved = unpavedShare(route);
  const city = route.name.match(/\(([^)]+)\)$/)?.[1] ?? "the route";

  if (lat !== undefined && lon !== undefined) {
    try {
      const weather = await weatherAt(lat, lon);
      return { source: "location", place: "Near you", weather, ...decideCondition(weather, unpaved), unpavedPct: Math.round(unpaved * 100) };
    } catch {
      // Fall through to the route's cached weather so the demo never breaks offline.
    }
  }
  const w = route.weather;
  const weather: LocalWeather = {
    temperatureC: Math.round(w.temperatureC),
    precipitationLast24hMm: w.precipitationLast24hMm,
    snowfallLast24hCm: w.snowfallLast24hCm,
    rainingNow: false,
  };
  return { source: "route", place: city, weather, ...decideCondition(weather, unpaved), unpavedPct: Math.round(unpaved * 100) };
}
