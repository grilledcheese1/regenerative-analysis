import { currentAccount } from "@/server/auth/session";
import { newRequestId } from "@/server/http";
import { removeProfile } from "@/server/profiles";
import { ownerId } from "@/server/session";
import { deleteOwnerData } from "@/server/store";

/**
 * Deletes every record this owner has in every server store, plus the signed-in account's
 * onboarding profile (the account itself stays). In-memory, so it completes at once.
 */
export async function DELETE() {
  const owner = await ownerId();
  const { stores } = deleteOwnerData(owner);
  const account = await currentAccount();
  if (account && removeProfile(account.accountId)) stores.push("user_profiles");
  return Response.json({ requestId: newRequestId(), state: "complete", deleted: [...new Set(stores)].sort() });
}
