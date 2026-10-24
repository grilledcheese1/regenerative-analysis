// Generates simulated users, trips, transactions, finance, coaching, per-second sample trips,
// a what-if car matrix, ground-truth best-car labels and noisy copies.
// Usage: node generate.mjs [seed] [users] [--full-year] [--noise=off|low|med|high] [--no-edge] [--samples=N]
// Everything is SIMULATED. Physics and money numbers are estimates (AGENTS.md section 8).
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { K, DRIVERS, REG, REGIONS, SEED_VEHICLES, INCENT, STATIONS, ROOT } from "./lib/data.mjs";
import { makeRng, hashSeed, clamp, r } from "./lib/rng.mjs";
import { model, energyOf, calibrate, rangeKm, chargeSession, retained, amortPayment, loanBalance } from "./lib/physics.mjs";
import { simulateSampleTrip } from "./lib/samples.mjs";

// ---------- cli ----------
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? `=${d}`).split("=")[1];
const SEED = Number(pos[0] ?? 42);
const USER_COUNT = Number(pos[1] ?? 20);
const FULL_YEAR = args.includes("--full-year");
const EDGE = !args.includes("--no-edge");
const NOISE_LEVEL = opt("noise", "med");
const NOISE_P = { off: 0, low: 0.02, med: 0.05, high: 0.12 }[NOISE_LEVEL] ?? 0.05;
const SAMPLE_FILES = Number(opt("samples", 3));

const R = makeRng(SEED);
const { uni, int, pick, chance, normal } = R;
// Trip files keep one sample per line so they stay readable and small.
const writeTrip = (p, trip) => {
  const head = JSON.stringify({ header: trip.header }, null, 2).slice(0, -2);
  const body = `  "samples": [\n${trip.samples.map((s) => "    " + JSON.stringify(s)).join(",\n")}\n  ],\n  "summary": ${JSON.stringify(trip.summary, null, 2).replace(/\n/g, "\n  ")}\n}\n`;
  mkdirSync(dirname(join(ROOT, p)), { recursive: true });
  writeFileSync(join(ROOT, p), head + ",\n" + body);
};
const write = (p, o) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), JSON.stringify(o, null, 2) + "\n"); };
const YEAR = 2026;
const dim = (m) => new Date(Date.UTC(YEAR, m + 1, 0)).getUTCDate();
const WINDOWS = FULL_YEAR
  ? Array.from({ length: 12 }, (_, m) => ({ month: m, startDay: 1, days: dim(m) }))
  : [0, 3, 6, 9].map((month) => ({ month, startDay: 1, days: 14 }));
const SAMPLED_DAYS = WINDOWS.reduce((a, w) => a + w.days, 0);
const ANNUALIZE = 365 / SAMPLED_DAYS;
const iso = (d) => d.toISOString().slice(0, 10);
const regionOf = (id) => REGIONS.find((x) => x.id === id);

// ---------- vehicles ----------
const VEHICLES = SEED_VEHICLES.map((v) => ({ ...v, ...calibrate(v, DRIVERS.mixed), rangeKm: rangeKm(v) ? r(rangeKm(v), 0) : null }));
const byId = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));
const effOf = (v) => ({ engineEff: v.engineEff, driveEff: v.driveEff });

// ---------- weather ----------
function dayWeather(region, date, prevRain, wave) {
  const month = date.getUTCMonth(), mean = region.tempMeanC[month];
  if (wave.left <= 0) {
    if (mean >= K.heatWave.minMonthMeanC && chance(K.heatWave.startProbPerDay)) { wave.left = int(...K.heatWave.lengthDays); wave.delta = K.heatWave.deltaC; }
    else if (mean <= K.coldSnap.maxMonthMeanC && chance(K.coldSnap.startProbPerDay)) { wave.left = int(...K.coldSnap.lengthDays); wave.delta = K.coldSnap.deltaC; }
  }
  const inWave = wave.left > 0;
  const tempC = normal(mean, region.tempSdC) + (inWave ? wave.delta : 0);
  if (inWave) wave.left--;
  const raining = chance(region.pRain[month]);
  const snow = raining && tempC <= 1 && chance(Math.max(region.pSnow, 0.1) + 0.3);
  const precipMm = raining ? r(Math.abs(normal(5, 6)) + 0.5, 1) : 0;
  const windMs = r(Math.abs(normal(3.5, 2)), 1);
  const storm = precipMm >= K.storm.precipMm || (snow && precipMm >= K.storm.snowPrecipMm) || windMs >= 9;
  return { tempC: r(tempC, 1), precipMm, snow, rainedLast24h: raining || prevRain, windMs, raining, storm,
    heatWave: inWave && wave.delta > 0, coldSnap: inWave && wave.delta < 0 };
}
function surfaceCondition(w, unpavedShare) {
  if (w.snow || (w.tempC <= -2 && w.precipMm > 0)) return "snow";
  if (w.rainedLast24h && unpavedShare > 0.05 && chance(0.5)) return "mud";
  if (w.raining || (w.rainedLast24h && chance(0.4))) return "wet";
  return "dry";
}

// ---------- users ----------
const FIRST = ["Ava", "Noah", "Maya", "Liam", "Zoe", "Ethan", "Sofia", "Lucas", "Nora", "Owen", "Ivy", "Caleb", "Lena", "Mateo", "Ruby", "Jonah", "Tessa", "Omar", "Priya", "Diego", "Hana", "Felix", "Amara", "Theo", "Elif", "Kai", "Rosa", "Jin", "Mira", "Dev"];
const WEIGHTS = { toyota_camry_hybrid_2025: 4, toyota_prius_2025: 2, toyota_rav4_hybrid_2025: 3, toyota_corolla_2025: 3, toyota_tacoma_2025: 2, ford_f150_ecoboost_2025: 3, hyundai_elantra_2025: 2, tesla_model3_rwd_2025: 2 };
const wPool = VEHICLES.flatMap((v) => Array(WEIGHTS[v.id] ?? (v.make === "Toyota" ? 2 : 1)).fill(v.id));
const normalizeMix = (m) => { const s = Object.values(m).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(m).map(([k, x]) => [k, r(x / s, 3)])); };
const ARCHETYPES = ["tiny_mileage", "huge_mileage", "all_highway", "stop_and_go", "mountain", "heavy_tow"];
const INSURERS = ["GEICO", "Progressive", "State Farm", "Allstate"], LENDERS = ["Toyota Financial", "Ally Auto", "Chase Auto", "Capital One Auto"];
const BODIES = ["sedan", "hatchback", "suv", "truck", "minivan"];

