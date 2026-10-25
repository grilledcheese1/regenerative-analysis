import { z } from "zod";
import { apiError, newRequestId, withIdempotency } from "@/server/http";
import { confirmImport, imports } from "@/server/imports/service";
import { fieldErrors } from "@/server/records";
import { ownerId } from "@/server/session";

const Body = z.object({
  driverConfirmed: z.literal(true, { error: "Confirm you were driving. Passenger trips aren't personal driving data." }),
  vehicleId: z.string().min(1),
});

// POST /api/imports/[id]/confirm { driverConfirmed: true, vehicleId } → 201 { requestId, tripIds }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await ownerId();
  return withIdempotency(req, owner, "imports.confirm", async (body) => {
    const requestId = newRequestId();
    const job = imports.get(owner, id);
    if (!job) return apiError(404, "not_found", "No such import", false, requestId);

    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Confirm you were driving and which vehicle this is.", false, requestId, fieldErrors(parsed.error.issues));
    }
    if (parsed.data.vehicleId !== job.vehicleId) {
      return apiError(400, "invalid_request", "This import belongs to a different vehicle.", false, requestId, { vehicleId: "Doesn't match the import" });
    }
    if (job.state === "confirmed") return Response.json({ requestId, tripIds: job.tripIds ?? [] }); // already done: same result
    if (job.state !== "preview_ready") {
      return apiError(409, "import_not_confirmable", `This import is ${job.state} and can't be confirmed.`, false, requestId);
    }
    if (!job.quality.routeAvailable) {
      return apiError(422, "trip_not_usable", "This file doesn't have enough usable points to save as a trip.", false, requestId);
    }
    if (!job.bytes) return apiError(409, "import_not_found_resync", "This import expired. Upload the file again.", true, requestId);

    return Response.json({ requestId, tripIds: confirmImport(owner, job) }, { status: 201 });
  });
}
