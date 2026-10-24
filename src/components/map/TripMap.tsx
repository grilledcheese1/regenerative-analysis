"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import mapboxgl from "mapbox-gl";
import type * as GeoJSON from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "@/lib/env";
import type { Trip } from "@/lib/trip/types";
import { TRIP_CONFIG, type MapTheme } from "./config";
import { IDS, addTripLayers, currentFeature } from "./layers";

export interface TripMapProps {
  trip: Trip | null | undefined;
  theme?: MapTheme;
  /** Index into trip.samples of the replay marker. */
  currentIndex?: number;
  /** Pan the camera along with the replay marker. */
  follow?: boolean;
  className?: string;
  /** Rendered instead of the map when WebGL is unavailable (blocked, no GPU, hardware acceleration off). */
  fallback?: ReactNode;
}

function routeBounds(trip: Trip): mapboxgl.LngLatBounds | null {
  const pts = trip.samples;
  if (pts.length === 0) return null;
  const b = new mapboxgl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]);
  for (const s of pts) b.extend([s.lon, s.lat]);
  return b;
}

function fitToRoute(map: mapboxgl.Map, trip: Trip) {
  const bounds = routeBounds(trip);
  if (!bounds) return;
  map.fitBounds(bounds, {
    padding: TRIP_CONFIG.camera.padding,
    pitch: TRIP_CONFIG.camera.pitch,
    bearing: TRIP_CONFIG.camera.bearing,
    maxZoom: TRIP_CONFIG.camera.maxZoom,
    duration: TRIP_CONFIG.camera.fitDurationMs,
  });
}

/** Mapbox GL v3 needs WebGL 2; plain WebGL is not enough. */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

function missedPopup(props: Record<string, unknown>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "trip-popup";
  const rows: [string, string][] = [
    ["Missed regen", String(props.cause)],
    ["Time", `${Number(props.t)} s`],
    ["Speed", `${(Number(props.speed) * TRIP_CONFIG.units.mph).toFixed(0)} mph`],
    ["Grade", `${Number(props.grade).toFixed(1)}%`],
  ];
  for (const [k, v] of rows) {
    const row = document.createElement("div");
    const key = document.createElement("span");
    key.textContent = k;
    const val = document.createElement("strong");
    val.textContent = v;
    row.append(key, val);
    wrap.append(row);
  }
  return wrap;
}

export default function TripMap({
  trip,
  theme = "dark",
  currentIndex = 0,
  follow = false,
  className,
  fallback,
}: TripMapProps) {
  const [webglFailed, setWebglFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleReady = useRef(false); // true between `style.load` and the next setStyle
  const pendingFit = useRef(true);
  // Latest props, readable from map event handlers that outlive a render.
  const latest = useRef({ trip, theme, currentIndex });
  useEffect(() => {
    latest.current = { trip, theme, currentIndex };
  });

  // Create the map once; every style load (initial and theme swap) re-adds our layers.
  useEffect(() => {
    if (!container.current || !env.mapboxToken) return;
    mapboxgl.accessToken = env.mapboxToken;

    // Don't start Mapbox where it cannot run: its constructor throws, and Next's dev overlay shows that as a crash.
    if (!webglAvailable()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a browser capability check
      setWebglFailed(true);
      return;
    }

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: container.current,
        style: TRIP_CONFIG.styles[latest.current.theme],
        center: TRIP_CONFIG.fallbackCenter,
        zoom: TRIP_CONFIG.fallbackZoom,
        pitch: TRIP_CONFIG.camera.pitch,
        bearing: TRIP_CONFIG.camera.bearing,
      });
    } catch (err) {
      console.warn("Map could not start:", err);
      setWebglFailed(true);
      return;
    }
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;
    // Dev-only handle for debugging in the browser console.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __tripMap?: mapboxgl.Map }).__tripMap = map;

    // Single owner of layer (re)building: runs on the first load and after every theme swap.
    map.on("style.load", () => {
      const { trip: t, theme: th, currentIndex: i } = latest.current;
      addTripLayers(map, t, th, i);
      styleReady.current = true;
      if (pendingFit.current && t) {
        pendingFit.current = false;
        fitToRoute(map, t);
      }
    });

    map.on("click", IDS.missed, (e) => {
      const f = e.features?.[0] as unknown as GeoJSON.Feature | undefined;
      if (!f || f.geometry.type !== "Point") return;
      new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setLngLat(f.geometry.coordinates as [number, number])
        .setDOMContent(missedPopup(f.properties ?? {}))
        .addTo(map);
    });
    map.on("mouseenter", IDS.missed, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", IDS.missed, () => (map.getCanvas().style.cursor = ""));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Theme swap: replace the style (no diffing, so overlapping requests cancel and the
  // last toggle wins); the `style.load` handler above re-adds the layers.
  const appliedTheme = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    styleReady.current = false;
    // mapbox-gl's typings wrongly require the font options too, hence the assertion.
    map.setStyle(TRIP_CONFIG.styles[theme], { diff: false } as Parameters<typeof map.setStyle>[1]);
  }, [theme]);

  // New trip: rebuild layers and refit now if the style is ready, else on `style.load`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pendingFit.current = true;
    if (!styleReady.current) return;
    addTripLayers(map, trip, latest.current.theme, latest.current.currentIndex);
    if (trip) {
      pendingFit.current = false;
      fitToRoute(map, trip);
    }
  }, [trip]);

  // Replay marker (+ optional follow camera).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trip || !styleReady.current) return;
    const src = map.getSource(IDS.currentSrc) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(currentFeature(trip, currentIndex));
    const s = trip.samples[currentIndex];
    if (follow && s) {
      map.easeTo({
        center: [s.lon, s.lat],
        zoom: Math.max(map.getZoom(), TRIP_CONFIG.camera.followZoom),
        duration: TRIP_CONFIG.camera.followDurationMs,
        easing: (t) => t,
      });
    }
  }, [trip, currentIndex, follow]);

  if (webglFailed) {
    return (
      <div className={className}>
        {fallback ?? (
          <div className="card" role="alert">
            <span className="label">Map</span>
            <p>The map needs WebGL, which this browser has disabled or can&apos;t start. Enable hardware acceleration and reload.</p>
          </div>
        )}
      </div>
    );
  }

  if (!env.mapboxToken) {
    return (
      <div className={`card ${className ?? ""}`}>
        <span className="label">Map</span>
        <p>Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable the map.</p>
      </div>
    );
  }

  const empty = !trip || trip.samples.length === 0;

  return (
    <div className={`trip-map ${className ?? ""}`}>
      <div ref={container} className="trip-map__canvas" />
      <span className="trip-map__tag label">Simulated data</span>
      {empty && (
        <div className="trip-map__empty card" role="status">
          No trip loaded.
        </div>
      )}
    </div>
  );
}
