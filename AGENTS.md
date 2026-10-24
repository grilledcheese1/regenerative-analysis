# AGENTS.md: Regen Coach (Hackathon Team Rules for AI Agents)

Read this whole file before writing any code. It is the shared contract for four people who each use an AI coding agent on the same repo. Its purpose is to stop mismatched files, renamed fields and merge conflicts.

You can copy this file to `CLAUDE.md` and `.cursorrules` so every tool reads the same rules. Keep the three copies identical.

## 0. First: which stream are you?

The human tells you their stream (1 to 4) at the start of the session. **If you have not been told, ask before touching any file.** Work only on your stream. If a task needs a change in someone else's area, stop and tell the human to ask that stream's owner. Do not make the change yourself.

## 1. The project in one paragraph

Regen Coach is a Next.js (TypeScript) web app for the Toyota hackathon track. It replays **simulated** Camry hybrid drives on a dark 3D topographic city map (Mapbox GL JS), scores how well the driver captured regenerative braking energy, shows how road and weather conditions change the result, and shows fuel, money and CO2 saved compared with a conventional car. Routes, roads and terrain are real. The driving data is simulated by a physics model, because Toyota does not publish Camry regen telemetry. The pitch is: simulated data today, a phone app next, real Toyota vehicle data later. Only the data source changes.

### What gets demoed
- **Map view:** glowing route on 3D terrain, colored teal, amber or rose by regen performance.
- **Analysis panel:** terminal-style readout with score, energy recovered, missed opportunities and an AI coaching tip.
- **Compare mode (the money shot):** conventional car vs smooth driver vs aggressive driver on the same trip.
- **Conditions toggle:** dry, wet, snow, mud. Grip limits regen, so the score changes live.
- **Savings card:** gallons, dollars and CO2 per trip and per year, with sliders for gas price and trips per day.

## 2. The four streams

| Stream | Name | Owner builds |
| --- | --- | --- |
| 1 | Physics and Scoring | Vehicle model, driver profiles, score, grip and weather effects, savings math |
| 2 | Data and API | Route, road and weather fetching and caching, trip generator, API routes, AI coaching text |
| 3 | Map and Charts | Mapbox map, terrain, route coloring, markers, charts, replay |
| 4 | UI, Theme and Pitch | App shell, themes, score and analysis panels, savings card, compare layout, deploy |

If the team has fewer than four people, one person may own two streams. The file ownership below still applies to each stream.

## 3. File ownership (proposed layout, confirm at kickoff)

Create this structure first, then do not rename or move top-level folders.

```
/
  AGENTS.md                      LOCKED (shared rules)
  types/
    trip.ts                      LOCKED (shared contract, see section 4)
  config/
    regen.config.ts              Stream 1 owns. Every physics and savings number lives here.
  data/
    trips/
      sample.json                LOCKED until Stream 2 replaces it with real output
      *.json                     Stream 2 writes generated trips here
    cache/                       Stream 2 only (Directions, Overpass, Open-Meteo responses)
  lib/
    physics/                     Stream 1 only
  scripts/                       Stream 2 only (fetchers, trip generator)
  app/
    api/                         Stream 2 only
    (pages, layout, globals)     Stream 4 only
  components/
    map/                         Stream 3 only
    charts/                      Stream 3 only
    ui/                          Stream 4 only
  styles/
    theme.css                    Stream 4 only
```

### Do-not-touch rules

| If you are Stream... | You may edit | You must NOT edit |
| --- | --- | --- |
| 1 | `lib/physics/`, `config/regen.config.ts` | Everything else |
| 2 | `scripts/`, `app/api/`, `data/trips/*` (except `sample.json`), `data/cache/` | Everything else |
| 3 | `components/map/`, `components/charts/` | Everything else |
| 4 | `app/` (except `app/api/`), `components/ui/`, `styles/theme.css` | Everything else |

### Shared files nobody edits alone
These need agreement from the whole team first. If you think one needs to change, **stop and ask the human**:

