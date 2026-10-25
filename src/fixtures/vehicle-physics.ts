import { DEFAULT_PHYSICS, type VehiclePhysics } from "@/lib/model/config";
import data from "./vehicle-physics.json";

interface VehicleRow {
  label: string;
  powertrain: "ice" | "hybrid" | "phev" | "bev";
  massKg: number;
  dragCoefficient: number;
  frontalAreaM2: number;
  rollingResistance: number;
  regenEfficiency: number;
  maxRegenKw: number;
  drivenAxleWeightShare: number;
  batteryKwh: number;
}
const VEHICLES = data.vehicles as Record<string, VehicleRow>;
const PEOPLE = data.people as Record<string, { vehicleId: string; extraMassKg: number; replayVehicleId: string }>;

/** What the regen replay drives for one person. */
export interface PersonaPhysics {
  /** The car they actually own, as the physics table names it ("Toyota 4Runner"). */
  ownLabel: string;
  /** False for a gasoline car: it recovers no braking energy, so the replay models `replay` instead. */
  ownRegen: boolean;
  /** The car the replay simulates: their own when it has regen, else the hybrid a driver of that car would consider. */
  replay: VehiclePhysics;
}

const toPhysics = (row: VehicleRow, extraMassKg: number): VehiclePhysics => ({
  label: row.label,
  massKg: row.massKg + extraMassKg, // curb weight plus the person's usual passengers and cargo
  dragCoefficient: row.dragCoefficient,
  frontalAreaM2: row.frontalAreaM2,
  rollingResistance: row.rollingResistance,
  regenEfficiency: row.regenEfficiency,
  maxRegenKw: row.maxRegenKw,
  drivenAxleWeightShare: row.drivenAxleWeightShare,
  batteryKwh: row.batteryKwh,
  regenCapable: row.powertrain !== "ice" && row.regenEfficiency > 0,
});

const DEFAULT: PersonaPhysics = { ownLabel: DEFAULT_PHYSICS.label, ownRegen: true, replay: DEFAULT_PHYSICS };
const cache = new Map<string, PersonaPhysics>();

/** The physics of this person's own car (or its hybrid counterpart), so their telemetry reflects the car they drive. */
export function physicsFor(personaId: string): PersonaPhysics {
  const hit = cache.get(personaId);
  if (hit) return hit;
  const p = PEOPLE[personaId];
  const own = p && VEHICLES[p.vehicleId];
  const replay = p && VEHICLES[p.replayVehicleId];
  const result: PersonaPhysics = own && replay ? { ownLabel: own.label, ownRegen: own.powertrain !== "ice", replay: toPhysics(replay, p.extraMassKg) } : DEFAULT;
  cache.set(personaId, result);
  return result;
}