function makeUser(i, arch = "typical") {
  let region = REGIONS[i % REGIONS.length];
  if (arch === "mountain") region = regionOf(pick(["denver_co", "pittsburgh_pa"]));
  let v = byId[pick(wPool)];
  if (arch === "heavy_tow") v = byId[pick(["ford_f150_ecoboost_2025", "toyota_tundra_2025", "toyota_tacoma_2025", "chevy_silverado_2025", "toyota_tundra_hybrid_2025"])];
  const age = int(0, 9);
  const style = pick(["smooth", "mixed", "mixed", "aggressive"]);
  const access = pick(["home", "home", "home", "apartment_shared", "workplace", "none"]);
  const mixes = {
    home: { home: 0.88, publicL2: 0.04, publicDC: 0.08 }, workplace: { home: 0, workplace: 0.5, publicL2: 0.15, publicDC: 0.35 },
    apartment_shared: { publicL2: 0.45, publicDC: 0.55 }, none: { publicDC: 1 }
  };
  const incomeBand = pick(["low", "mid", "mid", "high"]);
  const [lo, hi] = INCENT.incomeBands[incomeBand].householdIncomeUsd;
  const userId = `user_${String(i + 1).padStart(3, "0")}`;
  const home = { lat: r(region.lat + uni(-0.08, 0.08), 5), lon: r(region.lon + uni(-0.08, 0.08), 5) };
  const hot = region.tempMeanC[6] >= 28;
  const loanEligible = chance(age < 5 ? 0.7 : 0.15);
  const termMonths = pick([48, 60, 72]), paid = clamp(age * 12 + int(0, 6), 0, termMonths - 3), apr = r(uni(3.5, 9.5), 2);
  const principal = Math.round(v.msrpUsd * 0.95 * 0.9);
  const value = Math.round((v.msrpUsd * retained(v.depreciationClass, age)) / 100) * 100;
  const user = {
    userId, alias: `${FIRST[i % FIRST.length]} (${region.name})`, simulated: true, archetype: arch, regionId: region.id,
    home, work: { lat: r(region.lat + uni(-0.08, 0.08), 5), lon: r(region.lon + uni(-0.08, 0.08), 5) },
    commute: { oneWayKm: r(clamp(normal(18, 12), 3, 70), 1), workDaysPerWeek: pick([0, 3, 5, 5, 5]), roadMix: normalizeMix({ urban: uni(0.1, 0.6), suburban: uni(0.2, 0.5), highway: uni(0, 0.6) }) },
    longTripRate: r(uni(0.1, 0.8), 2),
    vehicle: {
      vehicleId: v.id, modelYear: v.year - age, ageYears: age, odometerKm: int(5000, 40000) * Math.max(1, age), estimatedValueUsd: value,
      batteryHealth: v.batteryKwh > 0 ? r(clamp(1 - K.batteryAging.fadePerYear * age * (hot ? 1.3 : 1) + normal(0, 0.01), 0.6, 1), 3) : null
    },
    driver: {
      style, jitterDecelMs2: r(normal(0, 0.15), 2), usesCruiseControl: chance(0.45), ecoMode: chance(0.3),
      highwayCruiseMs: r(clamp(normal(29, 2.5), 24, 35), 1), speedLimitMs: 31.3
    },
    load: {
      typicalExtraMassKg: pick([80, 80, 160, 240, 350]), crrMult: r(uni(0.95, 1.12), 3), unpavedShare: r(region.unpavedShare * uni(0.3, 2.2), 3),
      roofRack: chance(0.15), towing: v.towingCapacityKg > 0 && chance(0.1) ? { perLongTripProb: 0.08, trailerMassKg: int(500, 1500), cdaAddM2: 0.6 } : null
    },
    tires: { type: region.pSnow > 0.3 && chance(0.6) ? "winter_seasonal" : pick(["all_season", "all_season", "all_season", "summer"]), pressureDriftPct: int(0, 18) },
    charging: {
      access, hasHomeCharger: access === "home", mix: mixes[access], touPlan: access === "home" && chance(0.4), offPeakShare: r(uni(0.6, 0.95), 2),
      plugInHabit: r(access === "home" ? uni(0.55, 0.85) : access === "workplace" ? uni(0.4, 0.6) : uni(0.05, 0.25), 2)
    },
    income: { band: incomeBand, householdUsd: int(lo, hi) },
    preferences: {
      bodyStyles: [...new Set([v.body, ...Array.from({ length: int(0, 2) }, () => pick(BODIES))])],
      excludeMakes: chance(0.3) ? [pick([...new Set(VEHICLES.map((x) => x.make))])] : [],
      budgetCapUsd: Math.round(uni(26000, 62000) / 1000) * 1000, needsTowingKg: chance(0.08) ? int(600, 1500) : 0, minRangeKm: chance(0.3) ? 350 : 0
    },
    finance: {
      fuelBudgetUsdPerMonth: int(60, 320), priceSensitivity: r(uni(0, 1), 2), insurer: pick(INSURERS), insuranceUserFactor: r(uni(0.85, 1.2), 2),
      registrationMonth: int(0, 11), loyalty: chance(0.6) ? pick(STATIONS.loyalty) : null,
      loan: loanEligible ? {
        lender: pick(LENDERS), aprPct: apr, termMonths, monthsRemaining: termMonths - paid, monthlyPaymentUsd: Math.round(amortPayment(principal, apr, termMonths)),
        balanceUsd: Math.round(loanBalance(principal, apr, termMonths, paid))
      } : null
    },
    annualDrift: r(normal(1.0, 0.07), 3),
    lifeEvents: []
  };
  if (chance(0.25)) user.lifeEvents.push({ type: "job_change", fromMonth: 6, newOneWayKm: r(clamp(normal(18, 12), 3, 70), 1) });
  if (chance(0.15)) {
    const nr = pick(REGIONS.filter((x) => x.id !== region.id));
    user.lifeEvents.push({ type: "move", fromMonth: 9, newRegionId: nr.id, newHome: { lat: r(nr.lat + uni(-0.08, 0.08), 5), lon: r(nr.lon + uni(-0.08, 0.08), 5) }, newWork: { lat: r(nr.lat + uni(-0.08, 0.08), 5), lon: r(nr.lon + uni(-0.08, 0.08), 5) } });
  }
  // Edge-case archetypes
  if (arch !== "typical") user.lifeEvents = [];
  if (arch === "tiny_mileage") { user.commute.workDaysPerWeek = 0; user.longTripRate = 0.05; }
  if (arch === "huge_mileage") { user.commute = { oneWayKm: 85, workDaysPerWeek: 5, roadMix: { urban: 0.05, suburban: 0.1, highway: 0.85 } }; user.longTripRate = 1.2; }
  if (arch === "all_highway") user.commute = { oneWayKm: 40, workDaysPerWeek: 5, roadMix: { urban: 0, suburban: 0, highway: 1 } };
  if (arch === "stop_and_go") { user.commute = { oneWayKm: 14, workDaysPerWeek: 5, roadMix: { urban: 1, suburban: 0, highway: 0 } }; user.stopDensityMult = 1.7; }
  if (arch === "mountain") { user.commute = { oneWayKm: 25, workDaysPerWeek: 5, roadMix: { urban: 0.1, suburban: 0.6, highway: 0.3 } }; user.terrainOverride = { gainPerKmMean: 38, gainPerKmSd: 10 }; }
  if (arch === "heavy_tow") { user.load.towing = { perLongTripProb: 0.5, trailerMassKg: 1800, cdaAddM2: 0.9 }; user.preferences.needsTowingKg = 1800; user.longTripRate = 0.9; }
  return user;
}
function stateFor(user, month) {
  let region = regionOf(user.regionId), commuteKm = user.commute.oneWayKm, home = user.home, work = user.work;
  for (const e of user.lifeEvents) if (month >= e.fromMonth) {
    if (e.type === "job_change") commuteKm = e.newOneWayKm;
    if (e.type === "move") { region = regionOf(e.newRegionId); home = e.newHome; work = e.newWork; }
  }
  return { region, commuteKm, home, work, drift: Math.pow(user.annualDrift, month / 12) };
}
function effProfile(user) {
  const p = { ...DRIVERS[user.driver.style] };
  p.brakeDecelMs2 += user.driver.jitterDecelMs2;
  if (user.driver.usesCruiseControl) p.speedFactor -= 0.01;
  if (user.driver.ecoMode) { p.speedFactor -= 0.02; p.coastFraction += 0.05; p.downhillBrakeFraction -= 0.05; }
  return Object.fromEntries(Object.entries(p).map(([k, x]) => [k, r(x, 3)]));
}
function tireFor(user, month) {
  const t = user.tires.type;
  return t === "winter_seasonal" ? ([10, 11, 0, 1, 2].includes(month) ? "winter" : "all_season") : t;
}
function elecPriceFor(user, region) {
  const c = user.charging, flat = region.elecUsdPerKwh, m = REG.touRateMultipliers;
  const home = c.touPlan ? flat * (c.offPeakShare * m.offPeak + (1 - c.offPeakShare) * m.peak) : flat;
  return (c.mix.home ?? 0) * home + (c.mix.workplace ?? 0) * REG.workplaceChargeUsdPerKwh + (c.mix.publicL2 ?? 0) * REG.publicL2UsdPerKwh + (c.mix.publicDC ?? 0) * REG.publicFastChargeUsdPerKwh;
}
const gasPriceFor = (region, date, noise) => r(region.gasUsdPerGal * (1 + 0.04 * Math.sin(((date.getUTCMonth() - 3) / 12) * 2 * Math.PI)) * (1 + noise), 3);

