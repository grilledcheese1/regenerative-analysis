import type mapboxgl from "mapbox-gl";
import type * as GeoJSON from "geojson";
import type { Trip, TripSample } from "@/lib/trip/types";
import { bandColor, captureBand } from "./capture";
import { TRIP_CONFIG, type MapTheme } from "./config";

export const IDS = {
  dem: "trip-dem",
  hillshade: "trip-hillshade",
  contourSrc: "trip-contours",
  contour: "trip-contour-lines",
  buildings: "trip-3d-buildings",
  route: "trip-route",
  routeSrc: "trip-route-src",
  glow: "trip-route-glow",
  missedSrc: "trip-missed-src",
  missed: "trip-missed",
  stopsSrc: "trip-stops-src",
  stops: "trip-stops",
  currentSrc: "trip-current-src",
  current: "trip-current",
} as const;

type Expression = mapboxgl.ExpressionSpecification;

const emptyFC = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Cumulative route distance (m) per sample, using a local flat-earth approximation. */
function cumulativeDistance(samples: TripSample[]): number[] {
  const out = [0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dy = (b.lat - a.lat) * 111320;
    const dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
}

/** Hard-edged per-segment colors for `line-gradient`, keyed on `line-progress`. */
export function buildGradient(samples: TripSample[], root?: HTMLElement): Expression {
  const neutral = bandColor("neutral", root);
  const d = cumulativeDistance(samples);
  const total = d[d.length - 1];
  const EPS = 1e-6;
  const stops: [number, string][] = [];
  let last = -1;
  if (total > 0) {
    for (let i = 0; i < samples.length - 1; i++) {
      const p0 = d[i] / total;
      const p1 = d[i + 1] / total;
      const start = Math.max(p0, last + EPS);
      const end = p1 - EPS;
      if (end <= start) continue; // zero-length segment (car stationary)
      const color = bandColor(captureBand(samples[i]), root);
      stops.push([start, color], [end, color]);
      last = end;
    }
  }
  if (stops.length === 0) return ["literal", neutral] as unknown as Expression;
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    ...stops.flat(),
  ] as unknown as Expression;
}

export function routeFeature(trip: Trip): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: trip.samples.map((s) => [s.lon, s.lat]) },
  };
}

export function missedFeatures(trip: Trip): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: trip.samples
      .filter((s) => s.missed !== null)
      .map((s) => ({
        type: "Feature",
        properties: { cause: s.missed, t: s.t, speed: s.speed, grade: s.grade },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      })),
  };
}

/** One marker per stop: the first sample of each run of near-zero speed. */
export function stopFeatures(trip: Trip): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  let prevStopped = false;
  for (const s of trip.samples) {
    const stopped = s.speed < TRIP_CONFIG.stopSpeedMs;
    if (stopped && !prevStopped) {
      features.push({
        type: "Feature",
        properties: { t: s.t },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      });
    }
    prevStopped = stopped;
  }
  return { type: "FeatureCollection", features };
}

export function currentFeature(trip: Trip | null | undefined, index: number): GeoJSON.FeatureCollection {
  const s = trip?.samples[Math.min(Math.max(index, 0), (trip?.samples.length ?? 1) - 1)];
  if (!s) return emptyFC();
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }],
  };
}

function removeIfPresent(map: mapboxgl.Map, layers: string[], sources: string[]) {
  for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of sources) if (map.getSource(id)) map.removeSource(id);
}

