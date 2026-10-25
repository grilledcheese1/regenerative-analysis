"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MissedEvent } from "@/lib/model/score";
import { GRADE_VAR, type Segment } from "@/lib/segments";
import { SURFACE_STYLE } from "@/components/ConditionsCard";
import type { SurfaceSegment } from "@/components/RouteSvg";
import { FREE_MAP_CONFIG as CFG, type MapTheme } from "./config";
import WeatherOverlay from "./WeatherOverlay";

/**
 * Interactive 3D map that needs no API key: MapLibre GL with OpenFreeMap streets and buildings
 * and free terrain tiles (Mapzen / AWS Open Data). Used by the dashboard, Drives and the story.
 */
interface FreeTripMapProps {
  theme?: MapTheme;
  segments: Segment[];
  surfaces: SurfaceSegment[];
  colorBy: "regen" | "surface";
  stops: [number, number][];
  missed: MissedEvent[];
  car: [number, number]; // [lon, lat]
  ahead: [number, number]; // a point a little further along, for the chase camera's heading
  follow: boolean;
  weather?: string;
  onSelectMissed: (e: MissedEvent) => void;
  onSelectSegment?: (index: number) => void; // any stretch of route was clicked (green, amber, red or idle)
  focus?: number; // 0..1, how close the car is to a braking zone; speeds up the orbit and tightens the camera
  /** Shown instead of the map where WebGL is unavailable (blocked, no GPU) or the page is driven by automation. */
  fallback?: ReactNode;
}

// The path gets thicker the more regen power a stretch recovers (route-by-surface features have no "kw" and stay at the base width).
const REGEN_WIDTH: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["coalesce", ["get", "kw"], 0], 0, CFG.line.width, 10, CFG.line.width + 3, 30, CFG.line.width + 6, 60, CFG.line.width + 9];

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// "var(--surf-gravel)" -> its current value, so MapLibre gets a real color
const resolve = (color: string) => {
  const name = color.match(/^var\((--[\w-]+)\)$/)?.[1];
  return name ? cssVar(name) : color;
};

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const point = (c: [number, number], props: object = {}): GeoJSON.Feature => ({
  type: "Feature",
  properties: { ...props },
  geometry: { type: "Point", coordinates: c },
});

function routeData(p: FreeTripMapProps): GeoJSON.FeatureCollection {
  if (p.colorBy === "surface") {
    return fc(
      p.surfaces.map((s) => ({
        type: "Feature",
        properties: { color: resolve(SURFACE_STYLE[s.kind].color), dashed: SURFACE_STYLE[s.kind].dash ? 1 : 0 },
        geometry: { type: "LineString", coordinates: s.coords },
      })),
    );
  }
  return fc(
    p.segments.map((s, i) => ({
      type: "Feature",
      properties: { color: cssVar(GRADE_VAR[s.grade]), dashed: 0, i, grade: s.grade, kw: Math.round(s.regenKw * 10) / 10 },
      geometry: { type: "LineString", coordinates: s.coords },
    })),
  );
}

// A GeoJSON source, or undefined while the map is still (re)building its style
const geo = (map: maplibregl.Map, id: string) => map.getSource(id) as maplibregl.GeoJSONSource | undefined;

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return Math.atan2(y, x) / r;
}

