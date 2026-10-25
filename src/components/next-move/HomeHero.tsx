"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import "maplibre-gl/dist/maplibre-gl.css";
import { FREE_MAP_CONFIG as CFG } from "@/components/map/config";

export interface HeroSlide {
  title: string;
  body: string;
  cta: { label: string; onClick: () => void };
}

interface Props {
  route: [number, number][]; // [lon, lat], the driver's commute
  routeName: string;
  slides: HeroSlide[];
}

const SLIDE_MS = 7000;

// Each message rises in line by line (headline, then text, then button) and lifts out as a group
const COPY = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { staggerChildren: 0.09 } },
  gone: { opacity: 0, y: -10, transition: { duration: 0.25, ease: "easeIn" } },
} as const;
const LINE = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 140, damping: 20 } },
} as const;
const CAMERA = { zoom: 15.2, pitch: 62, lookAhead: 25, pointsPerSecond: 9, turn: 0.04 };

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return Math.atan2(y, x) / r;
}

// Hold the camera still for people who prefer less motion, and in automated test browsers
// (no GPU there, so a moving 3D map would slow every test down).
const stillCamera = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver;
function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Home hero: a slow, live 3D flyover of the driver's real commute (MapLibre with free map tiles),
 * with rotating messages on top. Decorative backdrop; every message and action is plain HTML.
 */
export default function HomeHero({ route, routeName, slides }: Props) {
  const container = useRef<HTMLDivElement>(null);
  // Client-only component. Automated test browsers get the static backdrop: no GPU there.
  const [mapOk, setMapOk] = useState(() => hasWebGL() && !navigator.webdriver);
  const [playing, setPlaying] = useState(() => !stillCamera());
  const [slide, setSlide] = useState(0);
  const playingRef = useRef(playing);
  // Rebuild the map only when the route itself changes, not on every re-render
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  const routeKey = `${route.length}:${route[0]?.join(",")}:${route[route.length - 1]?.join(",")}`;
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // The flyover
  useEffect(() => {
    const route = routeRef.current;
    if (!mapOk || !container.current || route.length < 2) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: CFG.styles.dark,
      center: route[0],
      zoom: CAMERA.zoom,
      pitch: CAMERA.pitch,
      interactive: false,
      pixelRatio: Math.min(window.devicePixelRatio, 1.5), // sharp enough, much lighter to draw
      attributionControl: { compact: true },
    });
    let frame = 0;
    let pos = 0;
    let cam = bearing(route[0], route[Math.min(route.length - 1, CAMERA.lookAhead)]);
    let last = performance.now();

    map.on("load", () => {
      container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // Cinematic: no labels or icons, 3D buildings and terrain
      for (const layer of map.getStyle().layers) if (layer.type === "symbol") map.setLayoutProperty(layer.id, "visibility", "none");
      if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
      map.addLayer({
        id: "hero-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#2b3138",
          "fill-extrusion-opacity": 0.9,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        },
      });
      map.addSource("dem", { type: "raster-dem", tiles: [CFG.terrainTiles], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: CFG.terrainAttribution });
      map.setTerrain({ source: "dem", exaggeration: 1.3 });

      map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } } });
      map.addSource("car", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: route[0] } } });
      map.addLayer({ id: "route-glow", type: "line", source: "route", paint: { "line-color": "#eb0a1e", "line-width": 14, "line-blur": 10, "line-opacity": 0.45 } });
      map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#eb0a1e", "line-width": 4 } });
      map.addLayer({ id: "car", type: "circle", source: "car", paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#eb0a1e", "circle-stroke-width": 3 } });

      if (stillCamera()) {
        const b = route.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(route[0], route[0]));
        map.fitBounds(b, { padding: 60, pitch: 50, duration: 0 });
        return;
      }
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (playingRef.current) {
          pos = (pos + dt * CAMERA.pointsPerSecond) % (route.length - 1);
          const i = Math.floor(pos);
          const f = pos - i;
          const [a, b] = [route[i], route[i + 1]];
          const here: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
          const ahead = route[Math.min(route.length - 1, i + CAMERA.lookAhead)];
          if (ahead !== a) cam += ((((bearing(here, ahead) - cam + 540) % 360) - 180) * CAMERA.turn);
          (map.getSource("car") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: here } });
          map.jumpTo({ center: here, bearing: cam });
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    map.on("error", (e) => {
      if (!map.loaded() && /webgl|style/i.test(String(e.error?.message))) setMapOk(false);
    });
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
    };
  }, [mapOk, routeKey]);

  // Rotating messages
  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const t = setTimeout(() => setSlide((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [playing, slide, slides.length]);

  const s = slides[Math.min(slide, slides.length - 1)];
  const still = useReducedMotion();

  return (
    <section className="nm-hero" aria-roledescription="carousel" aria-label="Your vehicle at a glance">
      {mapOk ? <div ref={container} className="nm-hero-map" aria-hidden="true" /> : <div className="nm-hero-map nm-hero-fallback" aria-hidden="true" />}
      <div className="nm-hero-scrim" aria-hidden="true" />

      <div className="nm-hero-copy" aria-live={playing ? "off" : "polite"}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={slide} variants={COPY} initial={still ? false : "hidden"} animate="shown" exit={still ? undefined : "gone"}>
            <motion.h2 className="nm-hero-title" variants={LINE}>
              {s.title}
            </motion.h2>
            <motion.p className="nm-hero-body" variants={LINE}>
              {s.body}
            </motion.p>
            <motion.button className="nm-hero-cta" variants={LINE} whileHover={still ? undefined : { scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={s.cta.onClick}>
              {s.cta.label}
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="nm-hero-controls">
        <button className="nm-hero-pause" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="nm-hero-steps" role="tablist" aria-label="Messages">
          {slides.map((x, i) => (
            <button
              key={x.title}
              role="tab"
              aria-selected={i === slide}
              aria-label={x.title}
              className={`nm-hero-step${i === slide ? " on" : ""}${i === slide && playing ? " run" : ""}`}
              style={{ ["--slide-ms" as string]: `${SLIDE_MS}ms` }}
              onClick={() => setSlide(i)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className="nm-hero-caption">Simulated replay · {routeName}, Austin</span>
      </div>
    </section>
  );
}
