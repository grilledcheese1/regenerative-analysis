# Hackathon Plan: Regen Coach (Toyota Track)

## Concept

Web app that replays simulated hybrid drives on a dark topographic map, scores regenerative braking efficiency, and coaches the driver. Pitch angle: today's demo uses simulated JSON, the roadmap leads to real Toyota vehicle integration.

## Tech Stack

- [ ] Next.js (TypeScript) for frontend and API routes
- [ ] Supabase or Postgres for trips and leaderboard (optional, JSON files are fine to start)
- [ ] Mapbox GL JS with dark style, 3D buildings and terrain for the map
- [ ] Recharts or Chart.js for the elevation and regen graphs
- [ ] Claude API for the coaching tips
- [ ] Vercel for deployment

## APIs

- [ ] Open-Meteo Elevation API for route elevation
- [ ] Mapbox Terrain or Directions API (optional, for routing between two points)
- [ ] Claude API for LLM coaching text

## Data Format (per trip JSON)

- Header: trip id, driver label (smooth / aggressive / mixed), vehicle, start time, total distance
- Samples array, about one per second: time offset, lat, lon, speed, elevation, brake pressure, regen power in kW, optional state of charge
- Server computes: grade, energy recovered, missed regen opportunities, trip score

## Vehicle Model and Scoring

The route and terrain are real (coordinates plus Open-Meteo elevation); the car is simulated second by second with a simple physics model, since Toyota does not publish Camry regen telemetry.

Force on the car at each sample, with grade from the elevation change:

```math
F_{total} = m g \sin\theta + C_{rr} m g \cos\theta + \tfrac{1}{2} \rho C_d A v^2 + m a
```

When the driver brakes, the braking power splits between regen and friction brakes:

```math
P_{regen} = \min(\eta \cdot P_{brake},\ P_{max}), \qquad P_{friction} = P_{brake} - P_{regen}
```

- Driver profiles (smooth, aggressive, mixed) set target speed, how early they lift off, and how hard they brake.
- Friction braking while regen headroom was available = a missed opportunity, shown on the map and in the terminal panel.
- Everything is tunable in one config file, so the numbers can be adjusted without touching code.

Trip score = actual regen divided by the theoretical recoverable energy for that route (descents plus kinetic energy at each stop):

```math
E_{ceiling} = \eta \left( m g\, \Delta h_{descent} + \sum_{stops} \tfrac{1}{2} m v_{stop}^2 \right), \qquad Score = 100 \cdot \frac{E_{regen}}{E_{ceiling}}
```

| Parameter | Starting value | Notes |
| --- | --- | --- |
| Mass `m` | 1,650 kg | Camry hybrid, about 3,600 lb with driver |
| Rolling resistance `C_rr` | 0.010 | Typical for passenger tires |
| Drag coefficient `C_d` | 0.28 | Approximate, tunable |
| Frontal area `A` | 2.2 m² | Approximate, tunable |
| Regen efficiency `η` | 0.65 | Motor and battery round trip |
| Max regen power `P_max` | 30 kW | Tunable; real systems vary with speed and battery state |

All values above are approximate starting assumptions, not official Toyota specs.

- [ ] Write the vehicle model function (TypeScript, pure and unit-testable)
- [ ] Implement the three driver profiles
- [ ] Compute ceiling energy and trip score per route
- [ ] Flag missed regen opportunities per segment

## Road Surface and Weather Physics

Regen only works through the tires, so the grip of the road caps how hard the car can recover energy. On a wet or muddy road the cap drops, more braking falls to the friction brakes, and the trip score should show it.

The driven wheels can only carry as much braking force as the tires can grip. Add a grip limit to the regen formula from the vehicle model:

```math
a_{regen,max} = \mu \, g \, \varphi, \qquad P_{regen} = \min\left(\eta P_{brake},\ P_{max},\ m\, a_{regen,max}\, v,\ P_{battery}\right)
```

Here `μ` is the tire-road friction coefficient, `φ` is the share of the car's weight on the driven axle while braking (about 0.6 for a front-wheel-drive Camry, because weight shifts forward), and `P_battery` is what the battery can accept at that moment.

| Surface | Friction `μ` | Rolling resistance `C_rr` | Effect on regen |
| --- | --- | --- | --- |
| Dry asphalt | 0.8 | 0.010 | Full regen available |
| Wet asphalt | 0.5 | 0.012 | Grip cap bites on hard stops |
| Packed snow | 0.25 | 0.018 | Regen limited to gentle slowing |
| Ice | 0.1 | 0.015 | Almost no regen without sliding |
| Gravel | 0.5 | 0.020 | Moderate cap, higher energy loss |
| Wet mud | 0.25 | 0.040 | Low cap, high rolling loss |

