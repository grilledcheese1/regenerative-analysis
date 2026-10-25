// Per-second drive simulation that outputs a file in the exact shape of types/trip.ts `Trip`.
// SIMULATED. Elevation and route geometry are synthetic unless `routeOverride` supplies real points.
import { K, ROADS, REG } from "./data.mjs";
import { socFactor, coldFactor, hotFactor, healthRegenFactor, surfaceOf } from "./physics.mjs";
import { clamp, r } from "./rng.mjs";

const ACCEL = { smooth: 1.0, mixed: 1.6, aggressive: 2.5 };
const SAMPLE_STEP_S = 5;

function buildPath(o, rng, dM) {
  const pts = []; // {s, lat, lon, elev}
  if (o.routeOverride?.points?.length > 1) {
    let s = 0;
    const P = o.routeOverride.points;
    for (let i = 0; i < P.length; i++) {
      if (i > 0) {
        const dLat = (P[i].lat - P[i - 1].lat) * 111320;
        const dLon = (P[i].lon - P[i - 1].lon) * 111320 * Math.cos((P[i].lat * Math.PI) / 180);
        s += Math.hypot(dLat, dLon);
      }
      pts.push({ s, lat: P[i].lat, lon: P[i].lon, elev: P[i].elevation });
    }
    return { pts, totalM: s };
  }
  const step = 100, n = Math.ceil(dM / step);
  // Elevation increments scaled so total climb and descent match the trip inputs.
  let z = 0; const inc = [];
  for (let i = 0; i < n; i++) { z = 0.6 * z + rng.normal(0, 1); inc.push(z); }
  const pos = inc.filter((x) => x > 0).reduce((a, b) => a + b, 0) || 1;
  const neg = -inc.filter((x) => x < 0).reduce((a, b) => a + b, 0) || 1;
  let elev = o.inp.altitudeM + rng.uni(0, 40), heading = rng.uni(0, 2 * Math.PI);
  let lat = o.start.lat, lon = o.start.lon;
  pts.push({ s: 0, lat, lon, elev });
  for (let i = 0; i < n; i++) {
    elev += inc[i] > 0 ? (inc[i] / pos) * o.inp.gainM : (inc[i] / neg) * o.inp.lossM;
    heading += rng.normal(0, 0.18);
    lat += (step * Math.cos(heading)) / 111320;
    lon += (step * Math.sin(heading)) / (111320 * Math.cos((lat * Math.PI) / 180));
    pts.push({ s: Math.min((i + 1) * step, dM), lat, lon, elev });
  }
  return { pts, totalM: dM };
}
function at(path, s) {
  const p = path.pts;
  const i = clamp(Math.floor(s / (p.length > 1 ? (p[1].s - p[0].s || 100) : 100)), 0, p.length - 2);
  let k = i;
  while (k < p.length - 2 && p[k + 1].s < s) k++;
  while (k > 0 && p[k].s > s) k--;
  const a = p[k], b = p[k + 1], f = b.s === a.s ? 0 : clamp((s - a.s) / (b.s - a.s), 0, 1);
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, elev: a.elev + (b.elev - a.elev) * f, gradePct: b.s === a.s ? 0 : ((b.elev - a.elev) / (b.s - a.s)) * 100 };
}

/**
 * o: { v, inp, region, rng, tripId, regenEnabled, gasPrice, start:{lat,lon}, routeOverride? }
 * Returns a Trip (header, samples, summary) per types/trip.ts.
 */
