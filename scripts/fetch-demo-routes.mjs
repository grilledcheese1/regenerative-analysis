// Fetch and cache the demo routes: Mapbox Directions (road geometry, speed limits),
// Open-Meteo (elevation) and Overpass (signals, stop signs). Run once with
// `node scripts/fetch-demo-routes.mjs`; the app only reads the cached JSON.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "src/data/routes.json";
const STEP_M = 10;
const MPH = 0.44704;
const UA = "RegenCoach/0.1 (HackTX demo)";

const ROUTES = [
  {
    id: "hills",
    name: "Mount Bonnell to Deep Eddy",
    kind: "hilly",
    waypoints: [
      [-97.7735, 30.3207],
      [-97.772, 30.2785],
    ],
  },
  {
    id: "downtown",
    name: "Downtown grid",
    kind: "flat city",
    waypoints: [
      [-97.7404, 30.273],
      [-97.7505, 30.2672],
      [-97.7385, 30.2585],
    ],
  },
  {
    id: "mixed",
    name: "UT Tower to South Congress",
    kind: "mixed",
    waypoints: [
      [-97.7394, 30.2862],
      [-97.7497, 30.249],
    ],
  },
];

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    try {
      const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
      const v = line?.slice(name.length + 1).trim();
      if (v) return v;
    } catch {}
  }
  return "";
}

const token = loadEnv("NEXT_PUBLIC_MAPBOX_TOKEN");
const elevationUrl = loadEnv("OPEN_METEO_ELEVATION_URL") || "https://api.open-meteo.com/v1/elevation";
const overpassUrls = [
  loadEnv("OVERPASS_URL") || "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
if (!token) throw new Error("NEXT_PUBLIC_MAPBOX_TOKEN is not set");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = (d) => (d * Math.PI) / 180;

function haversine([lon1, lat1], [lon2, lat2]) {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function limitMs(ann) {
  if (!ann || ann.unknown || ann.none || !ann.speed) return null;
  return ann.unit === "km/h" ? ann.speed / 3.6 : ann.speed * MPH;
}

async function directions(waypoints) {
  const coords = waypoints.map((c) => c.join(",")).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&steps=true&annotations=maxspeed,distance&access_token=${token}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== "Ok") throw new Error(`Directions failed: ${json.message ?? json.code}`);
  return json.routes[0];
}

/** Resample the road geometry to a point every STEP_M meters, carrying the speed limit along. */
function resample(route) {
  const coords = route.geometry.coordinates;
  const speeds = route.legs.flatMap((l) => l.annotation.maxspeed.map(limitMs));
  const known = speeds.filter(Boolean);
  const fallback = known.length ? known.reduce((a, b) => a + b) / known.length : 35 * MPH;

  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const length = cum[cum.length - 1];

  const points = [];
  let j = 0;
  for (let s = 0; s <= length; s += STEP_M) {
    while (j < coords.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const [lon0, lat0] = coords[j];
    const [lon1, lat1] = coords[j + 1];
    points.push({
      s,
      lat: +(lat0 + f * (lat1 - lat0)).toFixed(6),
      lon: +(lon0 + f * (lon1 - lon0)).toFixed(6),
      elevationM: 0,
      limitMs: +(speeds[j] ?? fallback).toFixed(2),
    });
  }
  return { points, cum, coords, length };
}

async function fetchRetry(url, label) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (res.status !== 429) throw new Error(`${label} failed: HTTP ${res.status}`);
    console.warn(`  ${label} rate limited, waiting ${10 * (attempt + 1)}s`);
    await sleep(10000 * (attempt + 1));
  }
  throw new Error(`${label} failed: still rate limited`);
}

/**
 * Open-Meteo's DEM is ~90 m, so sample it every ELEV_EVERY points (50 m), interpolate
 * the points in between, then smooth so grade doesn't jump at DEM cell edges.
 */