These values are rough teaching numbers, not measurements. Keep them in the config file so they can be tuned, and label them as estimates in the UI.

Other effects worth modeling, each a small multiplier or cap:

- **Battery state of charge:** a nearly full battery accepts less charge, so regen drops. Start with a linear fade above about 80% charge.
- **Battery temperature:** cold batteries accept less regen, so cut `P_battery` on freezing days.
- **Rain and driver behavior:** drivers brake earlier and softer in rain, so the driver profiles get a wet-weather speed reduction.
- **Air density and wind:** colder air is denser and raises drag; add a headwind or tailwind component to the drag term.
- **Stability control:** when the model detects slip (demanded braking above the grip cap), it shifts the excess to friction brakes, which counts as a missed opportunity with the cause labeled "low grip".

Where the conditions come from:

- **Weather:** Open-Meteo gives rain, snow and temperature for the route and time, with no key needed.
- **Surface type:** the OpenStreetMap `surface` tag (asphalt, gravel, dirt) from the Overpass API.
- **Mud:** no direct data source, so flag a segment as muddy when its surface is unpaved and it rained in the last 24 hours.

Demo toggles: a condition selector (dry, wet, snow, muddy) in the header, so judges can flip conditions and watch the score, recovered energy and map colors change on the same trip.

- [ ] Add `μ`, `C_rr` and grip cap to the vehicle model config
- [ ] Add battery state of charge and temperature limits
- [ ] Surface and weather lookup per route segment (Overpass and Open-Meteo)
- [ ] Condition selector with live re-scoring
- [ ] Label missed regen with its cause: late braking, low grip, full battery, cold battery
- [ ] Coaching tips that adapt to conditions, for example "brake earlier in the wet"

## Map and Road Data

The map is Mapbox GL JS with a dark style, 3D buildings, and real terrain. Routes follow real roads, and each road segment carries the attributes the physics needs.

Build each trip in this order:

1. Pick start and end points for three demo routes in one city: a hilly route, a flat city route, and a mixed one.
2. Ask the Mapbox Directions API for the route. It returns the road geometry plus per-segment distance and speed limit.
3. Resample the geometry to a point every 10 meters or so.
4. Read elevation at each point from the terrain data, then compute grade from the change in elevation.
5. Attach road attributes: speed limit and road class from Directions, surface type from OpenStreetMap, and stop locations (traffic signals and stop signs) from the Overpass API.
6. Run the vehicle model with a driver profile and weather condition, and write the result as the trip JSON.
7. Draw the trip on the map, colored by regen efficiency per segment.

Map layers:

| Layer | Source | Purpose |
| --- | --- | --- |
| Dark base style | Mapbox Dark style | Matches the dark theme |
| 3D buildings | Building data with a fill-extrusion layer | City skyline look from the reference app |
| 3D terrain | Mapbox terrain elevation data with `setTerrain` | Real hills under the roads |
| Hillshade and contour lines | Hillshade layer and Mapbox terrain contour tileset | The topographic look |
| Route line | GeoJSON line layer with `line-gradient` and a blurred copy underneath | Glowing route colored teal, amber or rose |
| Stop markers | Circle layer from Overpass signals and stop signs | Shows where kinetic energy can be recovered |
| Missed regen markers | Circle layer from the scored trip | Click to see the cause (late braking, low grip, full battery) |

Time-saving decisions:

- Fetch Directions, Overpass and weather responses once, save them as JSON files in the repo, and run the demo from those files, so Overpass or wifi problems cannot break it. The map tiles still need internet, which is why the backup demo video matters.
- Use the Map Matching API only if you add real GPS traces later; the simulated trips already follow the road geometry.
- Keep tokens in environment variables and restrict the Mapbox token to your deployed domain.

- [ ] Create a Mapbox account and a public access token
- [ ] Map component: dark style, 3D buildings, terrain, hillshade, contours
- [ ] Script that fetches and caches Directions, Overpass and weather data for three routes
- [ ] Resample, elevation and grade step in the trip generator
- [ ] Route line with gradient coloring and glow
- [ ] Stop and missed-regen marker layers with click popups

## Driver Savings Estimator

Every trip converts recovered kWh into gallons, dollars and CO2, so the dashboard answers "what is this worth to me?" and not just "what is my score?"

