# Next Move: product definition, path to a real product, and vehicle recommendations

Working doc for the team and for Claude Code. `AGENTS.md` wins if anything here conflicts with it. Everything in the demo is **SIMULATED** and every number is an **estimate**.

## 1. What the product does

Question it answers (Toyota Financial Services track): **"Given my situation today, what's the smartest next move for me and my Toyota?"**

A customer whose lease or loan is changing sees:
1. Where they stand (payment, months left, miles over allowance, fees).
2. Their real commute and how their car performs on it.
3. Every way to handle the end of the contract, side by side, in plain language.
4. What a hybrid would save them (gas, brake wear, CO2), shown with the facts behind it.
5. **One recommended vehicle and financing plan**, with a clear next step (get a quote, talk to a rep, send my plan).

**Why driving data matters:** any lender can show payments. Only this app can say "on your hilly route a hybrid saves about $X a year on gas and wears your brakes Y% less". That makes the recommendation personal and checkable.

Judging criteria it maps to: Personalize (their contract, route, driving style), Simplify (plain-language options), Guide (one recommended step), Value (retention, hybrid upsell, fewer "what's my buyout?" calls).

## 2. From synthetic telemetry to a real product

The model's inputs are speed, road grade, braking and location. Only the data source changes.

| Stage | Data source | Notes |
| --- | --- | --- |
| Demo (now) | Simulated drives on real Austin roads and terrain | No new work |
| Phase 1 | Phone app: GPS, motion sensors, map elevation | Regen is not directly visible. Infer braking from deceleration, then run the physics model. Lower accuracy. |
| Phase 2 | OBD-II dongle | Real speed, brake and battery signals. Also calibrates the phone estimate. |
| Phase 3 | Toyota connected-vehicle data, with customer consent | Needs a partnership. This is the "real Toyota data later" pitch line. |

Required before real data is trusted:
- **Calibrate** the physics model against real hybrids. Toyota does not publish regen telemetry.
- **Consent and privacy**: say plainly what is collected and why. Collect the minimum. Let the customer delete it.
- **Show uncertainty**: ranges ("about $600 to $800 a year"), not false precision.
- **Fairness**: do not use driving data to deny or price credit unless it is reviewed for fairness. In this product it only informs advice and offers.

Value to the business: predict mileage overage and equity before lease end, keep the customer, and make a hybrid or service-plan offer backed by their own driving.

## 3. Vehicle models: where the data comes from

| Need | Source | Notes |
| --- | --- | --- |
| Specs, mpg, annual fuel cost | fueleconomy.gov web services (free, no key) | Verify current endpoints before relying on them |
| Model lists | NHTSA vPIC API (free) | Good for make/model/year names |
| MSRP and used pricing | The hackathon's suggested datasets (Car Features and MSRP, used-car pricing) | Check the track's data page |
| Already in the repo | `simulated_user_data/reference/vehicles.seed.json` | 39 cars: prices, mpg, brake service cost, depreciation class. Use first. |
| Per-user best car | `simulated_user_data/ground_truth/best_car.json`, `what_if/what_if_matrix.json` | Ranked options with 5-year cost |
| Images | Wikimedia Commons (check each license), or consistent illustrations or silhouettes drawn for the demo | Do not copy Toyota's marketing photos without permission. Mismatched photos look worse than one consistent illustrated style. |

Start with 6 to 8 Toyota models that matter for the demo: Camry Hybrid, RAV4 Hybrid, Prius, Corolla Hybrid, Highlander Hybrid, Crown. Mark prices as simulated estimates.

## 4. Feature: vehicle and financing recommendations

### What the customer sees
- **One hero card: "Recommended for you"**: large vehicle image, model and trim, monthly cost, 3-year total including fuel, mpg, and a one-line reason that uses her data ("Your hills give this hybrid long downhill stretches that recharge the battery").
- **Two or three compact alternatives**: same fields, smaller. At least one is not the cheapest, so the customer sees a real trade-off (space, newer car, lowest monthly).
- **Add-on row** under the hero (only when relevant): a brake service plan if she brakes hard, GAP coverage if she has negative equity, and similar. Each has a price and a plain reason.
- **"Why we said this"** line and a collapsed facts drawer, as on every other recommendation.
- Next step buttons: Get your quote, Talk to a rep, Send my plan.

### How a vehicle is chosen (pure functions, no UI)
1. Filter by the customer's preferences: budget cap, body style, towing, excluded makes.
2. Score each by 3-year total cost including fuel, brake wear and monthly payment.
3. Boost fit signals: commute terrain, stop-and-go share, annual miles.
4. Return the top 3 with a reason string per vehicle built from real numbers.
   The recommendation must change when the gas-price and miles sliders change. At least one persona should not get "buy out your lease".

### Honest labeling
"Based on simulated data and estimates. Not a Toyota offer, quote or credit decision." Put it on every recommendation screen.

## 5. UI refresh (the page currently feels bland)

Findings on `/move/[customerId]` (branch `NewpPagesTst`): cream page, text-only, no vehicle or imagery, options as a 9-row text list, recommendation as a paragraph. The map did not render in the test browser because it had no WebGL, so check it separately.

Direction:
- Make the recommended vehicle the hero. Open with the commute map, with the car and offer overlaid.
- One confident accent color, larger numbers, tighter spacing, fewer empty bands.
- Replace the 9-row list with the hero plus 2 to 3 compact cards. Keep "Show all combinations" collapsed.
- Keep serif headings, system sans body, and colors only from CSS variables. Mobile first, 16px gutters, keyboard accessible.
- Do not hide facts behind animation. Respect reduced motion.

## 6. Bugs and data issues found (fix first)

1. **Peer rank label is misleading.** It says "Top 78%" while also saying Maria's score is 53 and the middle score is 78. A below-median score should read "better than X%" or "bottom half". Rewrite the copy and the calculation.
2. **Landing page sample size.** The cards show "11 smooth, 8 mixed, 7 aggressive" (26 drivers) but the scores 87, 69 and 38 come from the 18 drivers with coaching files (8, 5, 5). Fix the label or the sample.
3. **Two customer models.** `NewpPagesTst` uses `src/lib/customers` (Maria, Dev, Sam, Lena). `origin/main` uses `src/fixtures/personas.ts` (Maria, Devon, Kai) in integer cents. Pick one source before adding more.
4. **Branch is 7 commits behind `origin/main`**, and the home page differs (`/` here, `/next-move` on main). Merge main first.

## 7. Build order

1. Merge `origin/main` into the working branch. Decide the one persona source.
2. Fix the peer-rank copy and the sample-size label.
3. Vehicle catalog file (6 to 8 Toyotas) built from `vehicles.seed.json`, with an image path per model.
4. Recommendation functions plus unit tests (Maria first).
5. Hero card, alternatives and add-on row.
6. Restyle the page, then a phone and keyboard pass.
7. Backup demo video.

## 8. Do not build now

Real credit decisions or pulls, real Toyota data, real payments, accounts, a leaderboard.

## 9. Open questions

- Which 6 to 8 models, and where do the images come from?
- Which add-ons are worth showing, and are their prices simulated or sourced?
- Which persona source wins (`src/lib/customers` or `src/fixtures/personas.ts`)?
- Who owns the merge from `main`?