- `types/trip.ts`
- `data/trips/sample.json`
- `package.json`, the lockfile, `tsconfig.json`, `.prettierrc`, `next.config.*`
- `.env*` (never commit secrets)
- `AGENTS.md`, `CLAUDE.md`, `.cursorrules`

One person is the package owner (suggest Stream 4). Everyone else asks them to install dependencies. Do not run `npm install <new package>` on your own.

## 4. The contract (LOCKED)

All streams import these types from `types/trip.ts`. **Never invent your own field names, rename a field, or change a unit.** If the code and the types disagree, the types are right and the code gets fixed. If the contract needs a change, stop and tell the human.

Units: meters, seconds, m/s, kW, kWh, percent for grade, 0 to 1 for brake and soc.

```ts
export type Driver = "smooth" | "aggressive" | "mixed";
export type Condition = "dry" | "wet" | "snow" | "mud";
export type MissedCause = "late braking" | "low grip" | "full battery" | "cold battery";

export type Sample = {
  t: number;              // seconds since trip start
  lat: number;
  lon: number;
  speed: number;          // m/s
  elevation: number;      // meters
  grade: number;          // percent slope
  brake: number;          // braking demand, 0 to 1
  regenKw: number;        // braking power handled by regen
  frictionKw: number;     // braking power handled by friction brakes
  soc?: number;           // battery state of charge, 0 to 1
  missed: MissedCause | null; // cause of a missed regen opportunity at this sample
};

export type TripHeader = {
  tripId: string;         // e.g. "hill-smooth-dry"
  driver: Driver;
  vehicle: string;        // "Camry Hybrid"
  condition: Condition;
  regenEnabled: boolean;  // false = conventional-car baseline
  distanceM: number;
};

export type TripSummary = {
  score: number;               // 0 to 100
  energyRecoveredKwh: number;
  energyCeilingKwh: number;
  heatLossKwh: number;         // braking energy lost as brake heat
  missedEvents: { t: number; cause: MissedCause }[];
  gallonsSaved: number;
  dollarsSaved: number;
  co2Kg: number;
};

export type Trip = { header: TripHeader; samples: Sample[]; summary: TripSummary };
```

### Interfaces between streams (suggested, lock them at kickoff)

```ts
// Stream 2 produces this input, Stream 1 consumes it
export type RoutePoint = {
  lat: number; lon: number; elevation: number;
  speedLimit?: number;                 // m/s
  surface?: "asphalt" | "gravel" | "dirt" | "unknown";
  stop?: boolean;                      // traffic signal or stop sign here
};
export type SimulationInput = {
  route: RoutePoint[];
  driver: Driver;
  condition: Condition;
  regenEnabled: boolean;
};
// Stream 1 exports (lib/physics/index.ts):
export function simulateTrip(input: SimulationInput): Trip;

// Stream 2 exposes (app/api/):
//   GET /api/trips            -> TripHeader[]
//   GET /api/trips/[id]       -> Trip
//   GET /api/compare?ids=a,b  -> Trip[]
//   GET /api/trips/[id]/coach -> { tip: string; basedOn: string }

// Stream 3 exports:
//   <TripMap trip={Trip} theme="dark" | "bright" currentIndex={number} onIndexChange={(i:number)=>void} />
//   <TripCharts trip={Trip} currentIndex={number} onIndexChange={(i:number)=>void} />
```

### Theme CSS variable names (Stream 4 defines, Stream 3 reads)

`--regen-good`, `--regen-mid`, `--regen-bad`, `--regen-neutral`, plus the theme tokens in section 8. Never hard-code colors in components.

## 5. Working rules for every agent

1. Only edit files you own (section 3).
2. Never rename fields, change units, or add top-level folders.
3. Import types from `types/trip.ts`. Do not redefine them.
4. Code against `data/trips/sample.json` and the interfaces above. Do not wait for another stream, and do not build the other stream's part yourself.
5. Keep every tunable number in your stream's config, not scattered through code.
6. No API keys in the repo. Read them from environment variables.
7. Do not add dependencies. Ask the human.
8. Do not reformat files you did not write. Use the committed `.prettierrc`.
9. Label all driving data as **SIMULATED** in the UI, and label physics and savings numbers as **estimates**.
10. If anything here is unclear or two rules conflict, stop and ask the human. Do not guess.
11. Start each task by stating the plan and which files you will touch. Keep changes small.