// ---------- trip inputs and evaluation ----------
function buildInputs(user, st, date, w, km, mix, soc, towing) {
  const month = date.getUTCMonth(), tire = tireFor(user, month), T = K.tires[tire];
  const condition = surfaceCondition(w, user.load.unpavedShare);
  const surfaceDetail = condition === "snow" && w.tempC < -3 && chance(0.45) ? "ice" : undefined;
  const terr = user.terrainOverride ?? st.region.terrain;
  const gainM = clamp(normal(terr.gainPerKmMean, terr.gainPerKmSd), 0, 80) * km;
  const lossM = gainM * uni(0.7, 1.3);
  const muMult = condition === "snow" ? T.snowIceMu : condition === "wet" ? T.wetMu : 1;
  return {
    distanceKm: r(km, 2), roadMix: mix, gainM: r(gainM, 0), lossM: r(lossM, 0), tempC: w.tempC, windMs: w.windMs, windCos: r(uni(-1, 1), 2),
    condition, ...(surfaceDetail ? { surfaceDetail } : {}), unpavedShare: user.load.unpavedShare, driver: user.driver.style, profile: effProfile(user),
    extraMassKg: user.load.typicalExtraMassKg + int(-20, 60) + (towing ? user.load.towing.trailerMassKg : 0),
    crrMult: r(user.load.crrMult * T.crr * (1 + K.tires.underinflationCrrPerPct * user.tires.pressureDriftPct), 4), tireMuMult: muMult, tireType: tire,
    cdaExtraM2: r((user.load.roofRack ? K.roofRack.cdaAddM2 : 0) + (towing ? user.load.towing.cdaAddM2 : 0), 3),
    altitudeM: st.region.altitudeM, socStart: soc, highwayRmsMs: user.driver.highwayCruiseMs,
    ...(user.stopDensityMult ? { stopDensityMult: user.stopDensityMult } : {}), batteryHealth: user.vehicle.batteryHealth ?? 1
  };
}
function evaluate(user, v, inp, region, gasPrice, noRegen = false) {
  const uf = v.powertrain === "phev" ? user.charging.plugInHabit : 0;
  const out = model(v, effOf(v), inp, !noRegen);
  const e = energyOf(v, out, uf);
  const elecPrice = elecPriceFor(user, region);
  return { out, e, elecPrice, gasCost: e.gallons * gasPrice, elecCost: e.kwh * elecPrice, costUsd: e.gallons * gasPrice + e.kwh * elecPrice,
    co2: e.gallons * REG.gasolineCo2KgPerGal + e.kwh * REG.gridCo2KgPerKwh };
}