/** Idempotent: safe to call after every `style.load` and whenever the trip changes. */
export function addTripLayers(
  map: mapboxgl.Map,
  trip: Trip | null | undefined,
  theme: MapTheme,
  currentIndex: number,
) {
  // Mapbox refuses to remove a DEM source that terrain still references.
  map.setTerrain(null);
  removeIfPresent(
    map,
    [IDS.current, IDS.stops, IDS.missed, IDS.route, IDS.glow, IDS.buildings, IDS.contour, IDS.hillshade],
    [IDS.currentSrc, IDS.stopsSrc, IDS.missedSrc, IDS.routeSrc, IDS.contourSrc, IDS.dem],
  );

  const colors = TRIP_CONFIG.themeColors[theme];
  const firstSymbol = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;

  // Terrain, hillshade, contours
  map.addSource(IDS.dem, {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14,
  });
  map.setTerrain({ source: IDS.dem, exaggeration: TRIP_CONFIG.terrain.exaggeration });
  map.addLayer(
    {
      id: IDS.hillshade,
      type: "hillshade",
      source: IDS.dem,
      paint: {
        "hillshade-exaggeration": TRIP_CONFIG.hillshade.exaggeration,
        "hillshade-shadow-color": colors.hillshade,
      },
    },
    firstSymbol,
  );
  map.addSource(IDS.contourSrc, { type: "vector", url: "mapbox://mapbox.mapbox-terrain-v2" });
  map.addLayer(
    {
      id: IDS.contour,
      type: "line",
      source: IDS.contourSrc,
      "source-layer": "contour",
      minzoom: TRIP_CONFIG.contours.minzoom,
      paint: {
        "line-color": colors.contour,
        "line-width": TRIP_CONFIG.contours.width,
        "line-opacity": TRIP_CONFIG.contours.opacity,
      },
    },
    firstSymbol,
  );

  // 3D buildings (the base styles ship a `composite` source with building data)
  if (map.getSource("composite")) {
    map.addLayer(
      {
        id: IDS.buildings,
        type: "fill-extrusion",
        source: "composite",
        "source-layer": "building",
        minzoom: TRIP_CONFIG.buildings.minzoom,
        filter: ["==", ["get", "extrude"], "true"],
        paint: {
          "fill-extrusion-color": colors.building,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": TRIP_CONFIG.buildings.opacity,
        },
      },
      firstSymbol,
    );
  }

  if (!trip || trip.samples.length < 2) return;

  // Route: blurred glow underneath, crisp gradient line on top
  map.addSource(IDS.routeSrc, { type: "geojson", data: routeFeature(trip), lineMetrics: true });
  const gradient = buildGradient(trip.samples);
  const line = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer({
    id: IDS.glow,
    type: "line",
    source: IDS.routeSrc,
    layout: line,
    paint: {
      "line-gradient": gradient,
      "line-width": TRIP_CONFIG.line.glowWidth,
      "line-blur": TRIP_CONFIG.line.glowBlur,
      "line-opacity": TRIP_CONFIG.line.glowOpacity,
    },
  });
  map.addLayer({
    id: IDS.route,
    type: "line",
    source: IDS.routeSrc,
    layout: line,
    paint: { "line-gradient": gradient, "line-width": TRIP_CONFIG.line.width },
  });

  // Markers
  map.addSource(IDS.stopsSrc, { type: "geojson", data: stopFeatures(trip) });
  map.addLayer({
    id: IDS.stops,
    type: "circle",
    source: IDS.stopsSrc,
    paint: {
      "circle-radius": TRIP_CONFIG.markers.stopRadius,
      "circle-color": bandColor("neutral"),
      "circle-stroke-width": 1.5,
      "circle-stroke-color": colors.marker,
    },
  });
  map.addSource(IDS.missedSrc, { type: "geojson", data: missedFeatures(trip) });
  map.addLayer({
    id: IDS.missed,
    type: "circle",
    source: IDS.missedSrc,
    paint: {
      "circle-radius": TRIP_CONFIG.markers.missedRadius,
      "circle-color": bandColor("bad"),
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.marker,
    },
  });

  // Replay marker
  map.addSource(IDS.currentSrc, { type: "geojson", data: currentFeature(trip, currentIndex) });
  map.addLayer({
    id: IDS.current,
    type: "circle",
    source: IDS.currentSrc,
    paint: {
      "circle-radius": TRIP_CONFIG.markers.currentRadius,
      "circle-color": colors.marker,
      "circle-stroke-width": 3,
      "circle-stroke-color": bandColor("good"),
      "circle-pitch-alignment": "map",
    },
  });
}
