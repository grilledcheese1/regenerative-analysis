// Physics primitives. Pure functions. This is a simplified APPROXIMATION of a hybrid car, not a
// validated vehicle model; all constants come from config/regen.config.ts and are estimates.
import { CONFIG, type SurfaceKey } from "../../config/regen.config.ts";
import type { Condition, MissedCause } from "../trip/types";

const { vehicle, regen, battery } = CONFIG;

/** Effective surface for a route point under a weather condition. Unknown or missing counts as asphalt. */
export function resolveSurface(condition: Condition, surface?: string): SurfaceKey {
  const unpaved = surface === "gravel" || surface === "dirt";
  if (condition === "snow") return "snow";
  if (condition === "wet" || condition === "mud") return unpaved ? "mud" : "wetAsphalt";
  return unpaved ? "gravel" : "dryAsphalt";
}

export const slopeAngle = (gradePct: number) => Math.atan(gradePct / 100);

export const dragForceN = (v: number) =>
  0.5 * vehicle.airDensity * vehicle.dragCoefficient * vehicle.frontalAreaM2 * v * v;

export const rollForceN = (crr: number, theta: number) =>
  crr * vehicle.massKg * vehicle.gravity * Math.cos(theta);

/** Natural deceleration (m/s^2, positive = slowing) with no throttle and no brakes. Negative on steep descents. */
export function naturalDecel(v: number, gradePct: number, crr: number): number {
  const theta = slopeAngle(gradePct);
  return (dragForceN(v) + rollForceN(crr, theta)) / vehicle.massKg + vehicle.gravity * Math.sin(theta);
}

/** Braking power (kW) for a deceleration (m/s^2) at speed v (m/s). */
export const brakePowerKw = (aBrake: number, v: number) => (vehicle.massKg * aBrake * v) / 1000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 1 up to socFadeStart, then linear down to socFactorAtEnd at socFadeEnd. */
export function socFactor(soc: number): number {
  const { socFadeStart: a, socFadeEnd: b, socFactorAtEnd: end } = battery;
  if (soc <= a) return 1;
  if (soc >= b) return end;
  return 1 + ((end - 1) * (soc - a)) / (b - a);
}

/** 1 at tempFullC and above, then linear down to tempFactorAtCold at tempColdC and below. */
export function tempFactor(tempC: number): number {
  const { tempFullC: hi, tempColdC: lo, tempFactorAtCold: cold } = battery;
  if (tempC >= hi) return 1;
  if (tempC <= lo) return cold;
  return cold + ((1 - cold) * clamp01((tempC - lo) / (hi - lo)));
}

export type BindingCap = "power" | "grip" | "battery-soc" | "battery-temp";

export interface BrakeSplit {
  regenKw: number; // at the wheels
  frictionKw: number;
  binding: BindingCap; // which cap was smallest
}

/**
 * Splits braking power between regen and friction brakes. All kW at the wheels.
 * regenKw + frictionKw always equals brakeKw.
 */
export function splitBraking(
  brakeKw: number,
  v: number,
  mu: number,
  soc: number,
  tempC: number,
  regenEnabled: boolean,
): BrakeSplit {
  const socF = socFactor(soc);
  const tempF = tempFactor(tempC);
  const powerCap = regen.maxPowerKw;
  const gripCap = (vehicle.massKg * mu * vehicle.gravity * regen.drivenAxleWeightShare * v) / 1000;
  const batteryCap = (battery.chargeLimitKw * socF * tempF) / regen.efficiency;

  let binding: BindingCap = "power";
  let cap = powerCap;
  if (gripCap < cap) {
    cap = gripCap;
    binding = "grip";
  }
  if (batteryCap < cap) {
    cap = batteryCap;
    binding = socF <= tempF ? "battery-soc" : "battery-temp";
  }

  if (!regenEnabled) return { regenKw: 0, frictionKw: brakeKw, binding };
  const regenKw = Math.max(0, Math.min(brakeKw, cap));
  return { regenKw, frictionKw: brakeKw - regenKw, binding };
}

export function causeFor(binding: BindingCap): MissedCause {
  switch (binding) {
    case "power":
      return "late braking";
    case "grip":
      return "low grip";
    case "battery-soc":
      return "full battery";
    case "battery-temp":
      return "cold battery";
  }
}