function simulateUser(user) {
  const v = byId[user.vehicle.vehicleId], trips = [], odometer = [];
  let seq = 0, odo = user.vehicle.odometerKm, lastEnd = null, lastKmPerDay = 30;
  const src = ["dealer_service", "state_inspection", "insurance_telematics"];
  for (const win of WINDOWS) {
    const st = stateFor(user, win.month), region = st.region;
    const start = new Date(Date.UTC(YEAR, win.month, win.startDay));
    if (lastEnd) odo += Math.round(((start - lastEnd) / 86400000) * lastKmPerDay);
    odometer.push({ date: iso(start), odometerKm: Math.round(odo), source: pick(src) });
    const odoAtStart = odo;
    let prevRain = false; const wave = { left: 0, delta: 0 };
    for (let d = 0; d < win.days; d++) {
      const date = new Date(Date.UTC(YEAR, win.month, win.startDay + d));
      const w = dayWeather(region, date, prevRain, wave); prevRain = w.raining;
      const dow = date.getUTCDay(), weekend = dow === 0 || dow === 6;
      const worksToday = !weekend && (dow - 1) % 5 < user.commute.workDaysPerWeek && st.commuteKm > 0;
      const plan = [];
      const skipOther = () => w.storm && chance(K.storm.skipOtherProb);
      if (worksToday) {
        if (!(w.storm && chance(K.storm.skipCommuteProb))) {
          plan.push(["commute_am", st.commuteKm * uni(0.92, 1.12), user.commute.roadMix, 7 + uni(0, 1.5)]);
          if (chance(0.3) && !skipOther()) plan.push(["errand", uni(2, 12), normalizeMix({ urban: 0.6, suburban: 0.4, highway: 0.0001 }), 12 + uni(0, 2)]);
          plan.push(["commute_pm", st.commuteKm * uni(0.92, 1.12), user.commute.roadMix, 16.5 + uni(0, 2)]);
        }
      } else {
        let n = user.archetype === "tiny_mileage" ? (chance(0.35) ? 1 : 0) : int(0, 3);
        if (st.drift > 1 && chance(st.drift - 1)) n++;
        if (st.drift < 1 && chance(1 - st.drift)) n = Math.max(0, n - 1);
        for (let k = 0; k < n; k++) {
          if (skipOther()) continue;
          if (chance(clamp(user.longTripRate / 7, 0, 0.6))) plan.push(["leisure_long", uni(30, 110), normalizeMix({ urban: 0.1, suburban: 0.25, highway: 0.65 }), 9 + uni(0, 6)]);
          else plan.push(["errand", uni(2, 14), user.stopDensityMult ? { urban: 1, suburban: 0, highway: 0 } : normalizeMix({ urban: uni(0.3, 0.7), suburban: uni(0.3, 0.7), highway: uni(0, 0.1) }), 10 + uni(0, 8)]);
        }
      }
      for (const [purpose, km, mix, hour] of plan) {
        const towing = purpose === "leisure_long" && user.load.towing && chance(user.load.towing.perLongTripProb);
        const soc = v.powertrain === "bev" ? r(clamp(normal(0.6, 0.22), 0.1, 1), 2) : r(clamp(normal(0.6, 0.1), 0.35, 0.9), 2);
        const gasPrice = gasPriceFor(region, date, normal(0, 0.03));
        const inputs = buildInputs(user, st, date, w, km, mix, soc, towing);
        const cur = evaluate(user, v, inputs, region, gasPrice, false), base = evaluate(user, v, inputs, region, gasPrice, true);
        const mi = inputs.distanceKm / 1.609344, o = cur.out;
        trips.push({
          tripId: `${user.userId}-${String(++seq).padStart(4, "0")}`, userId: user.userId, vehicleId: v.id, regionId: region.id,
          date: iso(date), startHour: r(hour, 1), purpose, towing: !!towing,
          weather: { tempC: w.tempC, precipMm: w.precipMm, snow: w.snow, rainedLast24h: w.rainedLast24h, windMs: w.windMs, storm: w.storm, heatWave: w.heatWave, coldSnap: w.coldSnap },
          inputs,
          result: {
            durationMin: r(o.durationMin, 1), stops: r(o.stops, 1), wheelDemandKwh: r(o.wheelDemandKwh), brakeEnergyKwh: r(o.brakeEnergyKwh),
            regenRecoveredKwh: r(o.regenKwh), energyCeilingKwh: r(o.ceilKwh), heatLossKwh: r(o.heatKwh),
            regenScore: o.ceilKwh > 0 ? r((100 * o.regenKwh) / o.ceilKwh, 1) : null,
            missedKwhByCause: Object.fromEntries(Object.entries(o.missed).map(([k, x]) => [k, r(x)])), thermalThrottleKwh: r(o.thermalThrottleKwh),
            gallons: r(cur.e.gallons, 4), gridKwh: r(cur.e.kwh, 3), energyCostUsd: r(cur.costUsd, 2), co2Kg: r(cur.co2, 2),
            mpgEquivalent: cur.e.gallons + cur.e.kwh > 0 ? r(mi / (cur.e.gallons + cur.e.kwh / 33.705), 1) : null,
            brakeWearUsd: r(o.brakeWearUsd, 3), brakeWearAvoidedUsd: r(base.out.brakeWearUsd - o.brakeWearUsd, 3),
            needsMidTripCharge: v.rangeKm ? inputs.distanceKm > 0.8 * v.rangeKm * soc : false,
            regenSavings: { gallons: r(base.e.gallons - cur.e.gallons, 4), kwh: r(base.e.kwh - cur.e.kwh, 3), usd: r(base.costUsd - cur.costUsd, 2), co2Kg: r(base.co2 - cur.co2, 2) }
          },
          gasPriceUsdPerGal: gasPrice
        });
        odo += inputs.distanceKm;
      }
    }
    const end = new Date(Date.UTC(YEAR, win.month, win.startDay + win.days - 1));
    odometer.push({ date: iso(end), odometerKm: Math.round(odo), source: pick(src) });
    lastKmPerDay = Math.max(5, (odo - odoAtStart) / win.days);
    lastEnd = end;
  }
  return { trips, odometer };
}

