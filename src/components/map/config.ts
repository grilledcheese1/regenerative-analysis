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

// Keyless 3D map (MapLibre + free tiles), used when there's no Mapbox token.
export const FREE_MAP_CONFIG = {
  styles: {
    dark: "https://tiles.openfreemap.org/styles/dark",
    bright: "https://tiles.openfreemap.org/styles/positron",
  },
  terrainTiles: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  terrainAttribution: "Terrain: Mapzen / AWS Open Data",
  height: 520,
  camera: { zoom: 14.6, pitch: 62, bearing: -20, followZoom: 16.2, followPitch: 68, turnSmoothing: 0.08, lookAheadSamples: 20, followLerp: 0.14, zoomLerp: 0.05 },
  // The story replay: a camera that circles the car from well back (3D buildings block a close view)
  replayCamera: { zoom: 15.1, pitch: 50, orbitDegPerSec: 7, brakeOrbitBoostDegPerSec: 18, brakeZoom: 0.5 },
  terrain: { exaggeration: 1.4 },
  hillshade: { exaggeration: 0.5 },
  buildings: { minzoom: 13, defaultHeightM: 6 },
  line: { width: 6, hitWidth: 20, glowWidth: 16, glowBlur: 10, glowOpacity: 0.55, dash: [1.5, 1] },
  markers: { stopRadius: 5, missedRadius: 8, carRadius: 8, carHaloRadius: 18 },
  weather: { rainDrops: 220, snowFlakes: 160, rainSpeed: 700, snowSpeed: 60 },
} as const;

// The story map's replay: how fast the car moves along the simulated trip (samples are 1 s apart), and when the zoom-follow triggers.
export const REPLAY_CONFIG = {
  samplesPerSecond: 16, // laps are 480 to 880 samples, so about 30 to 55 s
  lookAheadSamples: 6,
  brakeWindowSamples: 12,
  fullyInView: { enter: 0.95, leave: 0.4, dwellMs: 400 },
} as const;

export type MapTheme = "dark" | "bright";