export function simulateSampleTrip(o) {
  const { v, inp, rng } = o;
  const g = K.gravity, prof = inp.profile, surf = surfaceOf(inp);
  const mudBlend = inp.condition === "mud" ? inp.unpavedShare : 0;
  const mu = surf.mu * (inp.tireMuMult ?? 1);
  const crr = (surf.crr * (1 - mudBlend) + 0.04 * mudBlend) * inp.crrMult * (v.crr / 0.01);
  const m = v.massKg + inp.extraMassKg;
  const rho = K.airDensitySeaLevel * (288.15 / (inp.tempC + 273.15)) * Math.exp(-inp.altitudeM / 8500);
  const cda = v.cd * v.frontalAreaM2 + (inp.cdaExtraM2 ?? 0);
  const wEff = inp.windMs * inp.windCos;
  const dM = inp.distanceKm * 1000;
  const path = buildPath(o, rng, dM);
  const total = path.totalM;
  const regenCapable = v.maxRegenKw > 0 && o.regenEnabled;

  // Road chunks and stop positions.
  const order = ["urban", "suburban", "highway", "suburban", "urban"];
  const share = { ...inp.roadMix };
  const chunks = []; let cursor = 0;
  for (const t of order) {
    const mult = t === "highway" ? 1 : 0.5;
    const len = total * (share[t] ?? 0) * mult;
    if (len > 1) { chunks.push({ type: t, from: cursor, to: cursor + len }); cursor += len; }
  }
  if (chunks.length) chunks[chunks.length - 1].to = total;
  else chunks.push({ type: "suburban", from: 0, to: total });
  const stops = [];
  for (const c of chunks) {
    const R = ROADS[c.type];
    const nStops = Math.max(0, Math.round((R.stopsPerKm * (inp.stopDensityMult ?? 1) * (c.to - c.from)) / 1000 + rng.uni(-0.4, 0.4)));
    const cruiseBase = c.type === "highway" && inp.highwayRmsMs ? inp.highwayRmsMs : R.rmsSpeedMs;
    c.cruise = cruiseBase * prof.speedFactor * (1 + rng.normal(0, 0.04));
    c.dwell = R.stopWaitS;
    for (let i = 0; i < nStops; i++) stops.push({ s: rng.uni(c.from + 40, c.to - 40), dwell: R.stopWaitS });
  }
  stops.sort((a, b) => a.s - b.s);
  stops.push({ s: total, dwell: 0, final: true });

  const aBrake = Math.max(0.6, (prof.brakeDecelMs2 + (inp.decelJitter ?? 0)) * surf.brakeSoftening);
  const aAcc = (ACCEL[inp.driver] ?? 1.6) * Math.max(0.5, surf.brakeSoftening);
  const pCap = v.maxRegenKw * healthRegenFactor(inp.batteryHealth);

  let s = 0, vel = 0, t = 0, dwell = 0, nextStop = 0, soc = inp.socStart;
  let brakeE = 0, regenE = 0, ceilE = 0, heatE = 0;
  const rows = [];
  const maxT = 6 * 3600;
  while (t < maxT) {
    const stop = stops[nextStop];
    if (dwell > 0) {
      dwell -= 1;
    }
    const chunk = chunks.find((c) => s >= c.from && s <= c.to) ?? chunks[chunks.length - 1];
    const distToStop = stop.s - s;
    const vAllowed = Math.sqrt(2 * aBrake * Math.max(0, distToStop - 2));
    const target = dwell > 0 ? 0 : Math.min(chunk.cruise, vAllowed);
    let a = 0;
    if (vel < target) a = Math.min(aAcc, target - vel);
    else if (vel > target) a = -Math.min(Math.max(aBrake, 0.5), vel - target);
    const vNew = Math.max(0, vel + a);
    a = vNew - vel;
    const sMid = s + (vel + vNew) / 2;
    const loc = at(path, Math.min(sMid, total));
    const theta = Math.atan(loc.gradePct / 100);
    const vMid = (vel + vNew) / 2;
    const fTotal = m * a + m * g * Math.sin(theta) + crr * m * g * Math.cos(theta) + 0.5 * rho * cda * (vMid + wEff) * Math.abs(vMid + wEff);
    const pWheelW = fTotal * vMid;
    const pBrakeKw = pWheelW < 0 ? -pWheelW / 1000 : 0;
    const brake = clamp(-fTotal / (m * 4), 0, 1);

    let regenKw = 0, frictionKw = pBrakeKw, missed = null;
    const cSoc = socFactor(soc), cCold = coldFactor(inp.tempC), cHot = hotFactor(inp.tempC);
    if (pBrakeKw > 0) {
      brakeE += pBrakeKw / 3600;
      if (regenCapable) {
        const lowSpeed = clamp(vMid / 3, 0, 1);
        const decelCap = (v.maxRegenDecel * m * vMid) / 1000;
        const gripCap = (mu * g * v.drivenAxleWeight * K.regenGripUtilization * m * vMid) / 1000;
        const battCap = pCap * cSoc * cCold * cHot;
        const limit = Math.min(pCap, decelCap, gripCap, battCap) * lowSpeed;
        regenKw = Math.min(pBrakeKw, limit);
        frictionKw = pBrakeKw - regenKw;
        ceilE += (v.regenEta * pBrakeKw) / 3600;
        regenE += (v.regenEta * regenKw) / 3600;
        if (frictionKw > 0.5) {
          const bind = Math.min(pCap, decelCap, gripCap, battCap);
          if (lowSpeed < 1 || bind === pCap || bind === decelCap) missed = "late braking";
          else if (bind === gripCap) missed = "low grip";
          else missed = cSoc * cHot <= cCold ? "full battery" : "cold battery";
        }
      } else if (v.maxRegenKw > 0) {
        ceilE += (v.regenEta * pBrakeKw) / 3600;
      }
      heatE += frictionKw / 3600;
    }
    // State of charge: hybrids hover near 60%, EVs drain by driving demand.
    if (v.batteryKwh > 0) {
      const regenElecKwh = (v.regenEta * regenKw) / 3600;
      if (v.powertrain === "hybrid") soc += regenElecKwh / v.batteryKwh - (0.5 * (soc - 0.6)) / 60;
      else soc += (regenElecKwh - (pWheelW > 0 ? pWheelW / 1000 / (v.driveEff ?? 0.8) / 3600 : 0)) / v.batteryKwh;
      soc = clamp(soc, 0.05, 1);
    }
    rows.push({ t, s: sMid, speed: vNew, loc, gradePct: loc.gradePct, brake, regenKw, frictionKw, missed, soc });
    s += (vel + vNew) / 2; vel = vNew; t += 1;
    if (stop.s - s <= 2 && vel < 0.3) {
      if (stop.final) break;
      dwell = stop.dwell; nextStop += 1;
      s = stop.s;
    }
  }

  // Downsample (average power over each window so energy stays consistent).
  const samples = [];
  for (let i = 0; i < rows.length; i += SAMPLE_STEP_S) {
    const w = rows.slice(Math.max(0, i - SAMPLE_STEP_S + 1), i + 1);
    const avg = (f) => w.reduce((a, x) => a + f(x), 0) / w.length;
    const last = rows[i];
    const cause = [...w].reverse().find((x) => x.missed)?.missed ?? null;
    const sample = {
      t: last.t, lat: r(last.loc.lat, 6), lon: r(last.loc.lon, 6), speed: r(last.speed, 2), elevation: r(last.loc.elev, 1),
      grade: r(last.gradePct, 2), brake: r(avg((x) => x.brake), 3), regenKw: r(avg((x) => x.regenKw), 2), frictionKw: r(avg((x) => x.frictionKw), 2)
    };
    if (v.batteryKwh > 0) sample.soc = r(last.soc, 3);
    sample.missed = cause;
    samples.push(sample);
  }

  // Missed events: contiguous friction-while-regen-could-help episodes.
  const missedEvents = [];
  let cur = null;
  for (const x of rows) {
    if (x.missed && cur && cur.cause === x.missed && x.t - cur.last <= 2) { cur.last = x.t; cur.kwh += x.frictionKw / 3600; cur.n++; }
    else {
      if (cur && cur.n >= 2 && cur.kwh > 0.003) missedEvents.push({ t: cur.t, cause: cur.cause });
      cur = x.missed ? { t: x.t, cause: x.missed, last: x.t, kwh: x.frictionKw / 3600, n: 1 } : null;
    }
  }
  if (cur && cur.n >= 2 && cur.kwh > 0.003) missedEvents.push({ t: cur.t, cause: cur.cause });

  const gallonsSaved = regenE / (REG.gasolineKwhPerGal * 0.3);
  return {
    header: {
      tripId: o.tripId, driver: inp.driver, vehicle: `${v.make} ${v.model} (simulated)`, condition: inp.condition,
      regenEnabled: !!o.regenEnabled, distanceM: Math.round(total)
    },
    samples,
    summary: {
      score: ceilE > 0 ? r((100 * regenE) / ceilE, 1) : 0,
      energyRecoveredKwh: r(regenE, 3), energyCeilingKwh: r(ceilE, 3), heatLossKwh: r(heatE, 3),
      missedEvents, gallonsSaved: r(gallonsSaved, 4), dollarsSaved: r(gallonsSaved * o.gasPrice, 3), co2Kg: r(gallonsSaved * REG.gasolineCo2KgPerGal, 3)
    }
  };
}
