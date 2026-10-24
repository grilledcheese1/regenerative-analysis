// Inputs to the physics engine. The Trip output types come from the shared contract.
import type { Condition, Driver } from "../trip/types";

export type RoutePoint = {
  lat: number;
  lon: number;
  elevation: number; // m
  speedLimit?: number; // m/s
  surface?: "asphalt" | "gravel" | "dirt" | "unknown";
  stop?: boolean; // traffic signal or stop sign at this point
};

export type SimulationInput = {
  route: RoutePoint[];
  driver: Driver;
  condition: Condition;
  regenEnabled: boolean;
};
