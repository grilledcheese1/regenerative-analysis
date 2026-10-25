// GET /api/conditions?route=hill&lat=30.27&lon=-97.74 -> ConditionsResponse
// The road condition from the real weather at the user's location (rounded to ~1 km before it leaves
// the server). Without lat/lon, or if the weather service is unreachable, it uses the route's cached weather.

import type { NextRequest } from "next/server";
import { conditionsFor } from "../_lib/conditions";
import { getRoute } from "../_lib/trips";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const routeId = q.get("route") ?? "hill";
  const route = await getRoute(routeId);
  if (!route) return Response.json({ error: `No route "${routeId}". See /api/routes.` }, { status: 404 });

  const lat = q.has("lat") ? Number(q.get("lat")) : undefined;
  const lon = q.has("lon") ? Number(q.get("lon")) : undefined;
  const valid = lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if ((lat !== undefined || lon !== undefined) && !valid)
    return Response.json({ error: "lat and lon must both be valid coordinates" }, { status: 400 });

  return Response.json(await conditionsFor(route, lat, lon));
}
