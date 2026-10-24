// GET /api/routes/hill -> one real route in the simulator's DemoRoute shape
// (name, stepM, points[{ s, lat, lon, elevationM, limitMs, surface, roadClass }], stopsM),
// plus weather and data sources. Drop-in replacement for buildDemoRoute().

import { getRoute } from "../../_lib/trips";

export async function GET(_request: Request, ctx: RouteContext<"/api/routes/[id]">) {
  const { id } = await ctx.params;
  const route = await getRoute(id);
  if (!route) return Response.json({ error: `No route "${id}". See /api/routes.` }, { status: 404 });
  return Response.json(route);
}