One gallon of gasoline holds about 33.7 kWh of energy, and an engine turns roughly 30% of that into motion, so one gallon replaces about 10 kWh of useful work:

```math
Gallons_{saved} = \frac{E_{regen}\ [kWh]}{33.7 \times \eta_{engine}}, \qquad Dollars_{saved} = Gallons_{saved} \times P_{gas}
```

| Metric | How it is computed | Shown as |
| --- | --- | --- |
| Fuel saved | Regen kWh divided by useful kWh per gallon | Gallons per trip |
| Money saved | Gallons saved times gas price | Dollars per trip, month and year |
| CO2 avoided | Gallons saved times about 8.9 kg CO2 per gallon (EPA figure) | kg per trip and per year |
| Brake wear avoided | Share of braking energy handled by regen instead of friction | Percent of braking, plus an estimated pad-life gain |
| Money left on the table | Missed regen opportunities converted to dollars | "You could have saved $X" |
| Annual projection | Trip result times trips per day times 365 | Dollars and gallons per year |

Tunable inputs for the demo: gas price (start near $3.00 per gallon, Texas), engine efficiency (0.30), and trips per day. Add a slider so judges can change the gas price or commute length and watch the savings update.

Extra ideas if time allows:

- A "smooth driver vs aggressive driver" annual savings gap, which is a strong one-number pitch.
- A fleet view: savings multiplied across 100 or 1,000 drivers, aimed at Toyota fleet customers.
- A brake-pad replacement reminder that shifts later the better the driver scores.

All conversion figures are approximations for a demo, so label them as estimates in the UI.

- [ ] Savings calculation module (gallons, dollars, CO2)
- [ ] Savings card in the trip panel with gas price and trips per day sliders
- [ ] "Money left on the table" line tied to missed opportunities
- [ ] Annual projection for smooth vs aggressive

## Regen vs No-Regen Comparison

The cleanest comparison is the same trip run through the same physics model with regen switched off, which acts as a conventional car baseline. Only one variable changes, so the difference is easy to defend in front of judges.

| Baseline | What it is | Why it helps |
| --- | --- | --- |
| No-regen replay | Same route and driver, regen power forced to 0 so all braking goes to friction | Shows exactly what regen is worth on that trip |
| EPA drive cycles | Replay the public UDDS (city) and HWFET (highway) speed traces over your terrain | Uses standard, recognized test data, so the comparison is not just your own simulation |
| Public dynamometer data | Real vehicle test data, for example from the Argonne National Laboratory dynamometer database; check which vehicles it covers | A real-world reference to sanity-check the model; optional and only if time allows |

Side-by-side view in compare mode, one column each for conventional car, hybrid with smooth driver, and hybrid with aggressive driver:

| Metric | Unit |
| --- | --- |
| Energy recovered | kWh |
| Energy lost as brake heat | kWh |
| Fuel used | gallons |
| Fuel cost | dollars |
| CO2 emitted | kg |
| Share of braking handled by regen | percent |
| Efficiency score | 0 to 100 |

Pitch line: "Same road, same trip: regen recovers X kWh that a conventional car throws away as heat, and good driving captures Y% more of it." Fill X and Y from the app's output, never from guesses.

- [ ] Regen on/off switch in the vehicle model
- [ ] Compare mode with three columns (conventional, smooth, aggressive)
- [ ] Optional: load the EPA UDDS and HWFET speed traces as extra sample trips
- [ ] Optional: check Argonne dynamometer data for a real reference point

## Design and Theming

