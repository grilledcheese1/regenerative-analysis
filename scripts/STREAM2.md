# Stream 2: Data and API (Ariana)

All driving data is **simulated**; physics and savings numbers are **estimates**.

## Real routes

`node scripts/fetch-routes.mjs` builds three real Austin routes from cached API responses in `data/cache/`
(add `--fresh` to download again). Routes and tunable numbers live in `scripts/data.config.mjs`.

| Id | Route | Length | Stops driven |
|---|---|---|---|
| `hill` | Westlake Hills to Downtown | 7.9 km | 10 |
| `flat` | East Austin loop | 5.3 km | 10 |
| `mixed` | South Lamar to the Capitol | 7.7 km | 16 |

Sources: OSRM routing (Mapbox Directions when `NEXT_PUBLIC_MAPBOX_TOKEN` is set), Open-Meteo elevation and
weather, OpenStreetMap roads, speed limits, surfaces, traffic signals and stop signs. The car catches a red at
every 2nd signal and always stops at stop signs.

Output: `data/cache/routes/<id>.json`, already in the simulator's `DemoRoute` shape
(`name`, `stepM`, `points[{ s, lat, lon, elevationM, limitMs }]`, `stopsM`) plus `surface`, `roadClass` and
`street` on each point, and `weather`, `suggestedCondition`, `allStops` and `source` on the route.
`suggestedCondition` picks dry, wet or snow from today's real weather, with a reason to show in the UI.

## API (matches AGENTS.md section 4)

Trips are simulated on request with Stream 1's `simulateTrip` + `analyzeTrip` + `toContractTrip`, so physics
changes show up immediately. Trip ids: `<route>-<driver>-<condition>`, plus `-noregen` for the conventional car.

**Open http://localhost:3000/api** for a clickable guide to everything below. Response types for
autocomplete: `import type { TripStory } from "@/app/api/_lib/types"`.

| Call | Returns |
|---|---|
| `GET /api/routes` | name, miles, stops, a label like "Hilly · 4.9 mi · 10 stops", and today's suggested condition |
| `GET /api/routes/hill` | the route as a `DemoRoute` |
| `GET /api/trips` | `TripHeader[]` (filters: `?route=&driver=&condition=&regen=`) |
| `GET /api/trips/hill-smooth-dry` | `Trip` |
| `GET /api/compare?ids=a,b,c` | `Trip[]` |
| `GET /api/compare?route=hill&condition=wet` | `Trip[]`: conventional, smooth, aggressive |
| `GET /api/trips/hill-smooth-dry/story` | plain-English sentences in miles and mph, stats, the 3 biggest missed moments with street names, and the best stretch |
| `GET /api/trips/hill-smooth-dry/coach` | `{ tip, basedOn, source }` (Claude with a key, rules without); names the street where most regen was lost |

The existing `POST /api/coach` is unchanged.

## Data attributions the UI must show

© OpenStreetMap contributors (ODbL); Open-Meteo.com (CC BY 4.0); © Mapbox; USGS 3DEP elevation.

## For teammates

- **Stream 4:** to use real roads in the dashboard, replace `buildDemoRoute()` with the JSON from
  `fetch("/api/routes/hill")` (same shape). `/story` gives ready-made text for the analysis panel, and
  `suggestedCondition` can preselect the condition toggle.
- **Stream 3:** `biggestMisses` in `/story` has lat, lon and a sentence for each map marker pop-up.
- **Stream 1:** on the real routes, the aggressive driver often scores higher than the smooth one
  (hill dry: smooth 64, aggressive 67, mixed 73). The ceiling `η·(m·g·Δh + Σ½mv²)` uses each driver's own
  approach speeds and ignores drag and rolling losses, so faster driving raises recovered energy more than the
  ceiling. Worth a look before the "clearly different scores" check.
- **Deploy:** the API reads `data/cache/routes/` at request time. If Vercel leaves it out, add
  `outputFileTracingIncludes: { "/api/**/*": ["./data/cache/routes/**/*"] }` to `next.config.ts`
  (shared file, so whoever owns it).