// ---------- transactions and finance ----------
const OTHER_MERCH = [["Kroger", 5411], ["Target", 5311], ["Amazon", 5942], ["Starbucks", 5814], ["Chipotle", 5814], ["Spotify", 5815]];
const SERVICE = ["Jiffy Lube", "Toyota Service", "Firestone", "Discount Tire", "Pep Boys"];
function fixedCosts(user, v, region) {
  const dFac = { smooth: 0.92, mixed: 1, aggressive: 1.15 }[user.driver.style];
  const insurance = Math.round(v.insuranceBaseUsdPerYear * region.insuranceFactor * dFac * user.finance.insuranceUserFactor);
  const registration = region.registration.annualUsd + (v.powertrain === "bev" ? region.registration.evFeeUsd : v.powertrain === "phev" ? region.registration.evFeeUsd / 2 : 0);
  return { insuranceUsdPerYear: insurance, registrationUsdPerYear: Math.round(registration), maintenanceUsdPerYear: v.maintenanceUsdPerYear };
}
function makeTransactions(user, trips) {
  const v = byId[user.vehicle.vehicleId], tx = [];
  let tank = v.tankGal * uni(0.5, 1), pubL2 = 0, pubDC = 0;
  const L = user.finance.loyalty;
  for (const t of trips) {
    if (t.result.gallons > 0) {
      tank -= t.result.gallons;
      if (tank < v.tankGal * 0.2) {
        const gal = r(v.tankGal * uni(0.7, 0.98) - Math.max(tank, 0), 2);
        const st = pick(STATIONS.stations);
        const list = r(t.gasPriceUsdPerGal + st.priceOffsetUsdPerGal + normal(0, 0.04), 3);
        const disc = L && chance(0.6) ? L.discountPerGal : 0;
        const price = r(list - disc, 3);
        tx.push({ date: t.date, merchant: st.name, mcc: 5541, category: "fuel", amountUsd: r(gal * price, 2), gallons: gal, pricePerGal: price, listPricePerGal: list, loyaltyDiscountPerGal: disc });
        tank += gal;
      }
    }
    if (t.result.gridKwh > 0 && v.charging) {
      const mix = user.charging.mix;
      pubL2 += t.result.gridKwh * (mix.publicL2 ?? 0); pubDC += t.result.gridKwh * (mix.publicDC ?? 0);
      for (const kind of ["dc", "l2"]) {
        const acc = kind === "dc" ? pubDC : pubL2;
        if (acc > (kind === "dc" ? 20 : 9)) {
          const delivered = acc * (kind === "dc" ? v.charging.dcEfficiency : v.charging.acEfficiency);
          const s = chargeSession(v, delivered, kind), net = pick(STATIONS.chargers.filter((c) => c.kind === s.kind));
          const price = r((kind === "dc" ? REG.publicFastChargeUsdPerKwh : REG.publicL2UsdPerKwh) * uni(0.9, 1.15), 3);
          tx.push({ date: t.date, merchant: net.name, mcc: 5552, category: "ev_charging", amountUsd: r(delivered * price, 2), kwh: r(delivered, 1), pricePerKwh: price,
            sessionKind: s.kind, avgKw: r(s.avgKw, 1), durationMin: r(s.durationMin, 0), kwhFromGrid: r(s.kwhFromGrid, 1) });
          if (kind === "dc") pubDC = 0; else pubL2 = 0;
        }
      }
    }
  }
  const months = [...new Set(WINDOWS.map((w) => w.month))];
  for (const m of months) {
    const st = stateFor(user, m), fc = fixedCosts(user, v, st.region);
    const d1 = (day) => iso(new Date(Date.UTC(YEAR, m, day)));
    tx.push({ date: d1(1), merchant: user.finance.insurer, mcc: 6300, category: "insurance", amountUsd: r((fc.insuranceUsdPerYear / 12) * uni(0.98, 1.02), 2) });
    if (user.finance.loan && user.finance.loan.monthsRemaining > 0) tx.push({ date: d1(5), merchant: user.finance.loan.lender, mcc: 6012, category: "loan_payment", amountUsd: user.finance.loan.monthlyPaymentUsd });
    if (m === user.finance.registrationMonth) tx.push({ date: d1(8), merchant: "State DMV", mcc: 9399, category: "registration", amountUsd: fc.registrationUsdPerYear });
    if (chance(v.powertrain === "ice" ? 0.35 : 0.2)) tx.push({ date: d1(int(2, 13)), merchant: pick(SERVICE), mcc: 7538, category: "maintenance", amountUsd: r(uni(80, 450), 2) });
    if (chance(0.5)) tx.push({ date: d1(int(2, 13)), merchant: "Mister Car Wash", mcc: 7542, category: "car_wash", amountUsd: r(uni(12, 25), 2) });
    if (chance(0.35)) tx.push({ date: d1(int(2, 13)), merchant: "E-ZPass", mcc: 4784, category: "tolls", amountUsd: r(uni(4, 40), 2) });
    if (chance(0.4)) tx.push({ date: d1(int(2, 13)), merchant: "ParkMobile", mcc: 7523, category: "parking", amountUsd: r(uni(3, 30), 2) });
    if (chance(0.3)) tx.push({ date: d1(int(2, 13)), merchant: pick(["Uber", "Lyft"]), mcc: 4121, category: "rideshare", amountUsd: r(uni(9, 60), 2) });
    if (chance(0.12)) tx.push({ date: d1(int(2, 13)), merchant: pick(["Amazon", "Target"]), mcc: 5942, category: "refund", amountUsd: -r(uni(8, 80), 2) });
  }
  for (const w of WINDOWS) for (let d = 0; d < w.days; d += 3) {
    const [name, mcc] = pick(OTHER_MERCH);
    tx.push({ date: iso(new Date(Date.UTC(YEAR, w.month, w.startDay + d))), merchant: name, mcc, category: "non_driving", amountUsd: r(uni(4, 120), 2) });
  }
  tx.sort((a, b) => a.date.localeCompare(b.date));
  return tx.map((x, i) => ({ txId: `${user.userId}-tx-${String(i + 1).padStart(4, "0")}`, ...x }));
}
function monthlyFinance(user, trips, tx) {
  const v = byId[user.vehicle.vehicleId], rows = [];
  for (const w of WINDOWS) {
    const scale = dim(w.month) / w.days, key = `${YEAR}-${String(w.month + 1).padStart(2, "0")}`;
    const tr = trips.filter((t) => t.date.startsWith(key)), tx_ = tx.filter((x) => x.date.startsWith(key));
    const st = stateFor(user, w.month), fc = fixedCosts(user, v, st.region);
    const cardEnergy = tx_.filter((x) => x.category === "fuel" || x.category === "ev_charging").reduce((a, x) => a + x.amountUsd, 0);
    const modeled = tr.reduce((a, t) => a + t.result.energyCostUsd, 0);
    const avgPrice = tr.length ? tr.reduce((a, t) => a + t.gasPriceUsdPerGal, 0) / tr.length : st.region.gasUsdPerGal;
    rows.push({
      month: key, regionId: st.region.id, tripsInSample: tr.length, sampledDays: w.days, modeledEnergyCostUsd: r(modeled * scale, 2),
      cardEnergySpendUsd: r(cardEnergy * scale, 2), budgetUsd: user.finance.fuelBudgetUsdPerMonth,
      varianceVsBudgetUsd: r(modeled * scale - user.finance.fuelBudgetUsdPerMonth, 2), avgGasPriceUsdPerGal: r(avgPrice, 3),
      priceSpike: avgPrice > st.region.gasUsdPerGal * 1.08,
      fixedMonthlyUsd: r((fc.insuranceUsdPerYear + fc.maintenanceUsdPerYear + fc.registrationUsdPerYear) / 12 + (user.finance.loan?.monthlyPaymentUsd ?? 0), 2)
    });
  }
  const fc = fixedCosts(user, v, stateFor(user, 11).region);
  return { userId: user.userId, simulated: true, annualFixedCosts: { ...fc, loanPaymentUsdPerYear: (user.finance.loan?.monthlyPaymentUsd ?? 0) * 12 }, months: rows };
}