Two themes sharing one component set: a dark data-console mode modeled on [n-earshot](https://n-earshot.com/), and a bright mode in Toyota brand colors. A single toggle in the header switches them, and all colors live in CSS variables so the swap is one class change.

What to borrow from n-earshot's layout and patterns:

| n-earshot pattern | Regen Coach version |
| --- | --- |
| One big score with a plain-word label ("77/100, Noticeably noisy") | Trip score with a label like "Efficient" or "Leaving energy on the road" |
| Seven axes behind the score, each expandable to its evidence | Axes such as descent capture, stop capture, brake smoothness, speed discipline; click one to see the exact samples behind it |
| "Every number shows its work" | Click any metric to open the raw segment data and the formula used |
| Hour-by-hour profile chart | Trip timeline: speed, elevation and regen power stacked on one time axis |
| Toggles that re-score live (floor and facing direction) | Driver profile toggle (smooth, aggressive, mixed) that re-scores instantly |
| AI write-up credited "written by Claude from the evidence" | Coaching tip with the same credit line and the data it was based on |
| Numbered section labels and small uppercase tags | "01 · Map", "02 · Analysis", "03 · Compare", with tags like SIMULATED DATA |
| Wordmark with a styled syllable and a dot | Logo with a pulsing dot that doubles as the live-replay indicator |

Dark mode palette, read from n-earshot's live page styles on Oct 23, 2026 and converted to hex:

| Role | Hex | Notes |
| --- | --- | --- |
| Page background | `#0D1013` | Near-black with a cool tint |
| Cards and panels | `#161A1F` | 1px border, 14px corner radius |
| Borders and gridlines | `#262C31` | Used on almost every card |
| Primary text | `#EEF0EE` | Off-white, not pure white |
| Secondary text | `#A9B1B4` | Body copy |
| Muted labels | `#6F787D` | Captions and small print |
| Accent, buttons | `#2FB3A4` | Teal; button text is `#062521`, 12px radius |
| Accent text, small caps labels | `#4CC5B6` | Lighter teal |
| Good segment | `#22A08F` | Low end of the site's score scale |
| Middle segment | `#C98500` | Amber |
| Bad segment | `#D5516D` | Rose |
| Chart gridlines | `#2A343E` | Thin strokes in the SVG charts |

The site colors its score scale with a teal to amber to rose gradient, so reuse it for regen: teal means energy captured, amber partial, rose missed.

Type and shape: headings use a serif stack (Iowan Old Style, Palatino, Georgia) at weight 600, body text uses Avenir Next with Segoe UI and system fallbacks, and small labels and numbers use SF Mono or the system monospace in uppercase with about 2px letter spacing, in the lighter teal. All of these are system font stacks, so nothing needs to be downloaded.

Bright mode, Toyota-style (hex values are approximate; check Toyota's brand guidelines if you want exact matches):

| Role | Color | Hex |
| --- | --- | --- |
| Primary accent and score highlight | Toyota red | `#EB0A1E` |
| Text and headings | Near black | `#1A1A1A` |
| Background | White | `#FFFFFF` |
| Panels and cards | Light gray | `#F2F2F2` |
| Borders and gridlines | Mid gray | `#D0D0D0` |
| Good regen segments | Green | `#1F9D55` |
| Missed regen segments | Red | `#EB0A1E` |

Use a clean sans-serif such as Inter for bright mode and keep monospace for numbers and the terminal panel in both modes. Use white map tiles in bright mode and dark tiles in dark mode.

- [ ] Define theme tokens as CSS variables (dark and Toyota bright)
- [ ] Header toggle that persists the choice in local storage
- [ ] Swap map tiles with the theme
- [ ] Score hero with expandable axis cards and an evidence drawer
- [ ] Add the dark palette above as CSS variables, with the teal to amber to rose scale for regen segments

## Build Order (24 hours)

### Phase 1: Core loop (hours 0 to 8)

- [ ] Scaffold Next.js app and hacker theme (dark, monospace, neon)
- [ ] Write a script to generate 3 sample trips: smooth, aggressive, mixed
- [ ] API route to load a trip and compute score and missed opportunities
- [ ] Map view with route colored by regen efficiency

### Phase 2: Wow features (hours 8 to 16)

- [ ] Elevation profile graph under the map
- [ ] Terminal-style trip analysis panel
- [ ] LLM coaching tip after each trip
- [ ] Compare mode: smooth vs aggressive side by side

### Phase 3: Polish (hours 16 to 22)

- [ ] Theme switcher: dark n-earshot-style mode and bright Toyota mode (see Design and Theming)
- [ ] Optional leaderboard or streaks
- [ ] Optional best-regen route suggestion between two points
- [ ] Deploy to Vercel and test the demo flow

### Phase 4: Pitch (hours 22 to 24)

- [ ] Record a backup demo video in case of wifi issues
- [ ] Prepare roadmap slide: simulated JSON, then phone app, then Toyota integration
- [ ] Rehearse a 3 minute pitch

## Risks and Cuts

- If behind schedule, cut the leaderboard, route suggestions, and extra themes first
- Keep compare mode, because it is the money shot
- CarPlay has limited app categories, so frame it as a long-term vision, not a promise

## Open Questions

- Real city (like Austin) or stylized fictional map?
- Actively suggest best regen routes, or only score completed trips?
- Map library: decided on Mapbox GL JS, which needs a free access token
