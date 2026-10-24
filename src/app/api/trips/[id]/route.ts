import { isValidId, readTrip } from "../../../../../scripts/lib/trips-store.ts";

// GET /api/trips/[id]  ->  Trip
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Invalid trip id" }, { status: 400 });
  const trip = readTrip(id);
  if (!trip) return Response.json({ error: `Trip not found: ${id}` }, { status: 404 });
  return Response.json(trip);
}
