import { apiError, newRequestId } from "@/server/http";
import { trips } from "@/server/imports/service";
import { ownerId } from "@/server/session";

// GET /api/drives/[id] → { requestId, trip }. Geometry is already decimated.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = newRequestId();
  const trip = trips.get(await ownerId(), id);
  if (!trip) return apiError(404, "not_found", "No such trip", false, requestId);
  return Response.json({ requestId, trip });
}
