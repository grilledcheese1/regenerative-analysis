import { listRoutes } from "../../../../scripts/lib/trips-store.ts";

// GET /api/routes -> { routeId, name, terrain, distanceM, reliefM, stops }[]
export function GET() {
  return Response.json(listRoutes());
}
