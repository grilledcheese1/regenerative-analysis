import { coachFor } from "../../../../../../scripts/lib/coach.ts";
import { isValidId, readSavedCoach, readTrip } from "../../../../../../scripts/lib/trips-store.ts";

// GET /api/trips/[id]/coach  ->  { tip, basedOn }
// Saved file first (pre-generated, so the demo needs no live call), then Claude if a key exists,
// then a deterministic tip. Never writes files and never returns an error because the AI call failed.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Invalid trip id" }, { status: 400 });
  const saved = readSavedCoach(id);
  if (saved) return Response.json(saved);
  const trip = readTrip(id);
  if (!trip) return Response.json({ error: `Trip not found: ${id}` }, { status: 404 });
  const { tip, basedOn } = await coachFor(trip, { allowApi: true });
  return Response.json({ tip, basedOn });
}
