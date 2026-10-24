// Fetches recent weather at each route midpoint (Open-Meteo, no key) and summarizes it.
// Weather is context for the coaching tip and a suggested default condition only.
// Run: node --env-file=.env.local scripts/fetch-weather.ts [--refresh] [--route=hilly]
import { cached, routeFilter } from "./lib/cache.ts";
import { readDirections } from "./lib/directions.ts";
import { openMeteoBase } from "./lib/env.ts";
import { cumulative, pointAtDistance } from "./lib/geo.ts";
import { fetchJson } from "./lib/http.ts";
import { ROUTES } from "./routes.config.ts";

export interface WeatherSummary {
  temperatureC: number;
  rain24hMm: number;
  snow24hCm: number;
  suggestedCondition: "snow" | "wet" | "dry";
  asOf: string;
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  precipitation: number[];
  rain: number[];
  snowfall: number[];
}

export function summarize(h: Hourly, now = Date.now()): WeatherSummary {
  // Times are UTC ("YYYY-MM-DDTHH:00"); pick the latest hour not after now.
  let idx = 0;
  h.time.forEach((t, i) => {
    if (Date.parse(`${t}:00Z`) <= now) idx = i;
  });
  const from = Math.max(0, idx - 23);
  const sum = (xs: number[]) => xs.slice(from, idx + 1).reduce((a, b) => a + (b ?? 0), 0);
  const temperatureC = h.temperature_2m[idx];
  const rain24hMm = sum(h.rain);
  const snow24hCm = sum(h.snowfall);
  const suggestedCondition = snow24hCm > 0.1 || (temperatureC <= 0 && sum(h.precipitation) > 0.1) ? "snow" : rain24hMm >= 0.5 ? "wet" : "dry";
  return { temperatureC, rain24hMm: +rain24hMm.toFixed(2), snow24hCm: +snow24hCm.toFixed(2), suggestedCondition, asOf: `${h.time[idx]}Z` };
}

if (import.meta.main) {
  for (const route of ROUTES) {
    if (routeFilter() && routeFilter() !== route.id) continue;
    const coords = readDirections(route.id).geometry.coordinates;
    const cum = cumulative(coords);
    const [lon, lat] = pointAtDistance(coords, cum, cum[cum.length - 1] / 2);
    const url =
      `${openMeteoBase()}/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&hourly=temperature_2m,precipitation,rain,snowfall&past_days=1&forecast_days=1&timezone=UTC`;
    const { data, fromCache } = await cached("weather", route.id, async () => {
      const raw = await fetchJson<{ hourly: Hourly }>(url);
      return { routeId: route.id, fetchedAt: new Date().toISOString(), location: { lat, lon }, raw, summary: summarize(raw.hourly) };
    });
    const s = data.summary;
    console.log(
      `${route.id}${fromCache ? " (cached)" : ""}: ${s.temperatureC} C, rain 24h ${s.rain24hMm} mm, ` +
        `snow 24h ${s.snow24hCm} cm -> suggested ${s.suggestedCondition}`,
    );
  }
}
