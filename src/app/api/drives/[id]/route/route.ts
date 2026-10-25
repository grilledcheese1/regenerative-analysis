import { apiError, newRequestId } from "@/server/http";
import { tripRoutes } from "@/server/imports/service";
import { ownerId } from "@/server/session";

// GET /api/drives/[id]/route → { requestId, route }: the drive as a replay route for the regen model.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = newRequestId();
  const route = tripRoutes.get(await ownerId(), id);
  if (!route) return apiError(404, "not_found", "No replay route for this trip", false, requestId);
  return Response.json({ requestId, route });
}
