# Data dictionary

Units: metres, seconds, m/s, kW, kWh, degrees C, USD, kg. SIMULATED / estimates.

## reference/vehicles.json
| Field | Meaning |
| --- | --- |
| `id`, `make`, `model`, `trim`, `year`, `body`, `drivetrain` | identity (`fwd`, `rwd`, `awd`, `4wd`) |
| `powertrain` | `ice`, `hybrid`, `phev`, `bev` |
| `massKg`, `cd`, `frontalAreaM2`, `crr` | curb mass incl. driver, drag coefficient, frontal area, rolling resistance |
| `regenEta`, `maxRegenKw`, `maxRegenDecel`, `drivenAxleWeight` | regen round-trip efficiency, power cap, regen-only decel limit (m/s2), weight share on driven wheels |
| `tankGal`, `batteryKwh`, `evRangeKm`, `rangeKm` | capacities and range (`rangeKm` for BEVs, derived from EPA mpge) |
| `idleGalPerHour`, `epa` | idle burn; `gasMpg`, `mpge` or `elecKwhPer100Mi` used for calibration |
| `msrpUsd`, `depreciationClass`, `cpoPremium` | price and resale curve (reference/depreciation.json) |
| `insuranceBaseUsdPerYear`, `maintenanceUsdPerYear` | base running costs |
| `brakeServiceUsd`, `brakeLifeFrictionKwh` | cost of a brake job and the friction energy a pad set absorbs |
| `towingCapacityKg` | tow rating |
| `charging` | `acKw`, `acEfficiency`, `dcPeakKw`, `dcEfficiency`, `dcCurve[{soc,kw}]` (BEV/PHEV) |
| `engineEff`, `driveEff` | calibrated fuel-to-wheel and wall-to-wheel efficiency |

## reference/regions.json
`terrain.gainPerKmMean/Sd`, `tempMeanC[12]`, `tempSdC`, `pRain[12]`, `pSnow`, `unpavedShare`, `gasUsdPerGal`, `elecUsdPerKwh`, `registration {annualUsd, evFeeUsd}`, `insuranceFactor`, `incentives {stateEvUsd, incomeCapUsd}`, `salesTaxRate`. Top level: `touRateMultipliers`, `workplaceChargeUsdPerKwh`, `publicL2UsdPerKwh`, `publicFastChargeUsdPerKwh`, CO2 factors.

## users/user_NNN.json
| Field | Meaning |
| --- | --- |
| `archetype` | `typical`, `tiny_mileage`, `huge_mileage`, `all_highway`, `stop_and_go`, `mountain`, `heavy_tow` |
| `commute`, `longTripRate` | one-way km, work days, road mix; long trips per week |
| `vehicle` | `vehicleId`, `ageYears`, `odometerKm`, `estimatedValueUsd`, `batteryHealth` (0-1, null for ICE) |
| `driver` | `style`, `jitterDecelMs2`, `usesCruiseControl`, `ecoMode`, `highwayCruiseMs`, `speedLimitMs` |
| `load` | `typicalExtraMassKg`, `crrMult`, `unpavedShare`, `roofRack`, `towing {perLongTripProb, trailerMassKg, cdaAddM2}` |
| `tires` | `type` (`all_season`, `summer`, `winter_seasonal`), `pressureDriftPct` |
| `charging` | `access` (`home`, `workplace`, `apartment_shared`, `none`), `mix`, `touPlan`, `offPeakShare`, `plugInHabit` |
| `income` | `band`, `householdUsd` |
| `preferences` | `bodyStyles`, `excludeMakes`, `budgetCapUsd`, `needsTowingKg`, `minRangeKm` |
| `finance` | `fuelBudgetUsdPerMonth`, `priceSensitivity`, `insurer`, `insuranceUserFactor`, `registrationMonth`, `loyalty`, `loan {lender, aprPct, termMonths, monthsRemaining, monthlyPaymentUsd, balanceUsd}` |
| `annualDrift`, `lifeEvents` | mileage multiplier per year; `job_change` (from Jul) and `move` (from Oct) |
| `terrainOverride`, `stopDensityMult` | present on mountain and stop-and-go archetypes |

