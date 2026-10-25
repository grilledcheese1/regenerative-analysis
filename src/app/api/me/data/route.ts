import { newRequestId } from "@/server/http";
import { ownerId } from "@/server/session";
import { deleteOwnerData } from "@/server/store";

/** Deletes every record this owner has in every server store. In-memory, so it completes at once. */
export async function DELETE() {
  const owner = await ownerId();
  const { stores } = deleteOwnerData(owner);
  return Response.json({ requestId: newRequestId(), state: "complete", deleted: stores });
}
