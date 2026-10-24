"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "@/lib/env";

interface RouteMapProps {
  theme?: "dark" | "bright";
  center?: [number, number]; // [lon, lat]
  zoom?: number;
}

const STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  bright: "mapbox://styles/mapbox/light-v11",
};

export default function RouteMap({
  theme = "dark",
  center = [-97.7431, 30.2672], // Austin
  zoom = 12,
}: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!container.current || !env.mapboxToken) return;
    mapboxgl.accessToken = env.mapboxToken;

    const map = new mapboxgl.Map({
      container: container.current,
      style: STYLES[theme],
      center,
      zoom,
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
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  if (!env.mapboxToken) {
    return (
      <div className="card">
        <span className="label">Map</span>
        <p>Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable the map.</p>
      </div>
    );
  }

  return <div ref={container} style={{ width: "100%", height: "60vh", borderRadius: 14 }} />;
}
