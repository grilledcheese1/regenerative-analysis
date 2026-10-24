// Stream 1 config: every tunable number for the physics and scoring engine lives here.
//
// ALL VALUES ARE APPROXIMATE ESTIMATES for a simulated Camry hybrid. They are NOT official
// Toyota specifications or measurements. Tune them here; never hard-code them in lib/physics.

import type { Condition, Driver } from "../lib/trip/types";

export type SurfaceKey = "dryAsphalt" | "wetAsphalt" | "snow" | "ice" | "gravel" | "mud";

export interface DriverProfile {
  speedFactor: number; // times the speed limit
  comfortDecel: number; // m/s^2, deceleration used when braking for a stop
  lookaheadBufferM: number; // extra distance before a stop where the driver starts slowing
  accel: number; // m/s^2
}

export const CONFIG = {
  // Estimate: rough mid-size hybrid sedan with driver.
  vehicle: {
    massKg: 1650,
    dragCoefficient: 0.28, // Cd
    frontalAreaM2: 2.2,
    airDensity: 1.225, // kg/m^3 at sea level, 15 C
    gravity: 9.81, // m/s^2
  },

  // Estimate: regen drivetrain limits.
  regen: {
    efficiency: 0.65, // eta: wheel (mechanical) to battery (electrical) round trip
    maxPowerKw: 30, // P_max: motor/generator limit, measured at the wheels
    drivenAxleWeightShare: 0.6, // phi: share of weight on the driven axle while braking
  },

  // Estimate: battery acceptance limits on regen.
  battery: {
    chargeLimitKw: 25, // P_batt_limit: electrical charge power, before SOC and temperature factors
    capacityKwh: 1.6, // usable capacity
    startSoc: 0.7,
    socDrainPerKm: 0.01, // SOC lost per km to tractive assist; keeps SOC in a realistic band
    socFadeStart: 0.8, // SOC factor is 1 up to here
    socFadeEnd: 0.9, // SOC factor reaches socFactorAtEnd here and stays there
    socFactorAtEnd: 0.05,
    tempFullC: 10, // temperature factor is 1 at or above this
    tempColdC: -10, // temperature factor reaches tempFactorAtCold at or below this
    tempFactorAtCold: 0.3,
    socMin: 0.3,
    socMax: 0.98,
  },

  // Estimate: tire-road friction (mu) and rolling resistance (Crr) per effective surface.
  surfaces: {
    dryAsphalt: { mu: 0.8, crr: 0.01 },
    wetAsphalt: { mu: 0.5, crr: 0.012 },
    snow: { mu: 0.25, crr: 0.018 }, // packed snow
    ice: { mu: 0.1, crr: 0.015 },
    gravel: { mu: 0.5, crr: 0.02 },
    mud: { mu: 0.25, crr: 0.04 }, // wet mud
  } satisfies Record<SurfaceKey, { mu: number; crr: number }>,

  // Estimate: weather changes driver behavior and battery temperature.
  conditions: {
    // Calibrated on the hill fixture. Milder decelFactors than a first guess (0.8/0.6/0.5): softer braking
    // also stays under the regen power cap, so strong softening made aggressive drivers score *better* in
    // bad weather. Speed factors are lower so each worse condition still lowers every driver's score.
    dry: { speedFactor: 1.0, decelFactor: 1.0, batteryTempC: 20 },
    wet: { speedFactor: 0.86, decelFactor: 0.95, batteryTempC: 12 },
    mud: { speedFactor: 0.72, decelFactor: 0.85, batteryTempC: 10 },
    snow: { speedFactor: 0.6, decelFactor: 0.75, batteryTempC: -5 },
  } satisfies Record<Condition, { speedFactor: number; decelFactor: number; batteryTempC: number }>,

  // Estimate: driver styles. "mixed" alternates between the two listed profiles on successive stops.
  drivers: {
    smooth: { speedFactor: 0.95, comfortDecel: 1.5, lookaheadBufferM: 60, accel: 1.2 },
    aggressive: { speedFactor: 1.1, comfortDecel: 5.0, lookaheadBufferM: 0, accel: 2.5 }, // hard stops, about 0.5 g
    mixed: { alternatesBetween: ["smooth", "aggressive"] as [Driver, Driver] },
  } satisfies Record<"smooth" | "aggressive", DriverProfile> & {
    mixed: { alternatesBetween: [Driver, Driver] };
  },

  // Speed controller and sampling.
  controller: {
    dtS: 1, // time step; one Sample per second
    defaultSpeedLimitMs: 13.4, // used when a route point has no speedLimit (about 30 mph)
    stopDwellS: 5, // time held at each stop
    gradeWindowM: 30, // distance window for the grade of each sample
    brakeFullScaleDecel: 4.0, // m/s^2 of braking that maps to brake = 1
    creepSpeedMs: 0.8, // minimum speed while rolling up to a stop, so a gentle driver never stalls short
    approachDecelCapFactor: 1.5, // max catch-up deceleration while approaching, times comfortDecel
    approachDecelFloor: 0.3, // m/s^2, minimum deceleration while approaching a stop
    maxTripS: 10800, // safety cap on trip length
  },

  // Missed regen opportunities.
  missed: {
    minBrakeKw: 2, // ignore tiny braking
    frictionShare: 0.15, // friction above this share of braking power counts as missed
  },

  // Score ceiling.
  score: {
    ceilingScale: 0.8, // multiplies E_ceiling; calibration only. Drag and rolling losses make a full 1.0 unreachable.
    elevationSmoothingM: 50, // moving average before summing descents
  },

  // Fuel, money and CO2 conversions (approximate).
  savings: {
    kwhPerGallon: 33.7, // energy in a gallon of gasoline
    engineEfficiency: 0.3, // share of that energy that becomes motion
    gasPriceUsd: 3.0, // dollars per gallon (Texas demo default)
    kgCo2PerGallon: 8.9, // EPA figure
  },
};

export type RegenConfig = typeof CONFIG;
