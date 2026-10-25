// Aggregate (per-trip) energy and regen model. SIMULATED / estimates.
import { K, SURF, ROADS, REG, DEPR } from "./data.mjs";
import { clamp } from "./rng.mjs";

export const J_PER_KWH = 3.6e6;

export function socFactor(soc) {
  return 1 - K.socFadeMaxLoss * clamp((soc - K.socFadeStart) / (1 - K.socFadeStart), 0, 1);
}
export function coldFactor(tC) {
  const c = K.coldBattery;
  if (tC >= c.fullRegenAboveC) return 1;
  if (tC >= 0) return c.factorAtZeroC + (1 - c.factorAtZeroC) * (tC / c.fullRegenAboveC);
  return Math.max(c.factorAtMinus15C, c.factorAtZeroC - ((c.factorAtZeroC - c.factorAtMinus15C) * -tC) / 15);
}
export function hotFactor(tC) {
  const h = K.hotBattery;
  return tC <= h.throttleAboveC ? 1 : Math.max(h.minFactor, 1 - h.lossPerC * (tC - h.throttleAboveC));
}
export const healthRegenFactor = (health) => 1 - K.batteryAging.regenPowerLossAtZeroHealth * (1 - clamp(health ?? 1, 0, 1));

// Fraction of a constant-deceleration stop's energy a power-limited regen system handles.
export function powerLimitedCapture(m, a, vs, pMaxW) {
  if (pMaxW <= 0) return 0;
  const vc = pMaxW / (m * a);
  if (vc >= vs) return 1;
  return (0.5 * m * vc * vc + (pMaxW * (vs - vc)) / a) / (0.5 * m * vs * vs);
}

export const rangeKm = (v) => (v.powertrain === "bev" && v.epa.mpge ? (0.9 * v.batteryKwh) / (33.705 / v.epa.mpge / 1.609344) : null);

export function surfaceOf(inp) {
  return SURF[inp.surfaceDetail ?? inp.condition];
}

/**
 * inputs: distanceKm, roadMix, gainM, lossM, tempC, windMs, windCos, condition, surfaceDetail?, unpavedShare,
 *         profile{brakeDecelMs2,coastFraction,downhillBrakeFraction,speedFactor}, extraMassKg, crrMult,
 *         tireMuMult?, cdaExtraM2?, highwayRmsMs?, stopDensityMult?, batteryHealth?, altitudeM, socStart
 * eng: {engineEff, driveEff}. regen: false gives the conventional-brake baseline.
 */
