// GET /api/routes -> RouteListItem[]: the demo routes with a friendly label and a road condition
// suggested from today's real weather.

import { miles } from "../_lib/story";
import { listRoutes } from "../_lib/trips";
import type { RouteListItem } from "../_lib/types";

export async function GET() {
  const routes: RouteListItem[] = (await listRoutes()).map((r) => {
    const terrain = r.terrain.charAt(0).toUpperCase() + r.terrain.slice(1);
    return { ...r, miles: miles(r.distanceM), label: `${terrain} · ${miles(r.distanceM)} mi · ${r.stops} stops` };
  });
  return Response.json(routes);
}
