// Fetches driving routes from the Mapbox Directions API and caches the raw response.
// Run: node --env-file=.env.local scripts/fetch-directions.ts [--refresh] [--route=hilly]
import { cached, routeFilter } from "./lib/cache.ts";
import { mapboxToken } from "./lib/env.ts";
import { fetchJson } from "./lib/http.ts";
import { ROUTES } from "./routes.config.ts";

interface DirectionsResponse {
  code: string;
  message?: string;
  routes?: { distance: number; duration: number; legs: { steps: { name: string }[] }[] }[];
}

const token = mapboxToken();
if (!token) {
  console.error("No Mapbox token. Set MAPBOX_TOKEN (or NEXT_PUBLIC_MAPBOX_TOKEN) in .env.local.");
  process.exit(1);
}

for (const route of ROUTES) {
  if (routeFilter() && routeFilter() !== route.id) continue;
  const coords = route.waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&steps=true&annotations=distance,maxspeed&access_token=${token}`;
  const { data, fromCache } = await cached("directions", route.id, () => fetchJson<DirectionsResponse>(url));
  if (data.code !== "Ok" || !data.routes?.[0]) {
    console.error(`${route.id}: Directions failed: ${data.code} ${data.message ?? ""}`);
    continue;
  }
  const r = data.routes[0];
  const roads = [...new Set(r.legs.flatMap((l) => l.steps.map((s) => s.name)).filter(Boolean))];
  console.log(
    `${route.id}${fromCache ? " (cached)" : ""}: ${(r.distance / 1000).toFixed(2)} km, ` +
      `${(r.duration / 60).toFixed(0)} min, ${roads.length} roads: ${roads.slice(0, 8).join(", ")}${roads.length > 8 ? ", ..." : ""}`,
  );
}
