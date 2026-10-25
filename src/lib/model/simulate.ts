import type { DemoRoute } from "@/lib/mock/route";
import type { MissedCause, Trip, TripSample } from "@/lib/types";
import {
  BATTERY,
  COLD_CONDITIONS,
  CONDITION_CAUTION,
  DRIVER_PROFILES,
  LIFT_OFF_DECEL_MS2,
  SURFACES,
  VEHICLE,
  type Condition,
  type DriverProfileName,
} from "./config";
import { splitBraking } from "./braking";

export interface SimOptions {
  driver: DriverProfileName;
  condition: Condition;
  regen: boolean;
}

export interface SimSample extends TripSample {
  limitMs: number;
  accelMs2: number;
  tractionKw: number;
}

export interface SimTrip extends Trip {
  samples: SimSample[];
  regenEnabled: boolean;
  stopSpeedsMs: number[]; // speed when braking for each stop began
  descentM: number; // total elevation lost along the route
}

/** Second-by-second simulation of a driver profile over a route. Pure. */
export function simulateTrip(route: DemoRoute, opts: SimOptions): SimTrip {
  const { massKg: m, gravity: g, airDensity: rho, dragCoefficient: cd, frontalAreaM2: area } = VEHICLE;
  const { mu, crr } = SURFACES[opts.condition];
  const profile = DRIVER_PROFILES[opts.driver];
  const caution = CONDITION_CAUTION[opts.condition];
  const cold = COLD_CONDITIONS.includes(opts.condition);
  const brakeDecel = profile.brakeDecelMs2 * caution;
  const pts = route.points;
  const lengthM = pts[pts.length - 1].s;

  const samples: SimSample[] = [];
  const stopSpeedsMs: number[] = [];
  let s = 0;
  let v = 0;
  let soc = BATTERY.startSoc;
  let stopIdx = 0;
  let approachRecorded = false;
  let dwell = 0;

  for (let t = 0; t < 3600 && stopIdx < route.stopsM.length; t++) {
    const i = Math.min(Math.floor(s / route.stepM), pts.length - 2);
    const p = pts[i];
    const grade = (pts[i + 1].elevationM - p.elevationM) / route.stepM;
    const stopAt = route.stopsM[stopIdx];
    const dStop = stopAt - s;
    const target = p.limitMs * profile.speedFactor * caution;

    let a: number;
    if (dwell > 0) {
      a = 0;
      v = 0;
      dwell--;
      if (dwell === 0) {
        stopIdx++;
        approachRecorded = false;
      }
    } else if (dStop <= 1 && v < 1) {
      a = -v;
      dwell = stopIdx === route.stopsM.length - 1 ? 1 : 5;
    } else {
      const brakeDist = (v * v) / (2 * brakeDecel);
      if (dStop <= brakeDist + 1) {
        a = -(v * v) / (2 * Math.max(dStop, 1));
      } else if (dStop <= brakeDist + v * profile.liftOffSeconds) {
        // Coast toward the stop line without creeping: never slow faster than lift-off regen.
        a = -Math.min(LIFT_OFF_DECEL_MS2, (v * v) / (2 * Math.max(dStop, 1)));
      } else if (v < target - 0.3) {
        a = Math.min(profile.accelMs2, target - v);
      } else if (v > target + 0.5) {
        a = -Math.min(v - target, 1.5);
      } else {
        a = 0;
      }
      if (a < 0 && !approachRecorded && dStop < 400) {
        stopSpeedsMs.push(v);
        approachRecorded = true;
      }
    }

    const theta = Math.atan(grade);
    const fResist =
      m * g * Math.sin(theta) + crr * m * g * Math.cos(theta) + 0.5 * rho * cd * area * v * v;
    const fTrac = m * a + fResist;

    let tractionKw = 0;
    let regenKw = 0;
    let frictionKw = 0;
    let missed: MissedCause | undefined;

    if (fTrac >= 0) {
      tractionKw = (fTrac * v) / 1000;
    } else {
      const brakeKw = (-fTrac * v) / 1000;
      if (opts.regen) {
        const gripKw = (m * mu * g * VEHICLE.drivenAxleWeightShare * v) / 1000;
        const socFade =
          soc <= BATTERY.fadeStartSoc ? 1 : Math.max(0, (1 - soc) / (1 - BATTERY.fadeStartSoc));
        const batteryKw = VEHICLE.maxRegenKw * socFade * (cold ? BATTERY.coldRegenFactor : 1);
        const motorCapKw = VEHICLE.maxRegenKw / VEHICLE.regenEfficiency;
        const split = splitBraking(brakeKw, motorCapKw, gripKw, batteryKw, VEHICLE.regenEfficiency);
        regenKw = split.capturedKw;
        frictionKw = split.frictionKw;
        if (frictionKw > 1) {
          if (split.limit === "grip") missed = "low-grip";
          else if (split.limit === "battery" && socFade < 1) missed = "full-battery";
          else if (split.limit === "battery" && cold) missed = "cold-battery";
          else missed = "late-braking";
        }
      } else {
        frictionKw = brakeKw;
      }
    }

    // Hybrid assist drains the pack a little so it doesn't fill on long trips.
    soc += (regenKw - Math.min(tractionKw, 12) * 0.35) / 3600 / BATTERY.capacityKwh;
    soc = Math.min(0.98, Math.max(0.3, soc));

    samples.push({
      t,
      lat: p.lat,
      lon: p.lon,
      speedMs: v,
      elevationM: p.elevationM,
      gradePct: grade * 100,
      brakePressure: a < 0 ? Math.min(1, -a / 4) : 0,
      regenKw,
      frictionKw,
      soc,
      missed,
      limitMs: p.limitMs,
      accelMs2: a,
      tractionKw,
    });

    v = Math.max(0, v + a);
    s = Math.min(lengthM, s + v);
  }

  let descentM = 0;
  for (let i = 1; i < pts.length; i++) {
    descentM += Math.max(0, pts[i - 1].elevationM - pts[i].elevationM);
  }

  return {
    id: `${opts.driver}-${opts.condition}${opts.regen ? "" : "-noregen"}`,
    driver: opts.driver,
    condition: opts.condition,
    vehicle: "Camry Hybrid (simulated)",
    startTime: "2026-10-24T08:00:00-05:00",
    distanceM: lengthM,
    samples,
    regenEnabled: opts.regen,
    stopSpeedsMs,
    descentM,
  };
}
