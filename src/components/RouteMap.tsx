"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "@/lib/env";
import type { MissedEvent } from "@/lib/model/score";
import { GRADE_VAR, type Segment } from "@/lib/segments";
import RouteSvg from "./RouteSvg";

interface RouteMapProps {
  theme?: "dark" | "bright";
  segments: Segment[];
  stops: [number, number][];
  missed: MissedEvent[];
  car: [number, number]; // [lon, lat]
  onSelectMissed: (e: MissedEvent) => void;
}

const STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  bright: "mapbox://styles/mapbox/light-v11",
};

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function routeData(segments: Segment[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segments.map((s) => ({
      type: "Feature",
      properties: { color: cssVar(GRADE_VAR[s.grade]) },
      geometry: { type: "LineString", coordinates: s.coords },
    })),
  };
}

function pointData(points: [number, number][], props: object[] = []): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((c, i) => ({
      type: "Feature",
      properties: { ...props[i] },
      geometry: { type: "Point", coordinates: c },
    })),
  };
}

export default function RouteMap(props: RouteMapProps) {
  const { theme = "dark", segments, stops, missed, car, onSelectMissed } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (!container.current || !env.mapboxToken) return;
    mapboxgl.accessToken = env.mapboxToken;

    const first = latest.current.segments[0].coords[0];
    const map = new mapboxgl.Map({
      container: container.current,
      style: STYLES[theme],
      center: first,
      zoom: 13,
      pitch: 60,
      bearing: -20,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": theme === "dark" ? "#1c2229" : "#d9d9d9",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.8,
        },
      });

      const p = latest.current;
      map.addSource("route", { type: "geojson", data: routeData(p.segments) });
      map.addSource("stops", { type: "geojson", data: pointData(p.stops) });
      map.addSource("missed", { type: "geojson", data: pointData([]) });
      map.addSource("car", { type: "geojson", data: pointData([p.car]) });

      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        paint: { "line-color": ["get", "color"], "line-width": 12, "line-blur": 8, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: { "circle-radius": 4, "circle-color": cssVar("--text-2") },
      });
      map.addLayer({
        id: "missed",
        type: "circle",
        source: "missed",
        paint: {
          "circle-radius": 7,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": cssVar("--seg-bad"),
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "car",
        type: "circle",
        source: "car",
        paint: {
          "circle-radius": 6,
          "circle-color": cssVar("--accent"),
          "circle-stroke-color": cssVar("--bg"),
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "missed", (e) => {
        const i = (e.features?.[0] as GeoJSON.Feature | undefined)?.properties?.i;
        const ev = typeof i === "number" ? latest.current.missed[i] : undefined;
        if (ev) latest.current.onSelectMissed(ev);
      });
      setReady(true);
    });

    return () => {
      setReady(false);
      map.remove();
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("route") as mapboxgl.GeoJSONSource).setData(routeData(segments));
    (map.getSource("stops") as mapboxgl.GeoJSONSource).setData(pointData(stops));
    (map.getSource("missed") as mapboxgl.GeoJSONSource).setData(
      pointData(
        missed.map((e) => [e.lon, e.lat]),
        missed.map((_, i) => ({ i })),
      ),
    );
  }, [ready, segments, stops, missed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("car") as mapboxgl.GeoJSONSource).setData(pointData([car]));
  }, [ready, car]);

  if (!env.mapboxToken) {
    return (
      <RouteSvg segments={segments} stops={stops} missed={missed} car={car} onSelectMissed={onSelectMissed} />
    );
  }

  return <div ref={container} style={{ width: "100%", height: 460 }} />;
}
