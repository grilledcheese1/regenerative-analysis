import { useMemo } from "react";
import type { Persona } from "@/contracts";
import { styleOf } from "@/fixtures/personas";
import { analyzeTrip } from "@/lib/model/score";
import { simulateTrip } from "@/lib/model/simulate";
import { ROUTES } from "@/lib/routes";
import { buildSegments } from "@/lib/segments";

/** The person's cached route replayed at their driving style, dry roads. Simulated; regen is modeled for a hybrid. */
export function useDrive(persona: Persona) {
  return useMemo(() => {
    const route = ROUTES.find((r) => r.id === persona.usage.routeId) ?? ROUTES[0];
    const style = styleOf(persona.id);
    const trip = simulateTrip(route, { driver: style, condition: "dry", regen: true });
    const a = analyzeTrip(trip);
    return { route, style, trip, a, segments: buildSegments(trip.samples) };
  }, [persona]);
}
export type Drive = ReturnType<typeof useDrive>;
