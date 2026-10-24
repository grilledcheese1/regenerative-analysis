# Stream 2: Data and API

All driving data is **simulated**; physics and savings numbers are **estimates**.
Routes, elevation and weather are real. Merged from two implementations: the pipeline and generated trips below
(`scripts/*.ts`), and Ariana's PR #2 (`/api/routes`, the `?route=&condition=` compare shortcut, and the original
OSRM-based route fetcher `scripts/fetch-routes.mjs`).

## Pipeline (run in order, each step caches to `data/cache/` and skips when the file exists; `--refresh` redoes it)

```
node --env-file=.env.local scripts/fetch-directions.ts   # Mapbox Directions: road geometry, speed limits
node --env-file=.env.local scripts/fetch-elevation.ts    # USGS 3DEP lidar elevation (--source=mapbox|openmeteo also supported)
node --env-file=.env.local scripts/fetch-overpass.ts     # OSM: traffic signals, stop signs, drivable ways, surfaces
node --env-file=.env.local scripts/fetch-weather.ts      # Open-Meteo: temperature, rain and snow in the last 24 h
node scripts/build-routepoints.ts                        # 10 m RoutePoint[] + sanity checks
node --env-file=.env.local scripts/generate-trips.ts [--coach]   # 72 trips (+ coach tips), uses src/lib/physics
node scripts/validate-trips.ts                           # field checks + score table
```

Routes live in `scripts/routes.config.ts`. Every route is checked to sit on drivable OSM roads, to match the
Directions geometry, and to have realistic grades (bridges and tunnels are interpolated, not read from the ground).

| Id | Route | Length | Relief | Stops |
|---|---|---|---|---|
| `hilly` | Mount Bonnell to Bridle Path | 4.6 km | 56 m | 7 |
| `flat` | Congress Ave: Oltorf to UT Tower | 6.3 km | 45 m | 39 |
| `mixed` | Bee Cave Rd to Barton Springs Rd | 5.9 km | 95 m | 12 |

## API

Trip ids: `<route>-<driver>-<condition>`, plus `-noregen` for the conventional car. Reads local files only.

| Call | Returns |
|---|---|
| `GET /api/routes` | `{ routeId, name, terrain, distanceM, reliefM, stops }[]` |
| `GET /api/routes/hilly` | `{ routeId, name, meta, points: RoutePoint[] }` |
| `GET /api/trips` | `TripHeader[]` (filters: `?route=&driver=&condition=&regen=`) |
| `GET /api/trips/hilly-smooth-dry` | `Trip` |
| `GET /api/compare?ids=a,b,c` | `Trip[]` (2 to 4 ids) |
| `GET /api/compare?route=hilly&condition=wet` | `Trip[]`: conventional, smooth, aggressive |
| `GET /api/trips/hilly-smooth-dry/coach` | `{ tip, basedOn }` (saved file, then Claude if a key exists, then rules) |

The older `POST /api/coach` is unchanged.

## Data attributions the UI must show

© OpenStreetMap contributors (ODbL); Open-Meteo.com (CC BY 4.0); © Mapbox; USGS 3DEP elevation.

## Notes

- **Coach tips:** with no `ANTHROPIC_API_KEY`, the saved tips are rule-based (`"source": "fallback"`). After adding a key,
  run `generate-trips.ts --coach --refresh` to regenerate them with Claude.
- **Alternate routes:** `scripts/fetch-routes.mjs` + `scripts/data.config.mjs` (OSRM routing, Open-Meteo elevation) and
  their caches (`data/cache/*.json`, `data/cache/routes/{hill,flat,mixed,index}.json`) are Ariana's original
  implementation. They are not used by the API now. Her routes could be added as extra routes in `routes.config.ts`
  (rename to avoid clashing with `flat` and `mixed`).
- **Stream 1:** on real routes the smooth/aggressive score gap is small, and in mud and snow aggressive or mixed
  can beat smooth (see `validate-trips.ts` warnings).
- **Deploy:** the API reads `data/trips/` and `data/cache/routes/` at request time. If Vercel leaves them out, add
  `outputFileTracingIncludes: { "/api/**/*": ["./data/trips/**/*", "./data/cache/routes/**/*"] }` to `next.config.ts`.