### Git
- One branch per person, named for the stream (for example `stream-3-map`).
- Small commits. Pull and rebase from `main` before starting each task.
- Merge to `main` about every two hours. `main` must always run.
- Never force-push to `main`. Never commit `.env` files.
- Resolve lockfile conflicts by re-running the install, not by hand-editing.

## 6. Timeline

Hours are from kickoff. Scale them to the time left and keep the order.

| Phase | Milestone | Done when |
| --- | --- | --- |
| 1. Core loop (hours 0 to 8) | A simulated trip flows end to end: generator, JSON, map with colored route, score on screen | Smooth and aggressive trips show on the map with clearly different scores |
| 2. Wow features (hours 8 to 16) | Elevation chart, analysis panel, coaching tip, compare mode, condition selector, savings card | Compare mode shows conventional, smooth and aggressive on the same route |
| 3. Polish (hours 16 to 22) | Dark and Toyota bright themes, deploy, full test run | The deployed link works start to finish on a teammate's laptop |
| 4. Pitch (hours 22 to 24) | Backup demo video, roadmap slide, rehearsed 3-minute pitch | Pitch rehearsed twice, backup video saved locally |

## 7. Stream task lists

Work through your stream's list in order. Check items off in your branch's task notes. Do not do tasks from other streams.

### Stream 1: Physics and Scoring
**Goal:** given route points, a driver profile and conditions, produce a scored `Trip`.
**Needs from others:** route points from Stream 2 (use a hand-made route until then).
**Done when:** the three driver profiles give clearly different scores on the same route, and switching condition changes the result.

- [ ] Vehicle model function (pure TypeScript, unit-testable): forces on the car, regen and friction split
- [ ] Three driver profiles: smooth, aggressive, mixed
- [ ] Trip score: theoretical recoverable energy per route, score as actual regen divided by that
- [ ] Missed regen opportunities per segment, each with a cause
- [ ] Surface and weather: friction, rolling resistance and grip cap for dry, wet, snow, ice, gravel, mud
- [ ] Battery state of charge and temperature limits on regen
- [ ] Regen on/off switch (gives the conventional-car baseline)
- [ ] Savings module: gallons, dollars, CO2, brake wear avoided, money left on the table, annual projection
- [ ] One config file holding every tunable number

### Stream 2: Data and API
**Goal:** turn real roads, terrain and weather into cached input data, and serve trips to the front end.
**Needs from others:** Stream 1's `simulateTrip`. Early on, commit a hand-made sample trip so others can start.
**Done when:** trip JSON exists for three routes across driver profiles and conditions, and the app loads it with no live API calls.

- [ ] Repo skeleton, environment variables, API keys (Mapbox, Claude)
- [ ] Script that fetches routes from the Mapbox Directions API for three demo routes (hilly, flat, mixed)
- [ ] Resample each route to a point every 10 meters or so, read elevation, compute grade
- [ ] Road attributes: speed limit and road class from Directions, surface type and stops from Overpass
- [ ] Weather per route from Open-Meteo: rain, snow, temperature
- [ ] Cache every response as JSON in `data/cache/` so the demo does not depend on the network
- [ ] Trip generator script: runs `simulateTrip` for each driver and condition and writes trip JSON
- [ ] API routes: list trips, get one trip, compare trips
- [ ] AI coaching tip per trip using the Claude API, based on the trip data
- [ ] Optional: leaderboard or streak storage (Supabase, Postgres or a JSON file)

### Stream 3: Map and Charts
**Goal:** make the map the star of the demo, with a route that shows regen performance at a glance.
**Needs from others:** a sample trip from Stream 2, color variables from Stream 4's theme.
**Done when:** a trip replays on the map with colored segments, markers and a synced chart, in dark and bright mode, with no console errors.

