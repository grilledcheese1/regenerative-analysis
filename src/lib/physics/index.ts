// Public entry point of the physics and scoring engine (Stream 1).
// APPROXIMATION: simulated Camry hybrid on a real or hand-made route. Not official Toyota data.
import type { Trip } from "../trip/types";
import { ceilingKwh, summarize } from "./score.ts";
import { runSimulation } from "./simulate.ts";
import type { SimulationInput } from "./types.ts";

export type { RoutePoint, SimulationInput } from "./types.ts";
export * from "./savings.ts";

export function simulateTrip(input: SimulationInput): Trip {
  const { samples, geometry, stopRefSpeeds } = runSimulation(input);
  const ceiling = samples.length > 0 ? ceilingKwh(geometry, stopRefSpeeds) : 0;
  return {
    header: {
      tripId: `${input.driver}-${input.condition}${input.regenEnabled ? "" : "-conventional"}`,
      driver: input.driver,
      vehicle: "Camry Hybrid (simulated)",
      condition: input.condition,
      regenEnabled: input.regenEnabled,
      distanceM: Math.round(geometry.length),
    },
    samples,
    summary: summarize(samples, ceiling, input.regenEnabled),
  };
}
