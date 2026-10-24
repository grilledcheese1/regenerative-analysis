# simulated_user_data

Everything in this folder is **SIMULATED**. Physics and cost numbers are **estimates** (teaching values, not manufacturer specs or measurements).

Purpose: a realistic, randomized dataset of drivers, cars, terrain, weather and money that
1. exercises the regen physics model (Stream 1) with varied inputs,
2. gives the demo UI believable users, plus ready-made `Trip` files for the map and compare mode,
3. powers **financial scanning**: card transactions, monthly budgets, and a what-if / best-car ground truth for a recommender.

> This is a new top-level folder requested directly by the user. It touches no stream-owned path in `AGENTS.md`, and nothing in app code imports it yet. `types/trip.ts` is not modified: ice is an extra `surfaceDetail`, and `condition` stays `dry|wet|snow|mud`.

## Run

```
cd simulated_user_data
node generate.mjs [seed] [users] [flags]    # defaults: 42 20  (plus 6 edge-case users)
node validate.mjs                           # checks Trip files against the types/trip.ts contract
```

| Flag | Effect |
| --- | --- |
| `--full-year` | all 365 days instead of four 14-day windows (60 users is about 190 MB) |
| `--noise=off\|low\|med\|high` | error rate of the `noisy/` copies (default `med`) |
| `--no-edge` | skip the 6 edge-case archetype users |
| `--samples=N` | per-second sample trips per user (default 3) |

No dependencies. Same seed and flags give identical output. Default output is about 20 MB.

## Layout

```
reference/        hand-edited inputs (+ vehicles.json, generated)
  vehicles.seed.json   39 cars: ICE, hybrid, PHEV, BEV; trims, regen limits, EPA, prices, insurance,
                       maintenance, brake service, tow capacity, charge curves, depreciation class
  regions.json         10 metros: terrain, monthly climate, gas/power prices, registration, incentives
  surfaces.json        dry / wet / snow / mud (+ ice as a detail)
  driver_profiles.json, road_types.json, constants.json
  depreciation.json    retained-value curves by class
  incentives.json      federal credit scenarios (base = $0, restored_credit what-if)
  stations.json        gas brands with price offsets and bank-statement name variants, chargers, loyalty
lib/                    physics.mjs (trip model), samples.mjs (per-second sim), rng.mjs, data.mjs
users/                  user_NNN.json profiles + users_index.json
trips/                  per-user trip logs: inputs + physics results
transactions/           fuel, EV charging, insurance, loan, registration, maintenance, noise lines
finance/                monthly budget vs spend, price spikes, annual fixed costs
odometer/               odometer readings over time
coaching/               26-week regen score history, tips, streaks (regen-capable cars only)
samples/                valid types/trip.ts Trip files (5 s resolution)
  compare/              hill / flat / mixed routes x smooth|mixed|aggressive x dry|wet|snow|mud + conventional
what_if/                every user's trips replayed through all 39 cars
ground_truth/           best-car labels from a full 5-year cost model, per gas-price and incentive scenario
noisy/                  copies of transactions, trips and odometer with realistic data-quality problems
MANIFEST.json, DATA_DICTIONARY.md, BRAINSTORM.md
```

## How the numbers are produced

Per trip, `lib/physics.mjs` runs an aggregate version of the AGENTS.md physics:

- Wheel demand = rolling resistance (tires, pressure drift, surface) + aero drag (air density from temperature and altitude, wind, roof rack, trailer) + climb + stop kinetic energy, minus downhill coasting.
- Regen capture is a product of limits; each lost slice becomes a `MissedCause`:
  - **late braking**: regen power cap (reduced by battery age) and max regen decel vs how hard the driver brakes
  - **low grip**: `mu * g * drivenAxleWeight * 0.6` vs braking decel (the 0.6 is stability-control margin, our addition)
  - **full battery**: linear SOC fade above 80%, plus hot-battery throttling above 35 C
  - **cold battery**: cut below 15 C, worst below freezing
- `regenScore = 100 * regenRecovered / energyCeiling`, as in the Trip contract. ICE cars get `null`.
- Energy = (wheel demand - regen) / efficiency + HVAC + idle. Efficiency is **calibrated per car** so a reference trip reproduces its EPA mpg or mpge. PHEVs split by the user's plug-in habit.
- `regenSavings` and `brakeWearAvoidedUsd` rerun the same trip with regen off, so only one variable changes.

`lib/samples.mjs` runs the same physics second by second (accelerate, cruise, brake to stops, dwell) and writes `Trip` files whose summaries come from the full-resolution run. They agree with the aggregate model in direction, not to the decimal.

## What the generator randomizes

Region and climate, heat waves and cold snaps, storm days (fewer trips), rain / snow / ice / mud, terrain per km (mountain override), road mix and stop density, driver style, cruise control and eco mode, highway cruise speed, tires (summer / all-season / seasonal winter), tire pressure drift, passengers and cargo, roof racks, trailers, battery age, charging access and price plan (flat or time-of-use), loan terms, insurer, registration month, fuel loyalty, income band, car preferences, job changes and moves mid-year, and annual mileage drift.

## Known simplifications

- Trips are aggregates; per-second data exists only for the files in `samples/`.
- Route geometry and elevation are synthetic. `lib/samples.mjs` accepts a `routeOverride` with real `{lat, lon, elevation}` points; wiring it to real routes needs Stream 2's `data/cache/`, which does not exist yet.
- Default mode samples four 14-day windows (Jan, Apr, Jul, Oct 2026) and multiplies by `365 / 56`. Use `--full-year` for exact annual figures.
- Calibration folds model error into `engineEff` / `driveEff`; they are not real engine or motor efficiencies. EV and PHEV `driveEff` is wall-to-wheel.
- Incentives, registration and insurance numbers are placeholders. The US federal EV credit is modeled as expired in `base`.
- The what-if TCO ignores resale-market swings, repairs beyond the maintenance average, and used-car battery wear (used options reuse new-car energy).
