import type { Condition, DriverProfileName } from "./model/config";

export type MissedCause = "late-braking" | "low-grip" | "full-battery" | "cold-battery";

export interface TripSample {
  t: number; // seconds from start
  lat: number;
  lon: number;
  speedMs: number;
  elevationM: number;
  gradePct: number;
  brakePressure: number; // 0..1
  regenKw: number;
  frictionKw: number;
  soc?: number; // 0..1
  missed?: MissedCause;
}

export interface Trip {
  id: string;
  driver: DriverProfileName;
  condition: Condition;
  vehicle: string;
  startTime: string;
  distanceM: number;
  samples: TripSample[];
}

export interface TripScore {
  score: number; // 0..100
  regenKwh: number;
  ceilingKwh: number;
  frictionKwh: number;
  missedCount: number;
}
