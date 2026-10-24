// Trip JSON data contract (AGENTS.md section 4). Locked: do not change field names or units.

export type Driver = "smooth" | "aggressive" | "mixed";
export type Condition = "dry" | "wet" | "snow" | "mud";
export type MissedCause = "late braking" | "low grip" | "full battery" | "cold battery";

export interface TripSample {
  t: number; // seconds since trip start
  lat: number;
  lon: number;
  speed: number; // m/s
  elevation: number; // m
  grade: number; // percent slope
  brake: number; // braking demand, 0-1
  regenKw: number;
  frictionKw: number;
  soc?: number; // 0-1
  missed: MissedCause | null;
}

/** Contract name for a trip sample. */
export type Sample = TripSample;

export interface TripHeader {
  tripId: string;
  driver: Driver;
  vehicle: string;
  condition: Condition;
  regenEnabled: boolean;
  distanceM: number;
}

export interface TripSummary {
  score: number; // 0-100
  energyRecoveredKwh: number;
  energyCeilingKwh?: number;
  heatLossKwh?: number;
  missedEvents?: { t: number; cause: MissedCause }[];
  gallonsSaved?: number;
  dollarsSaved?: number;
  co2Kg?: number;
}

export interface Trip {
  header: TripHeader;
  samples: TripSample[];
  summary: TripSummary;
}
