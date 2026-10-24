// All tunable map/chart values live here.

export const TRIP_CONFIG = {
  styles: {
    dark: "mapbox://styles/mapbox/dark-v11",
    bright: "mapbox://styles/mapbox/light-v11",
  },
  camera: {
    pitch: 60,
    bearing: -25,
    padding: { top: 80, bottom: 80, left: 80, right: 80 },
    fitDurationMs: 1200,
    maxZoom: 16,
    followZoom: 15.5,
    followDurationMs: 250,
  },
  terrain: { exaggeration: 1.5 },
  hillshade: { exaggeration: 0.35 },
  contours: { width: 0.6, opacity: 0.25, minzoom: 11 },
  buildings: { minzoom: 13, opacity: 0.55 },
  capture: { good: 0.7, mid: 0.35 },
  stopSpeedMs: 0.5,
  line: { width: 5, glowWidth: 14, glowBlur: 8, glowOpacity: 0.55 },
  markers: { missedRadius: 7, stopRadius: 4, currentRadius: 8 },
  units: { mph: 2.23694, feet: 3.28084 },
  themeColors: {
    dark: { building: "#2a3138", hillshade: "#000000", contour: "#a9b1b4", marker: "#eef0ee" },
    bright: { building: "#cfcfcf", hillshade: "#1a1a1a", contour: "#4a4a4a", marker: "#1a1a1a" },
  },
  fallbackCenter: [-97.7431, 30.2672] as [number, number], // Austin, [lon, lat]
  fallbackZoom: 11,
} as const;

export type MapTheme = "dark" | "bright";