// ---------- coaching history ----------
const TIPS = {
  "late braking": "Lift off the accelerator earlier and brake gently so regen can handle the stop.",
  "low grip": "On slick roads, brake earlier and softer. Grip limits regen, so smooth input keeps more energy.",
  "full battery": "The battery was near full or hot. Long descents after a full charge waste regen, so plan for it.",
  "cold battery": "Cold batteries limit regen. A few minutes of gentle driving warms the pack."
};
function coachingFor(user, trips) {
  const v = byId[user.vehicle.vehicleId];
  const scored = trips.filter((t) => t.result.regenScore != null);
  if (!(v.maxRegenKw > 0) || !scored.length) return null;
  const base = scored.reduce((a, t) => a + t.result.regenScore, 0) / scored.length;
  const cause = Object.entries(trips.reduce((a, t) => { for (const [k, x] of Object.entries(t.result.missedKwhByCause)) a[k] = (a[k] ?? 0) + x; return a; }, {})).sort((a, b) => b[1] - a[1])[0][0];
  const coachability = uni(0.2, 1), tipWeeks = [2, 6, 11, 17, 22].filter(() => chance(0.85));
  const weeks = [];
  let streak = 0, best = 0;
  for (let w = 0; w < 26; w++) {
    let score = base;
    for (const tw of tipWeeks) if (w >= tw) score += coachability * 3 * (0.6 + 0.4 * Math.exp(-(w - tw) / 6));
    score = clamp(score + normal(0, 1.8), 20, 99.5);
    for (let d = 0; d < 7; d++) { const ds = clamp(score + normal(0, 4), 0, 100); streak = ds >= 70 ? streak + 1 : 0; best = Math.max(best, streak); }
    weeks.push({ week: w + 1, weekStart: iso(new Date(Date.UTC(YEAR, 2, 2 + w * 7))), avgScore: r(score, 1), trips: int(6, 14), tip: tipWeeks.includes(w) ? { cause, text: TIPS[cause] } : null, currentStreakDays: streak });
  }
  return { userId: user.userId, simulated: true, baselineScore: r(base, 1), dominantMissedCause: cause, coachability: r(coachability, 2), bestStreakDays: best,
    finalScore: weeks[25].avgScore, improvement: r(weeks[25].avgScore - base, 1), weeks };
}

// ---------- what-if and ground truth ----------
const GAS_SCENARIOS = { low: 0.75, base: 1, high: 1.35, spike: 1.9 };
function analyzeUser(user, trips) {
  const cur = byId[user.vehicle.vehicleId];
  const region = stateFor(user, 11).region;
  const rows = VEHICLES.map((v) => {
    let gal = 0, kwh = 0, galCost = 0, elecCost = 0, co2 = 0, regen = 0, ceil = 0, wear = 0, over = 0;
    for (const t of trips) {
      const rg = regionOf(t.regionId);
      const inp = { ...t.inputs, batteryHealth: v.id === cur.id ? user.vehicle.batteryHealth ?? 1 : 1, socStart: v.powertrain === "bev" ? t.inputs.socStart : clamp(t.inputs.socStart, 0.35, 0.9) };
      const o = evaluate(user, v, inp, rg, t.gasPriceUsdPerGal, false);
      gal += o.e.gallons; kwh += o.e.kwh; galCost += o.gasCost; elecCost += o.elecCost; co2 += o.co2; regen += o.out.regenKwh; ceil += o.out.ceilKwh; wear += o.out.brakeWearUsd;
      if (v.rangeKm && t.inputs.distanceKm > 0.8 * v.rangeKm) over++;
    }
    const A = ANNUALIZE;
    return {
      vehicleId: v.id, powertrain: v.powertrain, trim: v.trim, annualGallons: Math.round(gal * A), annualGridKwh: Math.round(kwh * A),
      annualGasCostUsd: Math.round(galCost * A), annualElecCostUsd: Math.round(elecCost * A), annualEnergyCostUsd: Math.round((galCost + elecCost) * A),
      scenarioEnergyCostUsd: Object.fromEntries(Object.entries(GAS_SCENARIOS).map(([k, f]) => [k, Math.round((galCost * f + elecCost) * A)])),
      annualCo2Kg: Math.round(co2 * A), regenScore: ceil > 0 ? r((100 * regen) / ceil, 1) : null, annualBrakeWearUsd: Math.round(wear * A),
      longTripsOverRangePerYear: Math.round(over * A), purchasePriceUsd: v.msrpUsd, rangeKm: v.rangeKm
    };
  });
  const curRow = rows.find((x) => x.vehicleId === cur.id);
  const matrix = rows.map((row) => ({ ...row, annualSavingsVsCurrentUsd: curRow.annualEnergyCostUsd - row.annualEnergyCostUsd }));

  // Full 5-year cost of ownership per option
  const P = user.preferences, loan = user.finance.loan;
  const value = user.vehicle.estimatedValueUsd, tradeInLoss = value * K.wearAndTax.tradeInDiscount;
  const negEquity = loan ? Math.max(0, loan.balanceUsd - (value - tradeInLoss)) : 0;
  const apr = loan?.aprPct ?? 6.5;
  const optionsFor = (gasKey, incKey) => {
    const inc = INCENT.scenarios[incKey], list = [];
    for (const row of rows) {
      const v = byId[row.vehicleId], fc = fixedCosts(user, v, region), isCur = v.id === cur.id;
      const energy5 = 5 * row.scenarioEnergyCostUsd[gasKey];
      const modes = isCur ? ["keep"] : ["new", "used_3yr"];
      for (const mode of modes) {
        const age0 = mode === "new" ? 0 : mode === "used_3yr" ? 3 : user.vehicle.ageYears;
        const price = mode === "new" ? v.msrpUsd : mode === "used_3yr" ? Math.round(v.msrpUsd * retained(v.depreciationClass, 3) * (1 + v.cpoPremium)) : null;
        const operating5 = 5 * (fc.insuranceUsdPerYear * (mode === "used_3yr" ? 0.92 : 1) + fc.registrationUsdPerYear + fc.maintenanceUsdPerYear + row.annualBrakeWearUsd) + energy5;
        let dep, extra = 0, incentive = 0, interest = 0;
        if (mode === "keep") dep = value - v.msrpUsd * retained(v.depreciationClass, age0 + 5);
        else {
          dep = price - v.msrpUsd * retained(v.depreciationClass, age0 + 5);
          const fin = (price + negEquity) * (1 - K.wearAndTax.downPaymentShare), n = K.wearAndTax.financeTermMonths;
          interest = amortPayment(fin, apr, n) * n - fin;
          extra = price * region.salesTaxRate + K.wearAndTax.dealerFeeUsd + tradeInLoss;
          if (mode === "new" && (v.powertrain === "bev" || v.powertrain === "phev")) {
            const f = v.powertrain === "bev" ? 1 : 0.5;
            const stOk = !region.incentives.incomeCapUsd || user.income.householdUsd <= region.incentives.incomeCapUsd;
            const fedOk = (!inc.incomeCapUsd || user.income.householdUsd <= inc.incomeCapUsd) && (!inc.msrpCapUsd || v.msrpUsd <= inc.msrpCapUsd);
            incentive = (stOk ? region.incentives.stateEvUsd * f : 0) + (fedOk ? (v.powertrain === "bev" ? inc.federalEvUsd : inc.federalPhevUsd) : 0);
          }
        }
        const reasons = [];
        if (mode !== "keep") {
          if (price > P.budgetCapUsd) reasons.push("over budget");
          if (!P.bodyStyles.includes(v.body)) reasons.push("body style");
          if (P.excludeMakes.includes(v.make)) reasons.push("excluded make");
          if (v.towingCapacityKg < P.needsTowingKg) reasons.push("towing capacity");
          if (v.powertrain === "bev" && user.charging.access === "none") reasons.push("no charging access");
          if (v.powertrain === "bev" && P.minRangeKm && v.rangeKm < P.minRangeKm) reasons.push("range");
        }
        list.push({ vehicleId: v.id, acquisition: mode, priceUsd: price, tco5Usd: Math.round(dep + operating5 + interest + extra - incentive), depreciation5Usd: Math.round(dep),
          operating5Usd: Math.round(operating5), interestUsd: Math.round(interest), taxFeesTradeInLossUsd: Math.round(extra), incentiveUsd: Math.round(incentive),
          eligible: reasons.length === 0, ineligibleReasons: reasons });
      }
    }
    return list;
  };
  const scenarios = {};
  let ranking;
  for (const gk of Object.keys(GAS_SCENARIOS)) for (const ik of Object.keys(INCENT.scenarios)) {
    const list = optionsFor(gk, ik);
    const keep = list.find((x) => x.acquisition === "keep");
    const ranked = list.filter((x) => x.eligible || x.acquisition === "keep").sort((a, b) => a.tco5Usd - b.tco5Usd);
    scenarios[`${gk}__${ik}`] = { best: ranked[0], keepTco5Usd: keep.tco5Usd, savingsVsKeep5Usd: keep.tco5Usd - ranked[0].tco5Usd, recommendSwitch: ranked[0].acquisition !== "keep" && keep.tco5Usd - ranked[0].tco5Usd > 1500 };
    if (gk === "base" && ik === "base") ranking = ranked;
  }
  const base = scenarios["base__base"];
  return {
    matrix: { userId: user.userId, currentVehicleId: cur.id, annualizationFactor: r(ANNUALIZE, 3), gasScenarioMultipliers: GAS_SCENARIOS, options: matrix.sort((a, b) => a.annualEnergyCostUsd - b.annualEnergyCostUsd) },
    truth: {
      userId: user.userId, simulated: true, label: "best_vehicle_5yr", currentVehicleId: cur.id,
      method: "5-year TCO = depreciation + insurance + registration + maintenance + brake wear + energy + financing interest + tax/fees/trade-in loss - incentives. Eligibility applies the user's preferences. 'keep' is the do-nothing option.",
      best: base.best, keepTco5Usd: base.keepTco5Usd, savingsVsKeep5Usd: base.savingsVsKeep5Usd, recommendSwitch: base.recommendSwitch, negativeEquityUsd: Math.round(negEquity),
      scenarios, ranking: ranking.slice(0, 12)
    }
  };
}

