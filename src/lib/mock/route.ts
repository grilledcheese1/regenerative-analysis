// Synthetic demo route in west Austin. Placeholder until the cached
// Directions + Open-Meteo + Overpass data from the trip generator exists.

export interface RoutePoint {
  s: number; // meters from start
  lat: number;
  lon: number;
  elevationM: number;
  limitMs: number;
}

export interface DemoRoute {
  name: string;
  stepM: number;
  points: RoutePoint[];
  stopsM: number[]; // signal / stop sign positions along the route
}

const MPH = 0.44704;

export function buildDemoRoute(): DemoRoute {
  const stepM = 10;
  const lengthM = 7000;
  const points: RoutePoint[] = [];
  let lat = 30.2672;
  let lon = -97.7731;

  for (let s = 0; s <= lengthM; s += stepM) {
    const heading = -0.6 + 0.9 * Math.sin(s / 900) + 0.35 * Math.sin(s / 310);
    const elevationM = 160 + 34 * Math.sin(s / 1100) + 11 * Math.sin(s / 370 + 1);
    const limitMs = s < 2500 ? 30 * MPH : s < 5000 ? 45 * MPH : 35 * MPH;
    points.push({ s, lat, lon, elevationM, limitMs });
    lat += (stepM * Math.cos(heading)) / 111320;
    lon += (stepM * Math.sin(heading)) / (111320 * Math.cos((lat * Math.PI) / 180));
  }

  return {
    name: "West Austin hills (synthetic)",
    stepM,
    points,
    stopsM: [900, 2100, 3300, 4200, 5600, lengthM],
  };
}
