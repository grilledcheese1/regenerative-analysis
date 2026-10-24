// Samples elevation along each cached route.
//   --source=usgs      (default) USGS 3DEP Elevation Point Query Service, 1 m lidar-derived DEM in Austin, every 20 m. US only, no key.
//   --source=mapbox    Mapbox Terrain-DEM v1 tiles, about 10 m data. The raw tile endpoint was rate limited (HTTP 429) for our token.
//   --source=openmeteo Open-Meteo elevation API (Copernicus DEM, about 90 m grid), every 40 m. Too coarse for
//                      steep terrain: it gave a 67% max grade on the hilly route.
// Run: node --env-file=.env.local scripts/fetch-elevation.ts [--refresh] [--route=hilly] [--source=openmeteo]
// build-routepoints.ts interpolates to 10 m and smooths.
import { cached, routeFilter } from "./lib/cache.ts";
import { readDirections } from "./lib/directions.ts";
import { mapboxToken, openMeteoElevationUrl } from "./lib/env.ts";
import { resample } from "./lib/geo.ts";
import { fetchJson, sleep } from "./lib/http.ts";
import { TerrainSampler } from "./lib/terrain.ts";
import { ROUTES } from "./routes.config.ts";

const BATCH = 100; // Open-Meteo allows up to 100 coordinates per request
const requested = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
const source = requested ?? "usgs";

for (const route of ROUTES) {
  if (routeFilter() && routeFilter() !== route.id) continue;
  const { data, fromCache } = await cached("elevation", route.id, async () => {
    const coords = readDirections(route.id).geometry.coordinates;
    if (source === "usgs") {
      const stepM = 20;
      const pts = resample(coords, stepM);
      const elevations: number[] = new Array(pts.length);
      let next = 0;
      const worker = async () => {
        while (next < pts.length) {
          const i = next++;
          const url = `https://epqs.nationalmap.gov/v1/json?x=${pts[i].lon.toFixed(6)}&y=${pts[i].lat.toFixed(6)}&wkid=4326&units=Meters&includeDate=false`;
          const res = await fetchJson<{ value: string | number }>(url, { retries: 4, backoffMs: 1500, timeoutMs: 30000 });
          const v = Number(res.value);
          if (!Number.isFinite(v) || v < -1000) throw new Error(`USGS returned no elevation for point ${i} (${res.value})`);
          elevations[i] = v;
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker)); // 4 requests at a time
      return {
        routeId: route.id,
        source: "USGS 3DEP Elevation Point Query Service (lidar-derived DEM, 1 m resolution in Austin)",
        stepM,
        samples: pts.map((p, i) => ({ lat: p.lat, lon: p.lon, s: p.s, elevation: +elevations[i].toFixed(2) })),
      };
    }
    if (source === "mapbox") {
      const stepM = 10;
      const pts = resample(coords, stepM);
      const sampler = new TerrainSampler(mapboxToken());
      const samples = [];
      for (const p of pts) samples.push({ lat: p.lat, lon: p.lon, s: p.s, elevation: +(await sampler.elevation(p.lon, p.lat)).toFixed(2) });
      return { routeId: route.id, source: "Mapbox Terrain-DEM v1 (about 10 m source data, zoom 14 tiles)", stepM, samples };
    }
    const stepM = 40;
    const pts = resample(coords, stepM);
    const elevations: number[] = [];
    for (let i = 0; i < pts.length; i += BATCH) {
      const chunk = pts.slice(i, i + BATCH);
      const url =
        `${openMeteoElevationUrl()}?latitude=${chunk.map((p) => p.lat.toFixed(6)).join(",")}` +
        `&longitude=${chunk.map((p) => p.lon.toFixed(6)).join(",")}`;
      const res = await fetchJson<{ elevation: number[] }>(url);
      elevations.push(...res.elevation);
      await sleep(300);
    }
    return {
      routeId: route.id,
      source: "Open-Meteo elevation API (Copernicus DEM, about 90 m grid)",
      stepM,
      samples: pts.map((p, i) => ({ lat: p.lat, lon: p.lon, s: p.s, elevation: elevations[i] })),
    };
  });
  const el = data.samples.map((s) => s.elevation);
  console.log(
    `${route.id}${fromCache ? " (cached)" : ""} [${data.source.split(" ")[0]}]: ${data.samples.length} samples, ` +
      `elevation ${Math.min(...el).toFixed(0)} to ${Math.max(...el).toFixed(0)} m`,
  );
}
