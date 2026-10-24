// GET /api/routes -> the demo routes: { routeId, name, terrain, distanceM }[]

import { listRoutes } from "../_lib/trips";

export async function GET() {
  return Response.json(await listRoutes());
}
