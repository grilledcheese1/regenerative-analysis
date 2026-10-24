// Stream 2 data pipeline: turns real roads, terrain and weather into route files the simulator can drive.
//
//   node scripts/fetch-routes.mjs           reuses saved responses in data/cache when they exist
//   node scripts/fetch-routes.mjs --fresh   downloads everything again
//
// Writes data/cache/routes/<routeId>.json in the simulator's DemoRoute shape
// (name, stepM, points[{ s, lat, lon, elevationM, limitMs }], stopsM) plus extra fields:
// surface, road class and street name per point, weather, a suggested road condition, and data sources.
// Routing uses Mapbox Directions when NEXT_PUBLIC_MAPBOX_TOKEN is set, otherwise the free OSRM router.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CITY, DATA_CONFIG as C, ROUTES } from "./data.config.mjs";

for (const file of [".env", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);

const CACHE_DIR = path.join("data", "cache");
const ROUTES_DIR = path.join(CACHE_DIR, "routes");
const FRESH = process.argv.includes("--fresh");
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const ELEVATION_URL = process.env.OPEN_METEO_ELEVATION_URL || "https://api.open-meteo.com/v1/elevation";
const WEATHER_URL = (process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com") + "/v1/forecast";
const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const USER_AGENT = "regenerative-analysis-hackathon/0.1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// Fetch once, then reuse the saved JSON so the demo never depends on the network.
async function cached(name, download) {
  const file = path.join(CACHE_DIR, name);
  if (!FRESH && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  console.log(`  downloading ${name}`);
  const data = await download();
  writeFileSync(file, JSON.stringify(data));
  await sleep(C.requestDelayMs);
  return data;
}

async function getJson(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...init.headers } });
    if (res.ok) return res.json();
    if (attempt >= 3 || res.status < 429) throw new Error(`${res.status} ${res.statusText} from ${url.split("?")[0]}`);
    await sleep(3000 * attempt);
  }
}

// ---------- Geometry ([lon, lat] pairs, like GeoJSON) ----------

const rad = (d) => (d * Math.PI) / 180;

function distanceM(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Walk along the line and drop a point every `spacing` meters.
function resample(line, spacing) {
  const out = [{ lonlat: line[0], s: 0, segment: 0 }];
  let travelled = 0;
  let nextAt = spacing;
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const len = distanceM(a, b);
    while (len > 0 && nextAt <= travelled + len) {
      const f = (nextAt - travelled) / len;
      out.push({ lonlat: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], s: nextAt, segment: i });
      nextAt += spacing;
    }
    travelled += len;
  }
  return out; // the last partial step is dropped so every point is exactly `spacing` apart
}

// Distance from point p to segment a-b in meters (flat-earth approximation, fine at city scale).
function pointToSegmentM(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320;
  const ky = 110540;
  const [ax, ay] = [(a[0] - p[0]) * kx, (a[1] - p[1]) * ky];
  const [dx, dy] = [(b[0] - p[0]) * kx - ax, (b[1] - p[1]) * ky - ay];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function movingAverage(values, window) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++, n++) sum += values[j];
    return sum / n;
  });
}

// ---------- Directions ----------

