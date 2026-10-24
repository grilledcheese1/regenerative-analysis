// Scoring and summary. Pure. APPROXIMATION: the ceiling is an idealized estimate of recoverable energy.
import { CONFIG } from "../../config/regen.config.ts";
import type { Sample, TripSummary } from "../trip/types";
import { savingsFromKwh } from "./savings.ts";
import { totalDescentM, type Geometry } from "./route.ts";

const J_PER_KWH = 3.6e6;
const { vehicle, regen } = CONFIG;

/** Energy ceiling (kWh, electrical): eta x (m g descent + sum of stop kinetic energies at the speed limit). */
export function ceilingKwh(geometry: Geometry, stopRefSpeeds: number[]): number {
  const descentM = totalDescentM(geometry, CONFIG.score.elevationSmoothingM);
  const potentialJ = vehicle.massKg * vehicle.gravity * descentM;
  const kineticJ = stopRefSpeeds.reduce((sum, v) => sum + 0.5 * vehicle.massKg * v * v, 0);
  return (regen.efficiency * (potentialJ + kineticJ) * CONFIG.score.ceilingScale) / J_PER_KWH;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Contiguous missed samples of the same cause become one event, stamped with its first time. */
function missedEvents(samples: Sample[]): TripSummary["missedEvents"] {
  const events: NonNullable<TripSummary["missedEvents"]> = [];
  for (let i = 0; i < samples.length; i++) {
    const m = samples[i].missed;
    if (!m) continue;
    if (i > 0 && samples[i - 1].missed === m) continue;
    events.push({ t: samples[i].t, cause: m });
  }
  return events;
}

export function summarize(samples: Sample[], ceiling: number, regenEnabled: boolean): TripSummary {
  const dt = samples.length > 1 ? samples[1].t - samples[0].t : CONFIG.controller.dtS;
  let regenKwSum = 0;
  let frictionKwSum = 0;
  for (const s of samples) {
    regenKwSum += s.regenKw;
    frictionKwSum += s.frictionKw;
  }
  const energyRecoveredKwh = regenEnabled ? (regen.efficiency * regenKwSum * dt) / 3600 : 0;
  const heatLossKwh = (frictionKwSum * dt) / 3600;
  const score =
    regenEnabled && ceiling > 0 ? round1(Math.min(100, Math.max(0, (100 * energyRecoveredKwh) / ceiling))) : 0;
  const savings = savingsFromKwh(energyRecoveredKwh);
  return {
    score,
    energyRecoveredKwh,
    energyCeilingKwh: ceiling,
    heatLossKwh,
    missedEvents: regenEnabled ? missedEvents(samples) : [],
    gallonsSaved: savings.gallons,
    dollarsSaved: savings.dollars,
    co2Kg: savings.co2Kg,
  };
}
