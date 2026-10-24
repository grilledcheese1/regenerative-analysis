// Second-by-second simulation: speed controller + braking split + battery. Pure and deterministic.
// APPROXIMATION: a point-mass car following a rule-based driver. Not a validated vehicle model.
import { CONFIG, type DriverProfile } from "../../config/regen.config.ts";
import type { MissedCause, Driver, Sample } from "../trip/types";
import { brakePowerKw, causeFor, naturalDecel, resolveSurface, splitBraking } from "./model.ts";
import { buildGeometry, gradeAt, latLonAt, elevationAt, pointAt, stopPositions, stopReferenceSpeeds, type Geometry } from "./route.ts";
import type { SimulationInput } from "./types.ts";

const { controller, battery, regen, missed: missedCfg } = CONFIG;

export interface SimResult {
  samples: Sample[];
  /** Total braking power demanded (kW at the wheels) per sample. regenKw + frictionKw equals this. */
  demandKw: number[];
  geometry: Geometry;
  stops: number[];
  stopRefSpeeds: number[];
}

/** Profile for the segment leading to stop number k. "mixed" alternates smooth, aggressive, smooth... */
function profileFor(driver: Driver, stopIndex: number): DriverProfile {
  if (driver === "mixed") {
    const [first, second] = CONFIG.drivers.mixed.alternatesBetween;
    const name = stopIndex % 2 === 0 ? first : second;
    return CONFIG.drivers[name as "smooth" | "aggressive"];
  }
  return CONFIG.drivers[driver];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function runSimulation(input: SimulationInput): SimResult {
  const geometry = buildGeometry(input.route);
  const empty: SimResult = { samples: [], demandKw: [], geometry, stops: [], stopRefSpeeds: [] };
  if (input.route.length < 2 || geometry.length < 1) return empty;

  const stops = stopPositions(geometry);
  const stopRefSpeeds = stopReferenceSpeeds(geometry, stops);
  const cond = CONFIG.conditions[input.condition];
  const dt = controller.dtS;

  const samples: Sample[] = [];
  const demandKw: number[] = [];
  let t = 0;
  let s = 0;
  let v = 0;
  let soc = battery.startSoc;
  let stopIdx = 0;
  let dwellLeft = 0;

  while (t < controller.maxTripS) {
    const pos = latLonAt(geometry, s);
    const elevation = elevationAt(geometry, s);
    const grade = gradeAt(geometry, s, controller.gradeWindowM);

    let aBrake = 0;
    let vNext = 0;
    let sNext = s;
    let regenKw = 0;
    let frictionKw = 0;
    let demand = 0;
    let missed: MissedCause | null = null;
    let arrived = false;

    if (dwellLeft > 0) {
      dwellLeft -= 1; // standing at a stop
    } else {
      const point = pointAt(geometry, s);
      const surface = CONFIG.surfaces[resolveSurface(input.condition, point.surface)];
      const profile = profileFor(input.driver, stopIdx);
      const limit = point.speedLimit ?? controller.defaultSpeedLimitMs;
      const target = limit * profile.speedFactor * cond.speedFactor;
      const decel = profile.comfortDecel * cond.decelFactor;
      const aNat = naturalDecel(v, grade, surface.crr);
      const distToStop = stops[stopIdx] - s;
      const brakingDist = (v * v) / (2 * decel) + profile.lookaheadBufferM;

      if (v > 0.5 && distToStop <= brakingDist) {
        // Brake for the stop: the deceleration that ends exactly at the stop line, bounded for comfort.
        const aStop = (v * v) / (2 * Math.max(distToStop, 0.5));
        const aTarget = clamp(aStop, controller.approachDecelFloor, decel * controller.approachDecelCapFactor);
        aBrake = Math.max(0, aTarget - aNat);
        vNext = Math.max(0, v - (aNat + aBrake) * dt);
        if (vNext < controller.creepSpeedMs && distToStop > 1) vNext = controller.creepSpeedMs;
      } else if (v >= target) {
        // Hold or reduce toward the target speed (for example on a descent): brake only as needed.
        const aTarget = clamp((v - target) / dt, 0, decel);
        aBrake = Math.max(0, aTarget - aNat);
        vNext = Math.max(0, v - (aNat + aBrake) * dt);
      } else {
        // Accelerate toward the target; no braking.
        vNext = Math.min(target, v + profile.accel * dt);
      }

      const vMid = (v + vNext) / 2;
      sNext = s + vMid * dt;
      if (sNext >= stops[stopIdx] - 0.3) {
        sNext = stops[stopIdx];
        vNext = 0;
        arrived = true;
      }

      demand = brakePowerKw(aBrake, vMid);
      const split = splitBraking(demand, vMid, surface.mu, soc, cond.batteryTempC, input.regenEnabled);
      regenKw = split.regenKw;
      frictionKw = split.frictionKw;
      if (input.regenEnabled && demand >= missedCfg.minBrakeKw && frictionKw > missedCfg.frictionShare * demand) {
        missed = causeFor(split.binding);
      }

      // Battery: recovered electrical energy charges it; tractive assist drains it per km.
      const electricalKwh = (regen.efficiency * regenKw * dt) / 3600;
      soc += electricalKwh / battery.capacityKwh - (battery.socDrainPerKm * (sNext - s)) / 1000;
      soc = clamp(soc, battery.socMin, battery.socMax);
    }

    samples.push({
      t,
      lat: pos.lat,
      lon: pos.lon,
      speed: v,
      elevation,
      grade,
      brake: Math.min(1, aBrake / controller.brakeFullScaleDecel),
      regenKw,
      frictionKw,
      soc,
      missed,
    });
    demandKw.push(demand);

    t += dt;
    s = sNext;
    v = vNext;
    if (arrived) {
      dwellLeft = controller.stopDwellS;
      if (stopIdx === stops.length - 1) {
        // Final stop: record the dwell, then finish.
        const stopPos = latLonAt(geometry, s);
        for (let k = 0; k < controller.stopDwellS; k++) {
          samples.push({
            t,
            lat: stopPos.lat,
            lon: stopPos.lon,
            speed: 0,
            elevation: elevationAt(geometry, s),
            grade: 0,
            brake: 0,
            regenKw: 0,
            frictionKw: 0,
            soc,
            missed: null,
          });
          demandKw.push(0);
          t += dt;
        }
        break;
      }
      stopIdx += 1;
    }
  }

  return { samples, demandKw, geometry, stops, stopRefSpeeds };
}
