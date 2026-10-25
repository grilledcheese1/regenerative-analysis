import { apiError, newRequestId } from "@/server/http";
import { recommendations } from "@/server/records";
import { ownerId } from "@/server/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await ownerId();
  const record = recommendations.get(owner, id);
  if (!record) return apiError(404, "not_found", "No such recommendation", false, newRequestId());
  return Response.json({ ...record, requestId: newRequestId() });
}
