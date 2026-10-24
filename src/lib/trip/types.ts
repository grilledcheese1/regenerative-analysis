// Trip JSON data contract, owned by the data/physics streams. Do not change.

export type MissedCause = "late braking" | "low grip" | "full battery" | "cold battery";

export interface TripHeader {
  tripId: string;
  driver: "smooth" | "aggressive" | "mixed";
  vehicle: string;
  condition: "dry" | "wet" | "snow" | "mud";
  regenEnabled: boolean;
  distanceM: number;
}

export interface TripSample {
  t: number; // seconds
  lat: number;
  lon: number;
  speed: number; // m/s
  elevation: number; // m
  grade: number; // %
  brake: number; // 0-1
  regenKw: number;
  frictionKw: number;
  soc?: number; // 0-1
  missed: MissedCause | null;
}

export interface TripSummary {
  score: number;
  energyRecoveredKwh: number;
  [key: string]: unknown;
}

export interface Trip {
  header: TripHeader;
  samples: TripSample[];
  summary: TripSummary;
}
