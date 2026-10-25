# Brainstorm: more data worth simulating

Grouped by what it unlocks. Tick what the team wants and we add it to `generate.mjs`.

## Physics and driving
- [x] Driver style, braking decel, anticipation (coast fraction)
- [x] Passenger/cargo mass, tire rolling-resistance multiplier
- [x] Wind and air density (temperature, altitude)
- [x] Per-second samples matching `types/trip.ts` `Sample[]` (feed `simulateTrip` and the map)
- [x] Towing, roof racks, bike carriers (drag and mass)
- [x] Tire pressure drift and seasonal tire swaps (winter tires: more mu in snow, more Crr)
- [x] Speed-limit compliance, highway cruise speed per user (drag is v^2)
- [x] Cruise control vs manual, eco-mode usage

## Terrain and weather
- [x] Climb/descent per km by metro, monthly temperature, rain, snow, mud
- [ ] Real elevation profiles pulled from the cached Open-Meteo/Directions data per user route (blocked: `data/cache/` is Stream 2's and empty; `lib/samples.mjs` already accepts a `routeOverride`)
- [x] Ice and black ice separate from packed snow (needs a `Condition` change, ask the team)
- [x] Heat waves, AC load, battery thermal throttling above 35 C
- [x] Storm days that change trip counts (people drive less in blizzards)

## Cars
- [x] 19 cars across ICE, hybrid, PHEV, BEV with regen limits and EPA calibration
- [x] Brake system detail: pad life, rotor wear, replacement cost avoided by regen
- [x] Battery aging: capacity and regen power fade by age and climate
- [x] More Toyota trims (Camry LE/SE/XSE weights, AWD vs FWD, Crown, Highlander Hybrid, Grand Highlander)
- [x] Trim-level and option price variation, certified pre-owned prices, depreciation curves per model
- [x] Real DC-fast-charge curves and charging losses per EV

## Financial scanning
- [x] Fuel and EV charging card transactions with merchants and MCC codes
- [x] What-if 5-year cost per user across all cars
- [x] Monthly budget variance: fuel spending vs budget, price spikes
- [x] Insurance, registration, maintenance line items by car
- [x] Loan/lease terms (APR, remaining balance) so payback accounts for negative equity
- [x] Tax credits and state EV incentives by region and income band
- [x] Gas price volatility scenarios ($2.50 / $4 / $6) to stress-test the recommendation
- [x] Electricity time-of-use rates for home charging
- [x] Fuel-card/loyalty discounts, station price dispersion
- [x] Bank-statement noise: refunds, car washes, tolls, parking, rideshare (false positives for the classifier)

## Behavior and recommendation signals
- [x] Price sensitivity, home charger access, commute length, work days
- [x] Annual mileage drift, job change, moving to a new region
- [x] Trip purposes mix and how often the user takes long highway trips (range anxiety)
- [x] Charging access: apartment, workplace charger, none
- [x] Preferences: body style, brand, budget cap, towing need
- [x] Coaching history: score per week, improvement after tips, streaks

## Quality and evaluation
- [x] Ground-truth labels: "best car for this user" computed with full cost model, to score recommenders
- [x] Edge-case users: tiny mileage, huge mileage, all-highway, all-stop-and-go, mountain commute
- [x] Noise knobs: missing data, duplicate transactions, odometer rollbacks
- [x] Larger user counts and a full 365-day mode (currently 4 two-week windows)

## Next ideas
- [ ] Lease option in the what-if (residual value, mileage caps)
- [ ] Per-user route files so the same commute repeats exactly across days
- [ ] Second-hand battery degradation in used EV options
- [ ] Import a real bank CSV and score the classifier against `noisy/` + clean pairs
