// GET /api/trips/hill-aggressive-wet/story -> TripStory
// A plain-English summary in miles and mph, with street names for the biggest missed regen moments.

import { buildStory } from "../../../_lib/story";
import { getTrip } from "../../../_lib/trips";

export async function GET(_request: Request, ctx: RouteContext<"/api/trips/[id]/story">) {
  const { id } = await ctx.params;
  const found = await getTrip(id);
  if (!found) return Response.json({ error: `No trip "${id}". See /api for the list of routes.` }, { status: 404 });
  return Response.json(buildStory(found));
}