const ELEV_EVERY = 5;
async function addElevation(points) {
  const idx = points.map((_, i) => i).filter((i) => i % ELEV_EVERY === 0 || i === points.length - 1);
  const raw = [];
  for (let i = 0; i < idx.length; i += 100) {
    const batch = idx.slice(i, i + 100).map((k) => points[k]);
    const url =
      `${elevationUrl}?latitude=${batch.map((p) => p.lat).join(",")}` +
      `&longitude=${batch.map((p) => p.lon).join(",")}`;
    raw.push(...(await fetchRetry(url, "elevation")).elevation);
    await sleep(1000);
  }

  const dense = points.map((_, i) => {
    const k = idx.findIndex((x) => x >= i);
    if (idx[k] === i) return raw[k];
    const f = (i - idx[k - 1]) / (idx[k] - idx[k - 1]);
    return raw[k - 1] + f * (raw[k] - raw[k - 1]);
  });
  const w = 6;
  points.forEach((p, i) => {
    const win = dense.slice(Math.max(0, i - w), i + w + 1);
    p.elevationM = +(win.reduce((a, b) => a + b) / win.length).toFixed(2);
  });
}

async function overpassStops(points) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bbox = [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)]
    .map((v, i) => (i < 2 ? v - 0.002 : v + 0.002))
    .join(",");
  const query = `[out:json][timeout:25];(node(${bbox})[highway=traffic_signals];node(${bbox})[highway=stop];);out;`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const url = overpassUrls[attempt % overpassUrls.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) return (await res.json()).elements.map((e) => [e.lon, e.lat]);
      console.warn(`  overpass ${url} -> HTTP ${res.status}`);
    } catch (e) {
      console.warn(`  overpass ${url} -> ${e.message}`);
    }
    await sleep(3000 * (attempt + 1));
  }
  return null;
}

/** Snap stop nodes to the nearest route point; keep those within 20 m of the road. */
function snapStops(nodes, points) {
  const out = [];
  for (const n of nodes) {
    let best = Infinity;
    let bestS = 0;
    for (const p of points) {
      const d = haversine(n, [p.lon, p.lat]);
      if (d < best) [best, bestS] = [d, p.s];
    }
    if (best <= 20) out.push(bestS);
  }
  return out;
}

/** Fallback when Overpass is down: treat each turn in the directions as a slow-down point. */
function maneuverStops(route, points) {
  const turns = route.legs
    .flatMap((l) => l.steps)
    .filter((st) => ["turn", "end of road", "fork", "roundabout"].includes(st.maneuver.type))
    .map((st) => st.maneuver.location);
  return snapStops(turns, points);
}

function tidyStops(stopsM, length) {
  const sorted = [...stopsM].filter((s) => s > 80 && s < length - 80).sort((a, b) => a - b);
  const out = [];
  for (const s of sorted) if (!out.length || s - out[out.length - 1] > 60) out.push(s);
  out.push(Math.floor(length / STEP_M) * STEP_M);
  return out;
}

const cached = [];
for (const r of ROUTES) {
  console.log(`${r.id}: directions`);
  const dir = await directions(r.waypoints);
  const { points, length } = resample(dir);
  console.log(`${r.id}: ${(length / 1000).toFixed(2)} km, ${points.length} points, elevation`);
  await addElevation(points);

  console.log(`${r.id}: stops`);
  const nodes = await overpassStops(points);
  const stopSource = nodes ? "openstreetmap" : "directions-maneuvers";
  const stopsM = tidyStops(nodes ? snapStops(nodes, points) : maneuverStops(dir, points), length);
  console.log(`${r.id}: ${stopsM.length} stops from ${stopSource}`);

  cached.push({
    id: r.id,
    name: r.name,
    kind: r.kind,
    stepM: STEP_M,
    sources: { geometry: "mapbox-directions", elevation: "open-meteo", stops: stopSource },
    fetchedAt: new Date().toISOString(),
    points,
    stopsM,
  });
  await sleep(1000);
}

mkdirSync("src/data", { recursive: true });
writeFileSync(OUT, JSON.stringify(cached));
console.log(`wrote ${OUT}`);