export function model(v, eng, inp, regen = true) {
  const g = K.gravity, prof = inp.profile, surf = surfaceOf(inp);
  const mudBlend = inp.condition === "mud" ? inp.unpavedShare : 0;
  const mu = surf.mu * (inp.tireMuMult ?? 1);
  const crr = (surf.crr * (1 - mudBlend) + SURF.mud.crr * mudBlend) * inp.crrMult * (v.crr / 0.01);
  const m = v.massKg + inp.extraMassKg;
  const dM = inp.distanceKm * 1000;
  const rho = K.airDensitySeaLevel * (288.15 / (inp.tempC + 273.15)) * Math.exp(-inp.altitudeM / 8500);
  const cda = v.cd * v.frontalAreaM2 + (inp.cdaExtraM2 ?? 0);

  const eRoll = crr * m * g * dM;
  let eDrag = 0, eStopKE = 0, stops = 0, stopWaitS = 0, durationS = 0;
  for (const [type, frac] of Object.entries(inp.roadMix)) {
    if (frac <= 0) continue;
    const R = ROADS[type], d = dM * frac;
    const vrmsBase = type === "highway" && inp.highwayRmsMs ? inp.highwayRmsMs : R.rmsSpeedMs;
    const vrms = vrmsBase * prof.speedFactor;
    const wEff = inp.windMs * inp.windCos;
    eDrag += 0.5 * rho * cda * (vrms * vrms + 2 * vrms * wEff + wEff * wEff) * d;
    const n = ((R.stopsPerKm * (inp.stopDensityMult ?? 1) * d) / 1000);
    stops += n; stopWaitS += n * R.stopWaitS;
    eStopKE += n * 0.5 * m * R.stopSpeedMs ** 2 * (1 - prof.coastFraction);
    durationS += d / (R.avgSpeedMs * (vrmsBase / R.rmsSpeedMs));
  }
  const eClimb = m * g * inp.gainM;
  const eDownhill = m * g * inp.lossM;
  const eDownBraked = eDownhill * prof.downhillBrakeFraction;
  const eDownCoast = Math.min(eDownhill - eDownBraked, 0.8 * (eRoll + eDrag));
  const wheelDemand = Math.max(0.1 * (eRoll + eDrag), eRoll + eDrag + eClimb + eStopKE - eDownCoast) / J_PER_KWH;
  const brakeEnergy = (eStopKE + eDownBraked) / J_PER_KWH;
  const hours = (durationS + stopWaitS) / 3600;

  let regenKwh = 0, ceilKwh = 0, thermalThrottleKwh = 0;
  let missed = { "late braking": 0, "low grip": 0, "full battery": 0, "cold battery": 0 };
  if (regen && v.maxRegenKw > 0) {
    const a = Math.max(0.6, (prof.brakeDecelMs2 + (inp.decelJitter ?? 0)) * surf.brakeSoftening);
    const pMax = v.maxRegenKw * 1000 * healthRegenFactor(inp.batteryHealth);
    const vs = ROADS.suburban.stopSpeedMs;
    const cPowStop = powerLimitedCapture(m, a, vs, pMax) * (Math.min(a, v.maxRegenDecel) / a);
    const cGrip = Math.min(1, (mu * g * v.drivenAxleWeight * K.regenGripUtilization) / a);
    const gradeAvg = dM > 0 ? inp.lossM / dM : 0;
    const pDown = Math.max(1, m * g * gradeAvg * 20 - 0.5 * rho * cda * 20 ** 3);
    const cPowDown = Math.min(1, pMax / pDown);
    const bS = eStopKE / J_PER_KWH, bD = eDownBraked / J_PER_KWH, eta = v.regenEta;
    ceilKwh = eta * (bS + bD);
    const x1 = eta * (bS * cPowStop + bD * cPowDown);
    const x2 = eta * (bS * cPowStop * cGrip + bD * cPowDown);
    const x3 = x2 * socFactor(inp.socStart);
    const x4 = x3 * coldFactor(inp.tempC);
    const x5 = x4 * hotFactor(inp.tempC);
    thermalThrottleKwh = x4 - x5;
    // Hot-battery throttling is lumped under "full battery": the pack cannot accept the charge.
    missed = { "late braking": ceilKwh - x1, "low grip": x1 - x2, "full battery": x2 - x3 + (x4 - x5), "cold battery": x3 - x4 };
    regenKwh = x5;
  } else if (v.maxRegenKw > 0) {
    ceilKwh = v.regenEta * brakeEnergy;
  }

  const ev = v.powertrain === "bev";
  let accKw = K.hvacKw.base;
  if (inp.tempC > 26) accKw += K.hvacKw.acAbove26C + K.hvacKw.acPerCAbove26 * (inp.tempC - 26);
  if (ev && inp.tempC < 5) accKw += K.hvacKw.evHeatBelow5C;
  const accKwh = accKw * hours;

  const net = Math.max(0, wheelDemand - regenKwh);
  const gasLike = v.powertrain !== "bev";
  const idleGal = gasLike ? v.idleGalPerHour * (stopWaitS / 3600) : 0;
  const gallonsGasMode = gasLike ? (net + accKwh) / eng.engineEff / REG.gasolineKwhPerGal + idleGal : 0;
  const kwhElecMode = v.batteryKwh > 0 && v.powertrain !== "hybrid" ? net / eng.driveEff + accKwh : 0;
  const heatKwh = Math.max(0, brakeEnergy - regenKwh / (v.regenEta || 1));
  const brakeWearUsd = (heatKwh / v.brakeLifeFrictionKwh) * v.brakeServiceUsd;

  return {
    wheelDemandKwh: wheelDemand, brakeEnergyKwh: brakeEnergy, regenKwh, ceilKwh, missed, heatKwh, brakeWearUsd,
    thermalThrottleKwh, gallonsGasMode, kwhElecMode, stops, durationMin: (durationS + stopWaitS) / 60
  };
}

