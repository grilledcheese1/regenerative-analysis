// Savings and coaching helpers. Pure functions. Conversions are APPROXIMATE estimates (see config).
import { CONFIG } from "../../config/regen.config.ts";
import type { Trip } from "../trip/types";
import { dragForceN, resolveSurface, rollForceN, slopeAngle } from "./model.ts";

export interface SavingsOpts {
  gasPriceUsd?: number;
  engineEfficiency?: number;
}

const J_PER_KWH = 3.6e6;

const usefulKwhPerGallon = (opts?: SavingsOpts) =>
  CONFIG.savings.kwhPerGallon * (opts?.engineEfficiency ?? CONFIG.savings.engineEfficiency);

/** Gallons of gasoline replaced by this much electrical energy recovered. */
export const gallonsFromKwh = (kwh: number, opts?: SavingsOpts) => Math.max(0, kwh) / usefulKwhPerGallon(opts);

export const dollarsFromGallons = (gallons: number, opts?: SavingsOpts) =>
  gallons * (opts?.gasPriceUsd ?? CONFIG.savings.gasPriceUsd);

export const co2FromGallons = (gallons: number) => gallons * CONFIG.savings.kgCo2PerGallon;

/** Savings for a given amount of electrical energy recovered. */
export function savingsFromKwh(kwh: number, opts?: SavingsOpts) {
  const gallons = gallonsFromKwh(kwh, opts);
  return { gallons, dollars: dollarsFromGallons(gallons, opts), co2Kg: co2FromGallons(gallons) };
}

/** Regen share of total braking energy, in percent (wheel energy, regen over regen + friction). */
export function brakeWearAvoidedPct(trip: Trip): number {
  let regen = 0;
  let friction = 0;
  for (const s of trip.samples) {
    regen += s.regenKw;
    friction += s.frictionKw;
  }
  const total = regen + friction;
  return total > 0 ? (100 * regen) / total : 0;
}

/** Dollar value of the electrical energy that went to friction brakes during missed samples. */
export function moneyLeftOnTableUsd(trip: Trip, opts?: SavingsOpts): number {
  const dt = trip.samples.length > 1 ? trip.samples[1].t - trip.samples[0].t : CONFIG.controller.dtS;
  let kwh = 0;
  for (const s of trip.samples) {
    if (s.missed) kwh += (CONFIG.regen.efficiency * s.frictionKw * dt) / 3600;
  }
  return savingsFromKwh(kwh, opts).dollars;
}

/** Yearly gallons, dollars and CO2 if this trip repeats tripsPerDay times a day, every day. */
export function annualProjection(trip: Trip, tripsPerDay: number, opts?: SavingsOpts) {
  const perTrip = savingsFromKwh(trip.summary.energyRecoveredKwh, opts);
  const k = tripsPerDay * 365;
  return { gallons: perTrip.gallons * k, dollars: perTrip.dollars * k, co2Kg: perTrip.co2Kg * k };
}

/**
 * Gasoline used (gallons): positive tractive energy along the samples, minus the electrical energy
 * recovered for hybrids, divided by useful kWh per gallon. Never below 0.
 */
export function estimateFuelUsedGallons(trip: Trip, opts?: SavingsOpts): number {
  const { massKg, gravity } = CONFIG.vehicle;
  const s = trip.samples;
  const crr = CONFIG.surfaces[resolveSurface(trip.header.condition)].crr;
  let tractiveJ = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const dt = s[i + 1].t - s[i].t;
    if (dt <= 0) continue;
    const v = (s[i].speed + s[i + 1].speed) / 2;
    const a = (s[i + 1].speed - s[i].speed) / dt;
    const theta = slopeAngle(s[i].grade);
    const force = massKg * a + dragForceN(v) + rollForceN(crr, theta) + massKg * gravity * Math.sin(theta);
    tractiveJ += Math.max(0, force * v) * dt;
  }
  const recovered = trip.header.regenEnabled ? trip.summary.energyRecoveredKwh : 0;
  const netKwh = tractiveJ / J_PER_KWH - recovered;
  return Math.max(0, netKwh / usefulKwhPerGallon(opts));
}