- [ ] Map component with dark style (`mapbox://styles/mapbox/dark-v11`) and bright style (`light-v11`), tilted camera fitted to the route
- [ ] 3D terrain (`mapbox://mapbox.mapbox-terrain-dem-v1` with `setTerrain`), hillshade, contour lines from `mapbox://mapbox.mapbox-terrain-v2`
- [ ] 3D buildings (fill-extrusion), low opacity so the route stays the focus
- [ ] Route line with `line-gradient` (needs `lineMetrics: true`) plus a blurred copy underneath for glow
- [ ] Stop markers and missed-regen markers with click popups showing the cause
- [ ] Replay scrubber that moves along the route and the charts together
- [ ] Charts: elevation, speed, regen vs friction power on a shared time axis, cursor synced to the replay
- [ ] Switching theme swaps the map style and re-adds layers (use the `style.load` event)
- [ ] Optional: best downhill highlight, compare mode with two route lines

Color rule: per sample while braking, `capture = regenKw / (regenKw + frictionKw)`. Teal for 0.7 or more, amber for 0.35 to 0.7, rose below 0.35. Samples that are not braking use the neutral color. Mapbox style and tileset names above are best defaults, so verify them in Mapbox's docs if a layer does not load.

### Stream 4: UI, Theme and Pitch
**Goal:** make it feel like a finished product, and make the pitch land in three minutes.
**Needs from others:** trip data from Stream 2, map and chart components from Stream 3, savings numbers from Stream 1.
**Done when:** the app is deployed, both themes work, and the pitch has been rehearsed twice.

- [ ] Next.js (TypeScript) scaffold and Vercel deployment
- [ ] Theme tokens as CSS variables for dark and Toyota bright, with a header toggle that remembers the choice
- [ ] Score hero with expandable axis cards and an evidence drawer showing the data behind each number
- [ ] Terminal-style analysis panel with the coaching tip
- [ ] Savings card with gas price and trips per day sliders
- [ ] Condition selector: dry, wet, snow, muddy
- [ ] Compare mode layout with three columns: conventional, smooth, aggressive
- [ ] Backup demo video, roadmap slide, 3-minute pitch rehearsal

## 8. Reference: physics (mostly for Stream 1)

The route and terrain are real. The car is simulated second by second.

```
Force on the car:
  F = m*g*sin(theta) + C_rr*m*g*cos(theta) + 0.5*rho*C_d*A*v^2 + m*a

Regen and friction split when braking:
  P_regen = min( eta*P_brake, P_max, m*a_max*v, P_battery )
  P_friction = P_brake - P_regen
  a_max = mu*g*phi        (grip limit on the driven wheels)

Trip score:
  E_ceiling = eta * ( m*g*dh_descent + sum over stops of 0.5*m*v_stop^2 )
  Score = 100 * E_regen / E_ceiling
```

Friction braking while regen headroom was available counts as a **missed opportunity**, with a cause: late braking, low grip, full battery or cold battery.

| Parameter | Starting value | Notes |
| --- | --- | --- |
| Mass m | 1,650 kg | Camry hybrid, about 3,600 lb with driver |
| Rolling resistance C_rr | 0.010 | Typical passenger tires |
| Drag coefficient C_d | 0.28 | Approximate |
| Frontal area A | 2.2 m^2 | Approximate |
| Regen efficiency eta | 0.65 | Motor and battery round trip |
| Max regen power P_max | 30 kW | Real systems vary with speed and battery state |
| Weight on driven axle phi | about 0.6 | Front-wheel drive, weight shifts forward when braking |

| Surface | Friction mu | Rolling C_rr | Effect on regen |
| --- | --- | --- | --- |
| Dry asphalt | 0.8 | 0.010 | Full regen available |
| Wet asphalt | 0.5 | 0.012 | Grip cap bites on hard stops |
| Packed snow | 0.25 | 0.018 | Regen limited to gentle slowing |
| Ice | 0.1 | 0.015 | Almost no regen without sliding |
| Gravel | 0.5 | 0.020 | Moderate cap, higher energy loss |
| Wet mud | 0.25 | 0.040 | Low cap, high rolling loss |

