// Stream 2 config: the demo routes and every tunable number for the data pipeline.

export const CITY = "Austin, TX";

// Three demo routes in one city: hilly, flat and mixed.
export const ROUTES = [
  {
    routeId: "hill",
    name: "Westlake Hills to Downtown",
    terrain: "hilly",
    start: { lat: 30.296, lon: -97.8095 },
    end: { lat: 30.2672, lon: -97.7431 },
  },
  {
    routeId: "flat",
    name: "East Austin loop",
    terrain: "flat",
    start: { lat: 30.262, lon: -97.718 },
    end: { lat: 30.2905, lon: -97.695 },
  },
  {
    routeId: "mixed",
    name: "South Lamar to the Capitol",
    terrain: "mixed",
    start: { lat: 30.239, lon: -97.786 },
    end: { lat: 30.2747, lon: -97.7404 },
  },
];

export const DATA_CONFIG = {
  stepM: 10, // one route point every N meters
  elevationSmoothingPoints: 11, // moving-average window, smooths the 90 m elevation grid
  stopSnapDistanceM: 20, // a traffic signal or stop sign this close to the route counts as a stop
  roadSnapDistanceM: 40, // nearest OpenStreetMap road within this distance gives surface and speed limit
  minStopSpacingM: 60, // merge stops closer than this (one intersection often has several signals)
  redLightEvery: 2, // the car catches a red at every Nth traffic signal; stop signs always stop it
  defaultSpeedLimitMs: 13.4, // 30 mph, used when no speed limit is tagged
  // Speed limit guess by road class when OpenStreetMap has no maxspeed tag (m/s)
  speedByRoadClass: {
    motorway: 29, trunk: 24.6, primary: 17.9, secondary: 15.6, tertiary: 13.4,
    residential: 11.2, unclassified: 11.2, living_street: 6.7, service: 6.7,
  },
  pavedSurfaces: ["asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett"],
  gravelSurfaces: ["gravel", "fine_gravel", "compacted", "unpaved"],
  dirtSurfaces: ["dirt", "ground", "earth", "mud", "sand", "grass"],
  // Suggested road condition from today's real weather
  wetAfterRainMm: 1, // this much rain in the last 24 h suggests "wet"
  snowAfterSnowCm: 0.5, // this much snow in the last 24 h, or a temperature below freezing, suggests "snow"
  elevationBatchSize: 100, // Open-Meteo accepts up to 100 points per request
  requestDelayMs: 1100, // pause between calls to the free public APIs
};
