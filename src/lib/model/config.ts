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
  { speedFactor: number; liftOffSeconds: number; brakeDecelMs2: number }
> = {
  smooth: { speedFactor: 0.95, liftOffSeconds: 8, brakeDecelMs2: 1.2 },
  aggressive: { speedFactor: 1.08, liftOffSeconds: 2, brakeDecelMs2: 3.5 },
  mixed: { speedFactor: 1.0, liftOffSeconds: 5, brakeDecelMs2: 2.2 },
};

export const BATTERY = {
  fadeStartSoc: 0.8,
  coldCutoffC: 0,
};

export const SAVINGS = {
  kwhPerGallon: 33.7,
  engineEfficiency: 0.3,
  kgCo2PerGallon: 8.9,
};
