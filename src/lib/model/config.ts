// All values are approximate teaching numbers, not official Toyota specs.
// Tune them here; no other file should hard-code physics constants.

export const VEHICLE = {
  massKg: 1650,
  dragCoefficient: 0.28,
  frontalAreaM2: 2.2,
  regenEfficiency: 0.65,
  maxRegenKw: 30,
  drivenAxleWeightShare: 0.6,
  airDensity: 1.225,
  gravity: 9.81,
} as const;

/** The physics of one car. The default is the Camry Hybrid above; each person's own car overrides it. */
export interface VehiclePhysics {
  label: string; // "Toyota Sienna Hybrid"
  massKg: number; // curb weight plus the person's usual load
  dragCoefficient: number;
  frontalAreaM2: number;
  rollingResistance: number; // dry-road coefficient; the road surface scales it
  regenEfficiency: number; // share of braking energy at the wheels that reaches the battery
  maxRegenKw: number; // battery-side limit
  drivenAxleWeightShare: number; // share of weight on the axle the motor brakes
  batteryKwh: number;
  regenCapable: boolean;
}

export const DEFAULT_PHYSICS: VehiclePhysics = {
  label: "Camry Hybrid (simulated)",
  massKg: VEHICLE.massKg,
  dragCoefficient: VEHICLE.dragCoefficient,
  frontalAreaM2: VEHICLE.frontalAreaM2,
  rollingResistance: 0.01,
  regenEfficiency: VEHICLE.regenEfficiency,
  maxRegenKw: VEHICLE.maxRegenKw,
  drivenAxleWeightShare: VEHICLE.drivenAxleWeightShare,
  batteryKwh: 1.6,
  regenCapable: true,
};

export type Condition = "dry" | "wet" | "snow" | "ice" | "gravel" | "mud";

export const SURFACES: Record<Condition, { mu: number; crr: number }> = {
  dry: { mu: 0.8, crr: 0.01 },
  wet: { mu: 0.5, crr: 0.012 },
  snow: { mu: 0.25, crr: 0.018 },
  ice: { mu: 0.1, crr: 0.015 },
  gravel: { mu: 0.5, crr: 0.02 },
  mud: { mu: 0.25, crr: 0.04 },
};

export type DriverProfileName = "smooth" | "aggressive" | "mixed";

export const DRIVER_PROFILES: Record<
  DriverProfileName,
  { speedFactor: number; liftOffSeconds: number; brakeDecelMs2: number; accelMs2: number }
> = {
  smooth: { speedFactor: 0.95, liftOffSeconds: 8, brakeDecelMs2: 1.2, accelMs2: 1.0 },
  aggressive: { speedFactor: 1.08, liftOffSeconds: 2, brakeDecelMs2: 3.5, accelMs2: 2.6 },
  mixed: { speedFactor: 1.0, liftOffSeconds: 5, brakeDecelMs2: 2.2, accelMs2: 1.6 },
};

// Drivers slow down and brake softer when grip is poor (multiplies speed and brake decel).
export const CONDITION_CAUTION: Record<Condition, number> = {
  dry: 1,
  wet: 0.92,
  gravel: 0.9,
  snow: 0.8,
  mud: 0.8,
  ice: 0.65,
};

// Snow and ice imply a cold pack, which accepts less regen.
export const COLD_CONDITIONS: Condition[] = ["snow", "ice"];

export const BATTERY = {
  capacityKwh: 1.6,
  startSoc: 0.6,
  fadeStartSoc: 0.8,
  coldCutoffC: 0,
  coldRegenFactor: 0.5,
};

// Lifting off the pedal in a hybrid gives light "engine braking" regen.
export const LIFT_OFF_DECEL_MS2 = 0.6;
// Braking harder than this counts against brake smoothness.
export const SMOOTH_BRAKE_LIMIT_MS2 = 2.0;

export const SAVINGS = {
  kwhPerGallon: 33.7,
  engineEfficiency: 0.3,
  kgCo2PerGallon: 8.9,
};
