import { newRequestId } from "@/server/http";
import { trips } from "@/server/imports/service";
import { ownerId } from "@/server/session";

// GET /api/drives?vehicleId= → { requestId, trips: TripRecord[] }, the owner's confirmed trips, newest first.
export async function GET(req: Request) {
  const vehicleId = new URL(req.url).searchParams.get("vehicleId");
  const list = trips.list(await ownerId()).filter((t) => !vehicleId || t.vehicleId === vehicleId);
  return Response.json({ requestId: newRequestId(), trips: list });
}
