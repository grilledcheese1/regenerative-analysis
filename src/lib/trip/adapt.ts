import { SAVINGS } from "@/lib/model/config";
import type { TripAnalysis } from "@/lib/model/score";
import type { SimTrip } from "@/lib/model/simulate";
import type { Condition, MissedCause, Trip } from "./types";

// The simulator uses hyphenated causes and a wider condition set than the locked contract.
const CAUSE: Record<string, MissedCause> = {
  "late-braking": "late braking",
  "low-grip": "low grip",
  "full-battery": "full battery",
  "cold-battery": "cold battery",
};
const CONDITION: Record<string, Condition> = {
  dry: "dry",
  wet: "wet",
  snow: "snow",
  mud: "mud",
  ice: "snow",
  gravel: "mud",
};

/** Converts the simulator's trip + analysis into the locked Trip contract the map and charts consume. */
export function toContractTrip(sim: SimTrip, a: TripAnalysis, gasPrice: number): Trip {
  const gallonsSaved = a.regenKwh / (SAVINGS.kwhPerGallon * SAVINGS.engineEfficiency);
  return {
    header: {
      tripId: sim.id,
      driver: sim.driver,
      vehicle: sim.vehicle,
      condition: CONDITION[sim.condition] ?? "dry",
      regenEnabled: sim.regenEnabled,
      distanceM: sim.distanceM,
    },
    samples: sim.samples.map((s) => ({
      t: s.t,
      lat: s.lat,
      lon: s.lon,
      speed: s.speedMs,
      elevation: s.elevationM,
      grade: s.gradePct,
      brake: s.brakePressure,
      regenKw: s.regenKw,
      frictionKw: s.frictionKw,
      soc: s.soc,
      missed: s.missed ? (CAUSE[s.missed] ?? null) : null,
    })),
    summary: {
      score: a.score,
      energyRecoveredKwh: a.regenKwh,
      energyCeilingKwh: a.ceilingKwh,
      heatLossKwh: a.frictionKwh,
      missedEvents: a.missed.map((e) => ({ t: e.t, cause: CAUSE[e.cause] })),
      gallonsSaved,
      dollarsSaved: gallonsSaved * gasPrice,
      co2Kg: gallonsSaved * SAVINGS.kgCo2PerGallon,
    },
  };
}
