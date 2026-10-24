// The three demo routes (Austin, Texas). Waypoints are [lon, lat] and are snapped to roads by the
// Mapbox Directions API; the intermediate "via" points keep the route on the intended arterials.
// Check data/cache/directions output (road names, length) after changing any of these.
import type { LonLat } from "./lib/geo.ts";

export interface RouteConfig {
  id: "hilly" | "flat" | "mixed";
  name: string;
  waypoints: LonLat[];
  note: string;
}

export const ROUTES: RouteConfig[] = [
  {
    id: "hilly",
    name: "Mount Bonnell to Bridle Path",
    waypoints: [
      [-97.7733, 30.3207], // Mount Bonnell Rd
      [-97.762674, 30.31048], // W 35th St at Exposition Blvd (keeps the route off Mopac)
      [-97.769, 30.2905], // Bridle Path
    ],
    note: "Steep descent off Mount Bonnell then Exposition Blvd hills; must show at least 30 m of relief. A Zilker end added 5 km of Mopac.",
  },
  {
    id: "flat",
    name: "Congress Ave: Oltorf to UT Tower",
    waypoints: [
      [-97.7499, 30.2406], // S Congress at Oltorf
      [-97.7431, 30.2672], // downtown Congress Ave
      [-97.7394, 30.2862], // UT Tower
    ],
    note: "Near-straight signalized grid; many stops.",
  },
  {
    id: "mixed",
    name: "Bee Cave Rd to Barton Springs Rd",
    waypoints: [
      [-97.807292, 30.279933], // Bee Cave Rd at Westbank Dr
      [-97.793533, 30.270982], // Bee Caves Rd (keeps the route on the arterial)
      [-97.75852, 30.26085], // S Lamar at Barton Springs Rd
    ],
    note: "Hill section around Westlake, then arterial stops on Lamar.",
  },
];