## trips/user_NNN_trips.json -> trips[]
- Top: `tripId`, `userId`, `vehicleId`, `regionId`, `date`, `startHour`, `purpose` (`commute_am`, `commute_pm`, `errand`, `leisure_long`), `towing`, `gasPriceUsdPerGal`.
- `weather`: `tempC`, `precipMm`, `snow`, `rainedLast24h`, `windMs`, `storm`, `heatWave`, `coldSnap`.
- `inputs` (everything needed to replay in another car): `distanceKm`, `roadMix`, `gainM`, `lossM`, `tempC`, `windMs`, `windCos`, `condition` (`dry|wet|snow|mud`), optional `surfaceDetail` (`ice`), `unpavedShare`, `driver`, `profile`, `extraMassKg`, `crrMult`, `tireMuMult`, `tireType`, `cdaExtraM2`, `altitudeM`, `socStart`, `highwayRmsMs`, optional `stopDensityMult`, `batteryHealth`.
- `result`: `durationMin`, `stops`, `wheelDemandKwh`, `brakeEnergyKwh`, `regenRecoveredKwh`, `energyCeilingKwh`, `heatLossKwh`, `regenScore`, `missedKwhByCause` (keys are `MissedCause` strings; sums to ceiling - recovered), `thermalThrottleKwh` (already inside `full battery`), `gallons`, `gridKwh`, `energyCostUsd`, `co2Kg`, `mpgEquivalent`, `brakeWearUsd`, `brakeWearAvoidedUsd`, `needsMidTripCharge` (range anxiety), `regenSavings {gallons,kwh,usd,co2Kg}`.

## transactions/user_NNN_transactions.json -> transactions[]
`txId`, `date`, `merchant`, `mcc`, `category`, `amountUsd` (refunds negative).
- `fuel` (5541): `gallons`, `pricePerGal` (after loyalty), `listPricePerGal`, `loyaltyDiscountPerGal`. Brand price offsets apply.
- `ev_charging` (5552): `kwh` delivered, `pricePerKwh`, `sessionKind` (`dc`/`l2`), `avgKw`, `durationMin` (from the car's charge curve), `kwhFromGrid`. Home charging is not a card transaction.
- Fixed and incidental: `insurance` (6300), `loan_payment` (6012), `registration` (9399), `maintenance` (7538), `car_wash` (7542), `tolls` (4784), `parking` (7523), `rideshare` (4121), `refund`, `non_driving`.

## finance/user_NNN_monthly.json
`annualFixedCosts` (insurance, registration, maintenance, loan) and `months[]`: `modeledEnergyCostUsd`, `cardEnergySpendUsd`, `budgetUsd`, `varianceVsBudgetUsd`, `avgGasPriceUsdPerGal`, `priceSpike`, `fixedMonthlyUsd`. Sampled days are scaled to a full month.

## odometer/user_NNN_odometer.json
`readings[]`: `date`, `odometerKm`, `source` (`dealer_service`, `state_inspection`, `insurance_telematics`).

## coaching/user_NNN_coaching.json
`baselineScore`, `dominantMissedCause`, `coachability`, `bestStreakDays`, `finalScore`, `improvement`, and 26 `weeks[]` with `avgScore`, `trips`, `tip {cause, text}` and `currentStreakDays` (days with score >= 70).

## samples/
`index.json` lists everything. Each file is a `types/trip.ts` `Trip`. `samples/compare/` ids look like `hill-smooth-dry`, `flat-conventional-dry` (same car with regen off), 3 routes x 3 drivers x 4 conditions + baselines, all on a Camry Hybrid in Austin.

## what_if/what_if_matrix.json
Per user, `options[]` for all 39 cars: annual gallons, kWh, gas / electricity / total cost, `scenarioEnergyCostUsd {low, base, high, spike}` (gas price multipliers 0.75 / 1 / 1.35 / 1.9), CO2, `regenScore`, `annualBrakeWearUsd`, `longTripsOverRangePerYear`, `annualSavingsVsCurrentUsd`.

## ground_truth/best_car.json
Per user: `best` (vehicle, `acquisition` of `new`, `used_3yr` or `keep`, `tco5Usd`, breakdown, incentives), `keepTco5Usd`, `savingsVsKeep5Usd`, `recommendSwitch` (savings over $1,500), `negativeEquityUsd`, `ranking` (top 12 eligible), and `scenarios` keyed `<gas>__<incentive>` (e.g. `spike__restored_credit`). Eligibility applies budget, body style, excluded makes, towing, range and charging access; ineligible options are left out of the ranking.

## noisy/
Same shapes as the clean files with injected problems: duplicate transactions (same or next day), bank-style merchant names (`SHELL OIL 4417`), null amounts, sign flips, wrong categories, missing weather and gallons, duplicate trips, silent miles/km mix-ups, dropped or rolled-back odometer readings. The clean files are the ground truth.