// ---------- noise (separate rng so clean data is unaffected) ----------
const NR = makeRng(SEED + 999);
function noisyTx(tx, p) {
  const out = [];
  for (const x of tx) {
    const y = { ...x };
    const st = STATIONS.stations.find((s) => s.name === y.merchant);
    if (NR.chance(p)) y.merchant = st ? NR.pick(st.variants).replace("%d", String(NR.int(1000, 9999))) : y.merchant.toUpperCase();
    if (NR.chance(p / 2)) y.amountUsd = null;
    if (NR.chance(p / 3)) y.category = "non_driving";
    if (NR.chance(p / 3) && y.amountUsd != null) y.amountUsd = -y.amountUsd;
    out.push(y);
    if (NR.chance(p)) out.push({ ...y, txId: `${y.txId}-dup`, date: NR.chance(0.5) ? y.date : iso(new Date(new Date(y.date + "T00:00:00Z").getTime() + 86400000)) });
  }
  return out;
}
function noisyTrips(trips, p) {
  const out = [];
  for (const t of trips) {
    const y = JSON.parse(JSON.stringify(t));
    if (NR.chance(p)) y.weather.tempC = null;
    if (NR.chance(p / 2)) y.result.gallons = null;
    if (NR.chance(p / 4)) y.inputs.distanceKm = r(y.inputs.distanceKm * 0.621371, 2); // silent miles/km mix-up
    out.push(y);
    if (NR.chance(p / 3)) out.push({ ...y, tripId: `${y.tripId}-dup` });
  }
  return out;
}
const noisyOdometer = (rows, p) => rows.filter(() => !NR.chance(p)).map((x) => (NR.chance(p * 3) ? { ...x, odometerKm: x.odometerKm - NR.int(2000, 20000) } : x));

// ---------- run ----------
for (const d of ["users", "trips", "transactions", "finance", "coaching", "odometer", "samples", "what_if", "ground_truth", "noisy"]) rmSync(join(ROOT, d), { recursive: true, force: true });
write("reference/vehicles.json", { _note: "SIMULATED / ESTIMATE. Generated by generate.mjs: seed specs + engineEff/driveEff calibrated so the physics model matches each car's EPA rating on the reference trip (reference/constants.json). For BEV/PHEV, driveEff is wall-to-wheel (includes charging losses), so it is lower than motor efficiency alone.", vehicles: VEHICLES });

const users = Array.from({ length: USER_COUNT }, (_, i) => makeUser(i));
if (EDGE) ARCHETYPES.forEach((a, k) => users.push(makeUser(USER_COUNT + k, a)));
const summaries = [], matrixAll = [], truthAll = [], sampleIndex = [];
let totalTrips = 0;