All values are approximate teaching numbers, not Toyota specs or measurements. Keep them in `config/regen.config.ts` and label them as estimates in the UI.

Other effects, each a small multiplier or cap: battery state of charge (linear regen fade above about 80 percent), battery temperature (cut `P_battery` on freezing days), drivers braking earlier and softer in rain, air density and wind in the drag term, stability control shifting excess braking to friction brakes (cause "low grip").

Where conditions come from: weather from Open-Meteo (no key); surface type from the OpenStreetMap `surface` tag via the Overpass API (default untagged roads to asphalt); mud has no data source, so flag a segment as muddy when it is unpaved and it rained in the last 24 hours.

### Savings math

```
Gallons saved = E_regen[kWh] / (33.7 * engine_efficiency)     (engine efficiency about 0.30)
Dollars saved = Gallons saved * gas price                      (start near $3.00 per gallon)
CO2 avoided   = Gallons saved * about 8.9 kg
Annual        = trip result * trips per day * 365
```

Regen vs no-regen comparison: run the same route and driver through the same model with `regenEnabled: false`. Only one variable changes, so the difference is easy to defend.

## 9. Reference: data sources

| Source | Used for | Key |
| --- | --- | --- |
| Mapbox Directions API | Route geometry, distance, speed limit | Yes (free token) |
| Mapbox map and terrain | Dark style, 3D buildings, terrain, hillshade, contours | Same token |
| Open-Meteo | Weather (rain, snow, temperature), elevation backup | No |
| Overpass API (OpenStreetMap) | Surface type, traffic signals, stop signs | No |
| Claude API | Coaching tips | Yes |

Fetch Directions, Overpass and weather once, save the JSON, and run the demo from the saved files. Public Overpass servers can be slow or rate-limited, so never call them live during the demo.

## 10. Reference: theme tokens (Stream 4 defines, Stream 3 reads)

Dark mode (inspired by n-earshot):

| Token | Hex |
| --- | --- |
| Page background | `#0D1013` |
| Cards and panels | `#161A1F` (1px border, 14px radius) |
| Borders and gridlines | `#262C31` |
| Primary text | `#EEF0EE` |
| Secondary text | `#A9B1B4` |
| Muted labels | `#6F787D` |
| Accent, buttons | `#2FB3A4` (button text `#062521`) |
| Accent text, small caps labels | `#4CC5B6` |
| `--regen-good` | `#22A08F` |
| `--regen-mid` | `#C98500` |
| `--regen-bad` | `#D5516D` |
| `--regen-neutral` | `#6F787D` |

Bright mode (Toyota style, approximate, check Toyota brand guidelines for exact colors):

| Token | Hex |
| --- | --- |
| Accent and score highlight | `#EB0A1E` |
| Text and headings | `#1A1A1A` |
| Background | `#FFFFFF` |
| Panels and cards | `#F2F2F2` |
| Borders and gridlines | `#D0D0D0` |
| Good regen | `#1F9D55` |
| Missed regen | `#EB0A1E` |

Type: serif headings, clean sans body, monospace for numbers and the terminal panel. Use system font stacks so nothing needs downloading. Use light map tiles in bright mode and dark tiles in dark mode.

## 11. If we fall behind, cut in this order

1. Leaderboard and streaks
2. Best-regen route suggestion
3. Bright theme (keep dark)
4. EPA drive cycles and dynamometer comparison
5. Brake wear and fleet-view extras in the savings card

**Never cut:** compare mode, the condition toggle and the backup demo video.

## 12. Open decisions (the human team decides, not the agent)

- Real city (for example Austin) or a stylized fictional map
- Suggest best regen routes, or only score completed trips
- Who owns the repo, the package installs and the Vercel deployment
- Meta track social layer: parked until the core loop works