async function fetchDirections(r) {
  const pair = `${r.start.lon},${r.start.lat};${r.end.lon},${r.end.lat}`;
  if (MAPBOX_TOKEN) {
    const json = await getJson(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${pair}?geometries=geojson&overview=full&annotations=maxspeed,distance&access_token=${MAPBOX_TOKEN}`,
    );
    const route = json.routes[0];
    const maxspeed = route.legs.flatMap((leg) => leg.annotation?.maxspeed ?? []);
    return {
      source: "Mapbox Directions API",
      coordinates: route.geometry.coordinates,
      segmentMaxSpeedMps: maxspeed.map((m) =>
        m.unknown || m.none || !m.speed ? null : m.unit === "mph" ? m.speed * 0.44704 : m.speed / 3.6,
      ),
    };
  }
  const json = await getJson(`https://router.project-osrm.org/route/v1/driving/${pair}?overview=full&geometries=geojson`);
  return { source: "OSRM (OpenStreetMap routing)", coordinates: json.routes[0].geometry.coordinates, segmentMaxSpeedMps: [] };
}

// ---------- Elevation (Open-Meteo, no key) ----------

async function fetchElevation(points) {
  const out = [];
  for (let i = 0; i < points.length; i += C.elevationBatchSize) {
    const batch = points.slice(i, i + C.elevationBatchSize);
    const lat = batch.map((p) => p[1].toFixed(5)).join(",");
    const lon = batch.map((p) => p[0].toFixed(5)).join(",");
    const json = await getJson(`${ELEVATION_URL}?latitude=${lat}&longitude=${lon}`);
    out.push(...json.elevation);
    await sleep(C.requestDelayMs);
  }
  return out;
}

// ---------- Roads, surfaces and stops (Overpass / OpenStreetMap, no key) ----------

async function fetchOverpass(points) {
  const pad = 0.002;
  const lats = points.map((p) => p[1]);
  const lons = points.map((p) => p[0]);
  const bbox = `${Math.min(...lats) - pad},${Math.min(...lons) - pad},${Math.max(...lats) + pad},${Math.max(...lons) + pad}`;
  const query = `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${bbox});
  node["highway"~"^(traffic_signals|stop)$"](${bbox});
);
out geom;`;
  return getJson(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
}

function parseMaxspeed(tag) {
  const m = tag?.match(/([\d.]+)\s*(mph)?/);
  if (!m) return null;
  return m[2] ? Number(m[1]) * 0.44704 : Number(m[1]) / 3.6;
}

// Nearest OpenStreetMap road for each point, using a coarse grid so it stays fast.
function matchRoads(points, ways) {
  const cell = 0.001;
  const grid = new Map();
  for (const way of ways) {
    const g = way.geometry ?? [];
    for (let i = 0; i < g.length - 1; i++) {
      const seg = { a: [g[i].lon, g[i].lat], b: [g[i + 1].lon, g[i + 1].lat], tags: way.tags ?? {} };
      const k = `${Math.floor((seg.a[0] + seg.b[0]) / 2 / cell)}:${Math.floor((seg.a[1] + seg.b[1]) / 2 / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(seg);
    }
  }
  return points.map((p) => {
    const [cx, cy] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell)];
    let best = null;
    let bestD = C.roadSnapDistanceM;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const seg of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = pointToSegmentM(p, seg.a, seg.b);
          if (d < bestD) [bestD, best] = [d, seg.tags];
        }
    return best;
  });
}

// Map OpenStreetMap surface tags onto the contract's RoutePoint surface values.
function surfaceOf(tag) {
  if (!tag || C.pavedSurfaces.includes(tag)) return tag ? "asphalt" : "unknown";
  if (C.gravelSurfaces.includes(tag)) return "gravel";
  if (C.dirtSurfaces.includes(tag)) return "dirt";
  return "unknown";
}

// ---------- Weather (Open-Meteo, no key) ----------

async function fetchWeather([lon, lat]) {
  const json = await getJson(
    `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=precipitation,snowfall&past_days=1&forecast_days=1&timezone=UTC`,
  );
  let rain = 0;
  let snow = 0;
  json.hourly.time.forEach((t, i) => {
    const age = Date.now() - Date.parse(t + "Z");
    if (age >= 0 && age <= 24 * 3600 * 1000) {
      rain += json.hourly.precipitation[i] ?? 0;
      snow += json.hourly.snowfall[i] ?? 0;
    }
  });
  return {
    temperatureC: json.current.temperature_2m,
    precipitationLast24hMm: round(rain, 1),
    snowfallLast24hCm: round(snow, 1),
    fetchedAt: new Date().toISOString(),
  };
}

// Pick the road condition that matches today's real weather, with a reason the UI can show.
function suggestCondition(w) {
  if (w.snowfallLast24hCm >= C.snowAfterSnowCm)
    return { condition: "snow", reason: `${w.snowfallLast24hCm} cm of snow fell in the last 24 hours` };
  if (w.temperatureC < 0) return { condition: "snow", reason: `It is ${w.temperatureC}°C, below freezing` };
  if (w.precipitationLast24hMm >= C.wetAfterRainMm)
    return { condition: "wet", reason: `${w.precipitationLast24hMm} mm of rain fell in the last 24 hours` };
  return { condition: "dry", reason: `No rain in the last 24 hours and ${w.temperatureC}°C` };
}

// ---------- Build one route ----------

async function buildRoute(r) {
  console.log(`\n${r.routeId}: ${r.name}`);
  const directions = await cached(`${r.routeId}.directions.json`, () => fetchDirections(r));
  const samples = resample(directions.coordinates, C.stepM);
  const lonlats = samples.map((s) => s.lonlat);

  const elevation = movingAverage(
    await cached(`${r.routeId}.elevation.json`, () => fetchElevation(lonlats)),
    C.elevationSmoothingPoints,
  );
  const osm = await cached(`${r.routeId}.overpass.json`, () => fetchOverpass(lonlats));
  const roadTags = matchRoads(lonlats, osm.elements.filter((e) => e.type === "way"));
  const weather = await cached(`${r.routeId}.weather.json`, () => fetchWeather(lonlats[Math.floor(lonlats.length / 2)]));

  const points = samples.map((s, i) => {
    const tags = roadTags[i] ?? {};
    const roadClass = tags.highway ?? "unknown";
    const limitMs =
      directions.segmentMaxSpeedMps[s.segment] ??
      parseMaxspeed(tags.maxspeed) ??
      C.speedByRoadClass[roadClass.replace("_link", "")] ??
      C.defaultSpeedLimitMs;
    return {
      s: s.s,
      lat: round(s.lonlat[1], 6),
      lon: round(s.lonlat[0], 6),
      elevationM: round(elevation[i], 1),
      limitMs: round(limitMs, 1),
      surface: surfaceOf(tags.surface),
      roadClass,
      street: tags.name ?? tags.ref ?? null,
    };
  });

  // Snap traffic signals and stop signs to the nearest point, merging ones at the same intersection.
  const hits = osm.elements
    .filter((e) => e.type === "node")
    .map((node) => {
      let best = -1;
      let bestD = C.stopSnapDistanceM;
      points.forEach((p, i) => {
        const d = distanceM([node.lon, node.lat], [p.lon, p.lat]);
        if (d < bestD) [bestD, best] = [d, i];
      });
      return { i: best, kind: node.tags?.highway };
    })
    .filter((h) => h.i > 0)
    .sort((a, b) => a.i - b.i);
  const stops = [];
  for (const h of hits) {
    if (stops.length && points[h.i].s - stops[stops.length - 1].s < C.minStopSpacingM) continue;
    stops.push({ s: points[h.i].s, kind: h.kind === "stop" ? "stop sign" : "traffic signal" });
  }

  // The simulator stops at every entry in stopsM and ends at the last one.
  let signals = 0;
  const lengthM = points[points.length - 1].s;
  const stopsM = stops
    .filter((st) => st.kind === "stop sign" || signals++ % C.redLightEvery === 0)
    .map((st) => st.s)
    .filter((s) => s < lengthM - C.minStopSpacingM);
  stopsM.push(lengthM);

  const route = {
    routeId: r.routeId,
    name: `${r.name} (${CITY})`,
    terrain: r.terrain,
    stepM: C.stepM,
    points,
    stopsM,
    allStops: stops, // every signal and stop sign on the route, including green lights
    weather,
    suggestedCondition: suggestCondition(weather),
    source: `${directions.source}; elevation and weather from Open-Meteo; roads and stops from OpenStreetMap`,
  };

  let climb = 0;
  for (let i = 1; i < points.length; i++) climb += Math.max(0, points[i].elevationM - points[i - 1].elevationM);
  console.log(
    `  ${(lengthM / 1000).toFixed(1)} km, ${points.length} points, ${stops.length} signals and stop signs ` +
      `(${stopsM.length - 1} stops driven), ${Math.round(climb)} m climb, ${weather.temperatureC}°C, ` +
      `${weather.precipitationLast24hMm} mm rain in 24 h`,
  );
  return route;
}

mkdirSync(ROUTES_DIR, { recursive: true });
console.log(MAPBOX_TOKEN ? "Using Mapbox Directions." : "No NEXT_PUBLIC_MAPBOX_TOKEN found, using the free OSRM router.");
const index = [];
for (const r of ROUTES) {
  const route = await buildRoute(r);
  writeFileSync(path.join(ROUTES_DIR, `${r.routeId}.json`), JSON.stringify(route));
  index.push({
    routeId: r.routeId,
    name: route.name,
    terrain: r.terrain,
    distanceM: route.points.at(-1).s,
    stops: route.stopsM.length - 1,
    suggestedCondition: route.suggestedCondition,
  });
}
writeFileSync(path.join(ROUTES_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log("\nDone. Route files are in data/cache/routes/.");
