// Fetches traffic signals, stop signs and drivable ways (with geometry and surface) from OpenStreetMap
// via Overpass, one query per route. Never call Overpass from API routes or at demo time.
// Run: node --env-file=.env.local scripts/fetch-overpass.ts [--refresh] [--route=hilly]
import { cached, routeFilter } from "./lib/cache.ts";
import { readDirections } from "./lib/directions.ts";
import { overpassUrl } from "./lib/env.ts";
import { fetchJson, sleep } from "./lib/http.ts";
import { ROUTES } from "./routes.config.ts";

const MARGIN_DEG = 0.002; // about 200 m
const MIRRORS = [overpassUrl(), "https://overpass.kumi.systems/api/interpreter"];
const DRIVABLE =
  "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|" +
  "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";

async function queryOverpass(query: string): Promise<unknown> {
  const body = `data=${encodeURIComponent(query)}`;
  const headers = { "content-type": "application/x-www-form-urlencoded", "user-agent": "regen-coach-hackathon/0.1" };
  let lastError: unknown;
  for (const url of [...new Set(MIRRORS)]) {
    try {
      return await fetchJson(url, { method: "POST", headers, body, timeoutMs: 90000, retries: 3, backoffMs: 5000 });
    } catch (err) {
      lastError = err;
      console.warn(`  Overpass mirror failed (${new URL(url).host}): ${(err as Error).message}`);
    }
  }
  throw lastError;
}

let first = true;
for (const route of ROUTES) {
  if (routeFilter() && routeFilter() !== route.id) continue;
  const coords = readDirections(route.id).geometry.coordinates;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const bbox = [
    Math.min(...lats) - MARGIN_DEG,
    Math.min(...lons) - MARGIN_DEG,
    Math.max(...lats) + MARGIN_DEG,
    Math.max(...lons) + MARGIN_DEG,
  ]
    .map((n) => n.toFixed(6))
    .join(",");
  const query =
    `[out:json][timeout:60];(` +
    `node["highway"="traffic_signals"](${bbox});` +
    `node["highway"="stop"](${bbox});` +
    `way["highway"~"^(${DRIVABLE})$"](${bbox});` +
    `);out geom;`;
  if (!first) await sleep(5000); // be polite: pause between queries
  const { data, fromCache } = await cached("overpass", route.id, () => queryOverpass(query));
  if (!fromCache) first = false;
  const els = (data as { elements: { type: string; tags?: Record<string, string> }[] }).elements;
  console.log(
    `${route.id}${fromCache ? " (cached)" : ""}: ${els.filter((e) => e.tags?.highway === "traffic_signals").length} signals, ` +
      `${els.filter((e) => e.tags?.highway === "stop").length} stop signs, ${els.filter((e) => e.type === "way").length} ways`,
  );
}