// Combine gas/electric by powertrain. uf = PHEV share of energy run electric.
export function energyOf(v, out, uf) {
  if (v.powertrain === "bev") return { gallons: 0, kwh: out.kwhElecMode };
  if (v.powertrain === "phev") return { gallons: (1 - uf) * out.gallonsGasMode, kwh: uf * out.kwhElecMode };
  return { gallons: out.gallonsGasMode, kwh: 0 };
}

function refInputs(profile) {
  const ref = K.referenceTrip;
  return {
    distanceKm: ref.distanceKm, roadMix: ref.roadMix, gainM: 0, lossM: 0, tempC: ref.tempC, windMs: 0, windCos: 0,
    condition: "dry", unpavedShare: 0, profile, extraMassKg: 0, crrMult: 1, altitudeM: 0, socStart: 0.6
  };
}
// Solve engineEff / driveEff so the reference trip reproduces the car's EPA number.
export function calibrate(v, mixedProfile) {
  const eng = { engineEff: 0.3, driveEff: K.evDriveEffDefault };
  const mi = K.referenceTrip.distanceKm / 1.609344;
  const probe = model(v, eng, refInputs(mixedProfile), true);
  const net = Math.max(1e-6, probe.wheelDemandKwh - probe.regenKwh);
  const acc = (K.hvacKw.base * probe.durationMin) / 60;
  if (v.epa.gasMpg) {
    const idleGal = v.idleGalPerHour * ((probe.stops * 22) / 3600);
    eng.engineEff = (net + acc) / ((mi / v.epa.gasMpg) * REG.gasolineKwhPerGal - idleGal * REG.gasolineKwhPerGal);
  }
  if (v.epa.mpge || v.epa.elecKwhPer100Mi) {
    const kwh = v.epa.mpge ? (mi * 33.705) / v.epa.mpge : (mi * v.epa.elecKwhPer100Mi) / 100;
    eng.driveEff = net / (kwh - acc);
  }
  return { engineEff: Number(eng.engineEff.toFixed(4)), driveEff: Number(eng.driveEff.toFixed(4)) };
}

// ---------- charging ----------
// Average DC power while charging from socA to socB, integrating the vehicle's charge curve.
export function dcAvgKw(v, socA, socB) {
  const c = v.charging?.dcCurve ?? [];
  if (!c.length) return 0;
  const at = (s) => { for (let i = 1; i < c.length; i++) if (s <= c[i].soc) { const p = c[i - 1], q = c[i]; return p.kw + ((q.kw - p.kw) * (s - p.soc)) / (q.soc - p.soc); } return c[c.length - 1].kw; };
  let sum = 0, n = 20;
  for (let i = 0; i < n; i++) sum += at(socA + ((socB - socA) * (i + 0.5)) / n);
  return sum / n;
}
export function chargeSession(v, kwhDelivered, kind) {
  const ch = v.charging;
  if (!ch) return null;
  const dc = kind === "dc" && ch.dcPeakKw > 0;
  const startSoc = clamp(0.8 - kwhDelivered / v.batteryKwh, 0.05, 0.8);
  const kw = dc ? dcAvgKw(v, startSoc, startSoc + kwhDelivered / v.batteryKwh) : ch.acKw;
  const eff = dc ? ch.dcEfficiency : ch.acEfficiency;
  return { kind: dc ? "dc" : "l2", avgKw: kw, durationMin: (kwhDelivered / kw) * 60, kwhFromGrid: kwhDelivered / eff, startSoc, efficiency: eff };
}

// ---------- values ----------
export function retained(cls, age) {
  const c = DEPR[cls], i = Math.floor(age), f = age - i;
  const a = c[Math.min(i, c.length - 1)], b = c[Math.min(i + 1, c.length - 1)];
  return a + (b - a) * f;
}
export function amortPayment(P, aprPct, n) {
  const i = aprPct / 1200;
  return i === 0 ? P / n : (P * i) / (1 - Math.pow(1 + i, -n));
}
export function loanBalance(P, aprPct, n, paid) {
  const i = aprPct / 1200, pmt = amortPayment(P, aprPct, n);
  return i === 0 ? P - pmt * paid : P * Math.pow(1 + i, paid) - (pmt * (Math.pow(1 + i, paid) - 1)) / i;
}
