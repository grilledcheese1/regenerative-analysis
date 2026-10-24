// GET /api/trips/hill-smooth-dry -> Trip (the locked contract). Add "-noregen" for the conventional baseline.

import { getTrip } from "../../_lib/trips";

export async function GET(_request: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const { id } = await ctx.params;
  const found = await getTrip(id);
  if (!found) return Response.json({ error: `No trip "${id}". See /api/trips.` }, { status: 404 });
  return Response.json(found.trip);
}
