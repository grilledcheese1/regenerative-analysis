// Turns cached Directions, elevation and Overpass data into RoutePoint[] about every 10 m, and prints
// sanity numbers plus road and terrain checks. Run: node scripts/build-routepoints.ts [--route=hilly] [--smooth=50]
import { cachePath, readJson, routeFilter, writeJson } from "./lib/cache.ts";
import { readDirections } from "./lib/directions.ts";
import { cumulative, interpolate, movingAverage, projectToPolyline, resample, segmentAt, type LonLat } from "./lib/geo.ts";
import type { RoutePoint } from "../src/lib/physics/types.ts";
import { ROUTES } from "./routes.config.ts";

const STEP_M = 10;
const SMOOTH_M = Number(process.argv.find((a) => a.startsWith("--smooth="))?.slice(9) ?? 50);
const STOP_NEAR_M = 20; // a signal or stop sign within this distance of the route counts
const STOP_MERGE_M = 40;
const WAY_NEAR_M = 15;
const MIN_STOPS = 4;
const MIN_HILLY_RELIEF_M = 30;

interface OsmElement {
  type: "node" | "way";
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const GRAVEL = new Set(["unpaved", "gravel", "fine_gravel", "compacted", "pebblestone"]);
const DIRT = new Set(["dirt", "ground", "earth", "grass", "sand", "mud", "soil"]);
const PAVED = new Set(["asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "sett", "cobblestone", "brick", "metal", "wood"]);

function surfaceFromTag(tag: string | undefined): { surface: NonNullable<RoutePoint["surface"]>; known: boolean } {
  if (tag && GRAVEL.has(tag)) return { surface: "gravel", known: true };
  if (tag && DIRT.has(tag)) return { surface: "dirt", known: true };
  if (tag && PAVED.has(tag)) return { surface: "asphalt", known: true };
  return { surface: "asphalt", known: false }; // missing or unmatched counts as asphalt
}

function speedMs(a?: { speed?: number; unit?: string; unknown?: boolean; none?: boolean }): number | undefined {
  if (!a || a.unknown || a.none || typeof a.speed !== "number") return undefined;
  return a.unit === "mph" ? a.speed * 0.44704 : a.speed / 3.6; // Mapbox uses km/h unless it says mph
}

/** Distance (m) from p to a way's geometry, in a local metric frame. */
function distToWay(p: LonLat, geom: { lat: number; lon: number }[]): number {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const ax = (geom[i].lon - p[0]) * kx, ay = (geom[i].lat - p[1]) * 111320;
    const bx = (geom[i + 1].lon - p[0]) * kx, by = (geom[i + 1].lat - p[1]) * 111320;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

for (const route of ROUTES) {
  if (routeFilter() && routeFilter() !== route.id) continue;
  const dir = readDirections(route.id);
  const coords = dir.geometry.coordinates;
  const cum = cumulative(coords);
  const pts = resample(coords, STEP_M);

  // Resampling follows the Directions polyline exactly; check how far any point drifts from it.
  let maxDeviationM = 0;
  for (const p of pts) maxDeviationM = Math.max(maxDeviationM, projectToPolyline([p.lon, p.lat], coords, cum).distM);

  // OSM: stops and ways.
  const osm = readJson<{ elements: OsmElement[] }>(cachePath("overpass", route.id)).elements;
  const stopNodes = osm.filter((e) => e.type === "node" && (e.tags?.highway === "traffic_signals" || e.tags?.highway === "stop") && e.lat !== undefined);
  const stopS: number[] = [];
  for (const n of stopNodes) {
    const pr = projectToPolyline([n.lon!, n.lat!], coords, cum);
    if (pr.distM <= STOP_NEAR_M && pr.s > 30 && pr.s < cum[cum.length - 1] - 30) stopS.push(pr.s);
  }
  stopS.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const s of stopS) if (merged.length === 0 || s - merged[merged.length - 1] >= STOP_MERGE_M) merged.push(s);
  const stopIdx = new Set(merged.map((s) => Math.round(s / STEP_M)));
  stopIdx.add(pts.length - 1); // the final point is always a stop

  const ways = osm.filter((e) => e.type === "way" && e.geometry && e.geometry.length > 1);
  const bboxes = ways.map((w) => {
    const lats = w.geometry!.map((g) => g.lat), lons = w.geometry!.map((g) => g.lon);
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  });
  const margin = 0.0002; // about 22 m

  // For every point: the nearest drivable OSM way within WAY_NEAR_M (surface, bridge and tunnel tags).
  const nearest = pts.map((p) => {
    let bestD = Infinity, tags: Record<string, string> | undefined;
    ways.forEach((w, wi) => {
      const b = bboxes[wi];
      if (p.lat < b.minLat - margin || p.lat > b.maxLat + margin || p.lon < b.minLon - margin || p.lon > b.maxLon + margin) return;
      const d = distToWay([p.lon, p.lat], w.geometry!);
      if (d < bestD) { bestD = d; tags = w.tags; }
    });
    return { near: bestD <= WAY_NEAR_M, tags: bestD <= WAY_NEAR_M ? tags : undefined };
  });

  // Elevation: interpolate the ~40 m samples to 10 m, then smooth with a moving average.
  const el = readJson<{ source: string; samples: { s: number; elevation: number }[] }>(cachePath("elevation", route.id));
  const raw = pts.map((p) => interpolate(el.samples.map((s) => s.s), el.samples.map((s) => s.elevation), p.s));
  // A bare-earth DEM reads the ground or water under a bridge (or above a tunnel), not the road deck. Across each
  // OSM bridge or tunnel run, interpolate straight between the elevations just before and after it.
  const isStructure = nearest.map((n) => (n.tags?.bridge && n.tags.bridge !== "no") || (n.tags?.tunnel && n.tags.tunnel !== "no") ? true : false);
  let structurePoints = 0;
  for (let i = 0; i < raw.length; i++) {
    if (!isStructure[i]) continue;
    let j = i;
    while (j < raw.length && isStructure[j]) j++;
    const lo = Math.max(0, i - 1), hi = Math.min(raw.length - 1, j);
    for (let k = i; k < j; k++) raw[k] = raw[lo] + ((raw[hi] - raw[lo]) * (k - lo)) / Math.max(1, hi - lo);
    structurePoints += j - i;
    i = j;
  }
  const window = Math.max(1, Math.round(SMOOTH_M / STEP_M) | 1);
  const smooth = movingAverage(raw, window);
  let ascent = 0, descent = 0, maxGrade = 0, steep = 0;
  for (let i = 1; i < smooth.length; i++) {
    const d = smooth[i] - smooth[i - 1];
    if (d > 0) ascent += d; else descent -= d;
  }
  for (let i = 3; i < smooth.length - 3; i++) {
    const g = (100 * (smooth[i + 3] - smooth[i - 3])) / (6 * STEP_M);
    maxGrade = Math.max(maxGrade, Math.abs(g));
    if (Math.abs(g) > 12) steep++;
  }

  // Speed limits from the Directions maxspeed annotation (one value per geometry segment).
  const ann = dir.legs.flatMap((l) => l.annotation?.maxspeed ?? []);
  const segLimits = ann.map(speedMs);
  const annotationAligned = ann.length === coords.length - 1;

  const points: RoutePoint[] = [];
  const surfaceCounts: Record<string, number> = { asphalt: 0, gravel: 0, dirt: 0 };
  let unknownSurface = 0, onRoad = 0, limitKnown = 0;
  pts.forEach((p, i) => {
    const near = nearest[i].near;
    if (near) onRoad++;
    const { surface, known } = near ? surfaceFromTag(nearest[i].tags?.surface) : { surface: "asphalt" as const, known: false };
    if (!known) unknownSurface++;
    surfaceCounts[surface]++;
    const limit = segLimits[Math.min(segmentAt(cum, p.s), segLimits.length - 1)];
    if (limit !== undefined) limitKnown++;
    const point: RoutePoint = { lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), elevation: +smooth[i].toFixed(2), surface };
    if (limit !== undefined) point.speedLimit = +limit.toFixed(2);
    if (stopIdx.has(i)) point.stop = true;
    points.push(point);
  });

  const meta = {
    lengthM: Math.round(pts[pts.length - 1].s),
    directionsDistanceM: Math.round(dir.distance),
    ascentM: +ascent.toFixed(1),
    descentM: +descent.toFixed(1),
    reliefM: +(Math.max(...smooth) - Math.min(...smooth)).toFixed(1),
    stops: stopIdx.size,
    surfaceCounts,
    unknownSurfacePoints: unknownSurface,
    speedLimitKnownPct: +((100 * limitKnown) / pts.length).toFixed(1),
    onRoadPct: +((100 * onRoad) / pts.length).toFixed(1),
    maxDeviationFromRoadGeometryM: +maxDeviationM.toFixed(2),
    maxGradePct: +maxGrade.toFixed(1),
    stepsOver12PctGrade: steep,
    bridgeOrTunnelPointsFlattened: structurePoints,
    smoothingM: SMOOTH_M,
    annotationAligned,
    elevationSource: el.source,
  };
  writeJson(cachePath("routes", route.id), { routeId: route.id, name: route.name, meta, points }, false);

  console.log(`\n${route.id}: ${route.name}`);
  console.log(`  length ${meta.lengthM} m (Directions ${meta.directionsDistanceM} m), ${points.length} points`);
  console.log(`  ascent ${meta.ascentM} m, descent ${meta.descentM} m, relief ${meta.reliefM} m, max grade ${meta.maxGradePct}% (${structurePoints} bridge/tunnel points interpolated)`);
  console.log(`  stops ${meta.stops}, surfaces ${JSON.stringify(surfaceCounts)}, unknown surface ${unknownSurface}`);
  console.log(`  speed limit known ${meta.speedLimitKnownPct}%, on a drivable OSM way ${meta.onRoadPct}%, max drift from road geometry ${meta.maxDeviationFromRoadGeometryM} m`);
  if (route.id === "hilly" && meta.reliefM < MIN_HILLY_RELIEF_M) console.warn(`  WARNING: hilly relief ${meta.reliefM} m is under ${MIN_HILLY_RELIEF_M} m`);
  if (meta.stops < MIN_STOPS) console.warn(`  WARNING: only ${meta.stops} stops (want at least ${MIN_STOPS})`);
  if (meta.onRoadPct < 95) console.warn(`  WARNING: only ${meta.onRoadPct}% of points are within ${WAY_NEAR_M} m of a drivable OSM way`);
  if (meta.maxGradePct > 20) console.warn(`  WARNING: max grade ${meta.maxGradePct}% is steeper than typical roads; elevation may be too coarse or noisy`);
  if (!annotationAligned) console.warn(`  WARNING: maxspeed annotation length ${ann.length} != ${coords.length - 1} segments`);
}
