import { apiError, newRequestId } from "@/server/http";
import { cancelImport, imports, publicPreview } from "@/server/imports/service";
import { ownerId } from "@/server/session";

// GET /api/imports/[id] → { requestId, preview }. Missing or another owner's → 404.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = newRequestId();
  const job = imports.get(await ownerId(), id);
  if (!job) return apiError(404, "not_found", "No such import", false, requestId);
  return Response.json({ requestId, preview: publicPreview(job) });
}

// DELETE /api/imports/[id] cancels a preview: the job becomes "cancelled" and its bytes are dropped.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = newRequestId();
  const owner = await ownerId();
  const job = imports.get(owner, id);
  if (!job) return apiError(404, "not_found", "No such import", false, requestId);
  if (job.state === "cancelled") return Response.json({ requestId, preview: publicPreview(job) });
  if (job.state !== "preview_ready") {
    return apiError(409, "import_not_cancellable", `This import is ${job.state} and can't be cancelled.`, false, requestId);
  }
  return Response.json({ requestId, preview: publicPreview(cancelImport(owner, job)) });
}
