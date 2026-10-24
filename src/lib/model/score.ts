import type { MissedCause, TripScore } from "@/lib/types";
import { SAVINGS, SMOOTH_BRAKE_LIMIT_MS2, VEHICLE } from "./config";
import type { SimTrip } from "./simulate";

const J_PER_KWH = 3.6e6;

export interface Axis {
  key: string;
  label: string;
  value: number; // 0..100
  formula: string;
  evidence: string;
}

export interface MissedEvent {
  t: number;
  lat: number;
  lon: number;
  cause: MissedCause;
  lostKwh: number; // regen that could have been recovered
}

export interface TripAnalysis extends TripScore {
  label: string;
  tractionKwh: number;
  durationS: number;
  regenShare: number; // share of braking energy handled by regen, 0..1
  axes: Axis[];
  missed: MissedEvent[];
  fuelGallons: number;
}

const sumKwh = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / 3600;
const pct = (n: number, d: number) => (d > 0 ? Math.min(100, (100 * n) / d) : 100);

export function scoreLabel(score: number): string {
  if (score >= 80) return "Efficient";
  if (score >= 60) return "Decent capture";
  if (score >= 40) return "Leaving energy on the road";
  return "Burning it as brake heat";
}

export function analyzeTrip(trip: SimTrip): TripAnalysis {
  const { massKg: m, gravity: g, regenEfficiency: eta } = VEHICLE;
  const s = trip.samples;

  const regenKwh = sumKwh(s.map((x) => x.regenKw));
  const frictionKwh = sumKwh(s.map((x) => x.frictionKw));
  const tractionKwh = sumKwh(s.map((x) => x.tractionKw));

  const descentKwh = (eta * m * g * trip.descentM) / J_PER_KWH;
  const stopKwh =
    (eta * trip.stopSpeedsMs.reduce((acc, v) => acc + 0.5 * m * v * v, 0)) / J_PER_KWH;
  const ceilingKwh = descentKwh + stopKwh;
  const score = Math.round(pct(regenKwh, ceilingKwh));

  const descentRegen = sumKwh(s.filter((x) => x.gradePct < -1).map((x) => x.regenKw));
  const stopRegen = sumKwh(s.filter((x) => x.gradePct >= -1).map((x) => x.regenKw));
  const braking = s.filter((x) => x.accelMs2 < 0 && x.speedMs > 0.5);
  const smoothBrakes = braking.filter((x) => -x.accelMs2 <= SMOOTH_BRAKE_LIMIT_MS2);
  const moving = s.filter((x) => x.speedMs > 0.5);
  const legal = moving.filter((x) => x.speedMs <= x.limitMs * 1.03);

  const axes: Axis[] = [
    {
      key: "descent",
      label: "Descent capture",
      value: Math.round(pct(descentRegen, descentKwh)),
      formula: "regen on grades < -1% ÷ η·m·g·Δh_descent",
      evidence: `${descentRegen.toFixed(3)} kWh of ${descentKwh.toFixed(3)} kWh over ${trip.descentM.toFixed(0)} m of descent`,
    },
    {
      key: "stops",
      label: "Stop capture",
      value: Math.round(pct(stopRegen, stopKwh)),
      formula: "regen on flat/uphill ÷ η·Σ ½·m·v²_stop",
      evidence: `${stopRegen.toFixed(3)} kWh of ${stopKwh.toFixed(3)} kWh across ${trip.stopSpeedsMs.length} stops (approach speeds ${trip.stopSpeedsMs.map((v) => (v * 2.237).toFixed(0)).join(", ")} mph)`,
    },
    {
      key: "smooth",
      label: "Brake smoothness",
      value: Math.round(pct(smoothBrakes.length, braking.length)),
      formula: `braking seconds with decel ≤ ${SMOOTH_BRAKE_LIMIT_MS2} m/s² ÷ all braking seconds`,
      evidence: `${smoothBrakes.length} of ${braking.length} braking seconds were gentle`,
    },
    {
      key: "speed",
      label: "Speed discipline",
      value: Math.round(pct(legal.length, moving.length)),
      formula: "moving seconds within 3% of the limit ÷ all moving seconds",
      evidence: `${legal.length} of ${moving.length} moving seconds at or under the limit`,
    },
  ];

  const missed: MissedEvent[] = [];
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (!x.missed) continue;
    const lostKwh = (x.frictionKw * eta) / 3600;
    const prev = missed[missed.length - 1];
    if (prev && prev.cause === x.missed && s[i - 1]?.missed === x.missed) {
      prev.lostKwh += lostKwh;
    } else {
      missed.push({ t: x.t, lat: x.lat, lon: x.lon, cause: x.missed, lostKwh });
    }
  }

  // Drop sub-2 Wh blips so the map and log only show events worth coaching on.
  const significant = missed.filter((e) => e.lostKwh >= 0.002);

  const usefulKwhPerGallon = SAVINGS.kwhPerGallon * SAVINGS.engineEfficiency;
  const brakeKwh = regenKwh / eta + frictionKwh;

  return {
    score,
    label: scoreLabel(score),
    regenKwh,
    ceilingKwh,
    frictionKwh,
    tractionKwh,
    missedCount: significant.length,
    durationS: s.length,
    regenShare: brakeKwh > 0 ? regenKwh / eta / brakeKwh : 0,
    axes,
    missed: significant,
    fuelGallons: Math.max(0, tractionKwh - regenKwh) / usefulKwhPerGallon,
  };
}

export interface Savings {
  gallons: number;
  dollars: number;
  co2Kg: number;
  leftOnTableDollars: number;
  annualDollars: number;
  annualGallons: number;
  annualCo2Kg: number;
}

export function estimateSavings(a: TripAnalysis, gasPrice: number, tripsPerDay: number): Savings {
  const perGallon = SAVINGS.kwhPerGallon * SAVINGS.engineEfficiency;
  const gallons = a.regenKwh / perGallon;
  const lostKwh = a.missed.reduce((acc, e) => acc + e.lostKwh, 0);
  const yearly = tripsPerDay * 365;
  return {
    gallons,
    dollars: gallons * gasPrice,
    co2Kg: gallons * SAVINGS.kgCo2PerGallon,
    leftOnTableDollars: (lostKwh / perGallon) * gasPrice,
    annualDollars: gallons * gasPrice * yearly,
    annualGallons: gallons * yearly,
    annualCo2Kg: gallons * SAVINGS.kgCo2PerGallon * yearly,
  };
}
