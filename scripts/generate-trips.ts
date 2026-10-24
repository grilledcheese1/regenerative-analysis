// Generates every trip: 3 routes x 3 drivers x 4 conditions, each with regen on and a regen-off baseline (72 total).
// Needs Stream 1's simulateTrip (src/lib/physics) and the route points from build-routepoints.ts.
// Run: node --env-file=.env.local scripts/generate-trips.ts [--coach] [--refresh] [--route=hilly]
//   --coach   also write data/trips/<tripId>.coach.json (Claude when a key exists, else the deterministic tip)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Condition, Driver, Trip } from "../src/lib/trip/types";
import type { RoutePoint, SimulationInput } from "../src/lib/physics/types.ts";
import { cachePath, readJson, refreshRequested, ROOT, routeFilter } from "./lib/cache.ts";
import { coachFor } from "./lib/coach.ts";
import { ROUTES } from "./routes.config.ts";

const DRIVERS: Driver[] = ["smooth", "aggressive", "mixed"];
const CONDITIONS: Condition[] = ["dry", "wet", "snow", "mud"];

type SimulateTrip = (input: SimulationInput) => Trip;
let simulateTrip: SimulateTrip;
try {
  const mod = (await import("../src/lib/physics/index.ts")) as { simulateTrip?: SimulateTrip };
  if (typeof mod.simulateTrip !== "function") throw new Error("src/lib/physics/index.ts does not export simulateTrip");
  simulateTrip = mod.simulateTrip;
} catch (err) {
  console.error(`Cannot generate trips: Stream 1's simulateTrip is missing or broken.\n  ${(err as Error).message}`);
  process.exit(1);
}

const tripsDir = path.join(ROOT, "data", "trips");
mkdirSync(tripsDir, { recursive: true });
const withCoach = process.argv.includes("--coach");
let written = 0;
let coached = 0;

for (const route of ROUTES) {
  if (routeFilter() && routeFilter() !== route.id) continue;
  const file = cachePath("routes", route.id);
  if (!existsSync(file)) {
    console.error(`${route.id}: no route points yet. Run scripts/build-routepoints.ts first.`);
    continue;
  }
  const points = readJson<{ points: RoutePoint[] }>(file).points;
  for (const driver of DRIVERS) {
    for (const condition of CONDITIONS) {
      for (const regenEnabled of [true, false]) {
        const trip = simulateTrip({ route: points, driver, condition, regenEnabled });
        trip.header.tripId = `${route.id}-${driver}-${condition}${regenEnabled ? "" : "-noregen"}`;
        writeFileSync(path.join(tripsDir, `${trip.header.tripId}.json`), JSON.stringify(trip) + "\n");
        written++;
        if (withCoach) {
          const coachFile = path.join(tripsDir, `${trip.header.tripId}.coach.json`);
          if (existsSync(coachFile) && !refreshRequested()) continue;
          const { tip, basedOn, source } = await coachFor(trip, { allowApi: true });
          writeFileSync(coachFile, JSON.stringify({ tip, basedOn, source }, null, 2) + "\n");
          coached++;
        }
      }
    }
  }
  console.log(`${route.id}: ${DRIVERS.length * CONDITIONS.length * 2} trips`);
}
console.log(`wrote ${written} trips${withCoach ? `, ${coached} coach files` : ""} to data/trips`);