export default function FreeTripMap(props: FreeTripMapProps) {
  const { theme = "dark", car, ahead, follow, weather, focus = 0 } = props;
  const replay = props.focus !== undefined; // the story's replay owns the camera; the dashboard keeps its own behaviour
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const camBearing = useRef<number | null>(null);
  const orbit = useRef<{ deg: number; at: number } | null>(null); // the replay camera's angle around the car
  const cam = useRef<{ lon: number; lat: number; bearing: number; zoom: number; pitch: number } | null>(null); // the replay's smoothed camera
  const fit = useRef<maplibregl.LngLatBounds | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // Create the map (again when the theme changes, since the base style changes).
  useEffect(() => {
    if (!container.current) return;
    const p = latest.current;
    // Automated browsers and machines without WebGL get the fallback instead of a constructor that throws.
    let map: maplibregl.Map;
    try {
      if (navigator.webdriver) throw new Error("automated browser");
      map = new maplibregl.Map({
        container: container.current,
        style: CFG.styles[theme],
        center: p.car,
        zoom: CFG.camera.zoom,
        pitch: CFG.camera.pitch,
        bearing: CFG.camera.bearing,
        maxPitch: 80,
        attributionControl: { compact: true },
      });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a browser capability check
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      const dem = {
        type: "raster-dem" as const,
        tiles: [CFG.terrainTiles],
        encoding: "terrarium" as const,
        tileSize: 256,
        maxzoom: 15,
      };
      map.addSource("dem", { ...dem, attribution: CFG.terrainAttribution });
      map.addSource("shade", dem);
      const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: "hillshade",
          type: "hillshade",
          source: "shade",
          paint: { "hillshade-exaggeration": CFG.hillshade.exaggeration, "hillshade-shadow-color": "#000000" },
        },
        firstSymbol,
      );
      if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
      map.addLayer(
        {
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: CFG.buildings.minzoom,
          paint: {
            "fill-extrusion-color": theme === "dark" ? "#2a3138" : "#d9d9d9",
            "fill-extrusion-opacity": 0.85,
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], CFG.buildings.defaultHeightM],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          },
        },
        firstSymbol,
      );
      map.setTerrain({ source: "dem", exaggeration: CFG.terrain.exaggeration });

      const cur = latest.current;
      map.addSource("route", { type: "geojson", data: routeData(cur) });
      map.addSource("stops", { type: "geojson", data: fc(cur.stops.map((c) => point(c))) });
      map.addSource("missed", { type: "geojson", data: fc([]) });
      map.addSource("car", { type: "geojson", data: fc([point(cur.car)]) });
      const L = CFG.line;
      map.addLayer({ id: "route-glow", type: "line", source: "route",
        paint: { "line-color": ["get", "color"], "line-width": ["+", REGEN_WIDTH, L.glowExtra], "line-blur": L.glowBlur, "line-opacity": L.glowOpacity } });
      map.addLayer({ id: "route", type: "line", source: "route", filter: ["==", ["get", "dashed"], 0],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": REGEN_WIDTH } });
      map.addLayer({ id: "route-dashed", type: "line", source: "route", filter: ["==", ["get", "dashed"], 1],
        paint: { "line-color": ["get", "color"], "line-width": L.width, "line-dasharray": [...L.dash] } });
      // A wide, nearly invisible copy of the route that catches clicks and hovers, so thin stretches are easy to hit.
      map.addLayer({ id: "route-hit", type: "line", source: "route", filter: ["has", "grade"],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#000000", "line-opacity": 0.01, "line-width": L.hitWidth } });
      const M = CFG.markers;
      map.addLayer({ id: "stops", type: "circle", source: "stops",
        paint: { "circle-radius": M.stopRadius, "circle-color": cssVar("--text-2"), "circle-stroke-color": cssVar("--bg"), "circle-stroke-width": 2 } });
      map.addLayer({ id: "missed", type: "circle", source: "missed",
        paint: { "circle-radius": M.missedRadius, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": cssVar("--seg-bad"), "circle-stroke-width": 2.5 } });
      map.addLayer({ id: "car-halo", type: "circle", source: "car",
        paint: { "circle-radius": M.carHaloRadius, "circle-color": cssVar("--accent"), "circle-opacity": 0.25 } });
      map.addLayer({ id: "car", type: "circle", source: "car",
        paint: { "circle-radius": M.carRadius, "circle-color": cssVar("--accent"), "circle-stroke-color": cssVar("--text"), "circle-stroke-width": 2.5 } });

      map.on("click", "missed", (e) => {
        const i = e.features?.[0]?.properties?.i;
        const ev = typeof i === "number" ? latest.current.missed[i] : undefined;
        if (ev) latest.current.onSelectMissed(ev);
      });
      // Every stretch of route is clickable: it opens the telemetry popup.
      map.on("click", "route-hit", (e) => {
        const f = e.features?.[0]?.properties;
        if (typeof f?.i === "number") latest.current.onSelectSegment?.(f.i);
      });
      map.on("mouseenter", "route-hit", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "route-hit", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "missed", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "missed", () => (map.getCanvas().style.cursor = ""));

      // Start with the whole route in view
      const all = cur.segments.flatMap((s) => s.coords);
      const bounds = all.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
      fit.current = bounds;
      map.fitBounds(bounds, { padding: 60, pitch: CFG.camera.pitch, bearing: CFG.camera.bearing, duration: 0 });
      setReady(true);
    });

    return () => {
      setReady(false);
      map.remove();
    };
  }, [theme]);

  // Route coloring, stops and missed markers
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    geo(map, "route")?.setData(routeData(props));
    geo(map, "stops")?.setData(fc(props.stops.map((c) => point(c))));
    geo(map, "missed")?.setData(
      fc(props.missed.map((e, i) => point([e.lon, e.lat], { i }))),
    );
  }, [ready, props.segments, props.surfaces, props.colorBy, props.stops, props.missed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Car position, and the chase camera while following
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const carSource = geo(map, "car");
    if (!carSource) return;
    carSource.setData(fc([point(car)]));
    if (!follow) {
      // Following just ended: pull back out to the whole route
      if (replay && camBearing.current !== null && fit.current) {
        map.fitBounds(fit.current, { padding: 60, pitch: CFG.camera.pitch, bearing: CFG.camera.bearing, duration: 1200 });
      }
      camBearing.current = null;
      cam.current = null;
      orbit.current = null;
      return;
    }
    const C = CFG.camera;
    const R = CFG.replayCamera;
    const target = bearing(car, ahead);
    const turn = (from: number, to: number, k: number) => from + ((((to - from + 540) % 360) - 180) * k);
    if (replay) {
      // The camera circles the car instead of trailing it, and sits well back so buildings do not hide the route.
      // The car keeps moving, so never ease to where it is now: each update every value closes part of the gap
      // to its target, so the camera swoops in from the whole-route view and stays on the car with no snap.
      const now = performance.now();
      const o = (orbit.current ??= { deg: map.getBearing(), at: now });
      const dt = Math.min(0.1, (now - o.at) / 1000);
      o.at = now;
      o.deg = (o.deg + dt * (R.orbitDegPerSec + focus * R.brakeOrbitBoostDegPerSec)) % 360; // spins faster through braking zones
      camBearing.current = o.deg;
      const c = (cam.current ??= { lon: map.getCenter().lng, lat: map.getCenter().lat, bearing: map.getBearing(), zoom: map.getZoom(), pitch: map.getPitch() });
      c.lon += (car[0] - c.lon) * C.followLerp;
      c.lat += (car[1] - c.lat) * C.followLerp;
      c.bearing = turn(c.bearing, o.deg, C.followLerp);
      c.zoom += (R.zoom + focus * R.brakeZoom - c.zoom) * C.zoomLerp;
      c.pitch += (R.pitch - c.pitch) * C.zoomLerp;
      map.jumpTo({ center: [c.lon, c.lat], bearing: c.bearing, zoom: c.zoom, pitch: c.pitch });
      return;
    }
    if (camBearing.current === null) {
      camBearing.current = target;
      map.easeTo({ center: car, bearing: target, zoom: C.followZoom, pitch: C.followPitch, duration: 800 });
      return;
    }
    if (car[0] !== ahead[0] || car[1] !== ahead[1]) camBearing.current = turn(camBearing.current, target, C.turnSmoothing);
    if (!map.isEasing()) map.jumpTo({ center: car, bearing: camBearing.current });
  }, [ready, car, ahead, follow, focus, replay]);

  if (failed && props.fallback) return <>{props.fallback}</>;

  return (
    <div style={{ position: "relative", width: "100%", height: CFG.height }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <WeatherOverlay weather={weather} />
    </div>
  );
}