for (const u of users) {
  const v = byId[u.vehicle.vehicleId];
  const { trips, odometer } = simulateUser(u);
  totalTrips += trips.length;
  const tx = makeTransactions(u, trips);
  const coach = coachingFor(u, trips);
  const { matrix, truth } = analyzeUser(u, trips);
  write(`users/${u.userId}.json`, u);
  write(`trips/${u.userId}_trips.json`, { userId: u.userId, simulated: true, sampledDays: SAMPLED_DAYS, trips });
  write(`transactions/${u.userId}_transactions.json`, { userId: u.userId, simulated: true, transactions: tx });
  write(`finance/${u.userId}_monthly.json`, monthlyFinance(u, trips, tx));
  write(`odometer/${u.userId}_odometer.json`, { userId: u.userId, simulated: true, readings: odometer });
  if (coach) write(`coaching/${u.userId}_coaching.json`, coach);
  if (NOISE_P > 0) {
    write(`noisy/transactions/${u.userId}_transactions.json`, { userId: u.userId, simulated: true, noiseLevel: NOISE_LEVEL, transactions: noisyTx(tx, NOISE_P) });
    write(`noisy/trips/${u.userId}_trips.json`, { userId: u.userId, simulated: true, noiseLevel: NOISE_LEVEL, trips: noisyTrips(trips, NOISE_P) });
    write(`noisy/odometer/${u.userId}_odometer.json`, { userId: u.userId, simulated: true, noiseLevel: NOISE_LEVEL, readings: noisyOdometer(odometer, NOISE_P) });
  }
  // Per-second sample trips (types/trip.ts Trip) for the map and charts
  const cand = [trips.find((t) => t.purpose === "commute_am"), trips.find((t) => t.inputs.condition !== "dry"), [...trips].sort((a, b) => b.inputs.distanceKm - a.inputs.distanceKm)[0]].filter(Boolean);
  for (const t of [...new Set(cand)].slice(0, SAMPLE_FILES)) {
    const st = stateFor(u, new Date(t.date + "T00:00:00Z").getUTCMonth());
    const trip = simulateSampleTrip({ v: { ...v, ...effOf(v) }, inp: t.inputs, region: regionOf(t.regionId), rng: makeRng(hashSeed(t.tripId) ^ SEED), tripId: t.tripId, regenEnabled: true, gasPrice: t.gasPriceUsdPerGal, start: st.home });
    writeTrip(`samples/${t.tripId}.json`, trip);
    sampleIndex.push({ file: `samples/${t.tripId}.json`, userId: u.userId, sourceTripId: t.tripId, vehicleId: v.id, purpose: t.purpose, condition: t.inputs.condition });
  }
  const sum = (f) => trips.reduce((a, t) => a + f(t), 0);
  const km = sum((t) => t.inputs.distanceKm), sc = trips.filter((t) => t.result.regenScore != null);
  summaries.push({
    userId: u.userId, alias: u.alias, archetype: u.archetype, vehicleId: v.id, driver: u.driver.style, regionId: u.regionId, sampledTrips: trips.length, sampledKm: r(km, 1),
    annualMilesEstimate: Math.round((km * ANNUALIZE) / 1.609344), annualEnergyCostUsd: Math.round(sum((t) => t.result.energyCostUsd) * ANNUALIZE),
    annualGallons: Math.round(sum((t) => t.result.gallons) * ANNUALIZE), annualCo2Kg: Math.round(sum((t) => t.result.co2Kg) * ANNUALIZE),
    avgRegenScore: sc.length ? r(sc.reduce((a, t) => a + t.result.regenScore, 0) / sc.length, 1) : null,
    annualRegenSavingsUsd: Math.round(sum((t) => t.result.regenSavings.usd) * ANNUALIZE), annualBrakeWearAvoidedUsd: Math.round(sum((t) => t.result.brakeWearAvoidedUsd) * ANNUALIZE),
    recommendedVehicleId: truth.best.vehicleId, recommendSwitch: truth.recommendSwitch, savingsVsKeep5Usd: Math.round(truth.savingsVsKeep5Usd)
  });
  matrixAll.push(matrix); truthAll.push(truth);
}

// Canonical compare sets: hilly / flat / mixed demo routes on a Camry Hybrid, every driver x condition plus a conventional baseline.
const camry = byId["toyota_camry_hybrid_2025"], aus = regionOf("austin_tx");
const ROUTES = {
  hill: { km: 8, gain: 16, mix: { urban: 0.3, suburban: 0.7, highway: 0 } },
  flat: { km: 10, gain: 2, mix: { urban: 0.5, suburban: 0.5, highway: 0 } },
  mixed: { km: 12, gain: 8, mix: { urban: 0.3, suburban: 0.4, highway: 0.3 } }
};
const CONDS = { dry: { tempC: 18 }, wet: { tempC: 14 }, snow: { tempC: -3 }, mud: { tempC: 12 } };
const compareIndex = [];
for (const [rid, rt] of Object.entries(ROUTES)) {
  const variants = [["conventional", "mixed", "dry", false], ...["smooth", "mixed", "aggressive"].flatMap((d) => Object.keys(CONDS).map((c) => [d, d, c, true]))];
  for (const [label, driver, cond, regen] of variants) {
    const inp = {
      distanceKm: rt.km, roadMix: rt.mix, gainM: rt.km * rt.gain, lossM: rt.km * rt.gain, tempC: CONDS[cond].tempC, windMs: 0, windCos: 0, condition: cond, unpavedShare: 0.5,
      driver, profile: DRIVERS[driver], extraMassKg: 80, crrMult: 1, tireMuMult: 1, cdaExtraM2: 0, altitudeM: aus.altitudeM, socStart: 0.6, batteryHealth: 1
    };
    const tripId = `${rid}-${label}-${cond}`;
    const trip = simulateSampleTrip({ v: { ...camry, ...effOf(camry) }, inp, region: aus, rng: makeRng(hashSeed("compare" + rid) ^ SEED), tripId, regenEnabled: regen, gasPrice: aus.gasUsdPerGal, start: { lat: aus.lat, lon: aus.lon } });
    writeTrip(`samples/compare/${tripId}.json`, trip);
    compareIndex.push({ file: `samples/compare/${tripId}.json`, route: rid, driver: label, condition: cond, regenEnabled: regen, score: trip.summary.score });
  }
}
write("samples/index.json", { simulated: true, note: "Files in samples/ are valid types/trip.ts Trip objects at 5 s resolution. compare/ holds the demo sets: hill, flat, mixed routes x driver x condition plus a conventional baseline. Route geometry and elevation are synthetic; lib/samples.mjs accepts a routeOverride with real points once Stream 2 caches exist.", userSamples: sampleIndex, compare: compareIndex });
write("users/users_index.json", { simulated: true, seed: SEED, userCount: users.length, summaries });
write("what_if/what_if_matrix.json", { simulated: true, seed: SEED, users: matrixAll });
write("ground_truth/best_car.json", { simulated: true, seed: SEED, labels: truthAll });
write("MANIFEST.json", {
  simulated: true, seed: SEED, generatedWith: `node generate.mjs ${args.join(" ")}`.trim(), userCount: users.length, totalTrips, sampledDaysPerUser: SAMPLED_DAYS,
  windows: WINDOWS.map((w) => `${YEAR}-${String(w.month + 1).padStart(2, "0")}-01 +${w.days}d`), vehicles: VEHICLES.length, noiseLevel: NOISE_LEVEL,
  sampleTripFiles: sampleIndex.length, compareFiles: compareIndex.length
});
console.log(`users=${users.length} trips=${totalTrips} vehicles=${VEHICLES.length} samples=${sampleIndex.length}+${compareIndex.length} seed=${SEED} noise=${NOISE_LEVEL}`);
