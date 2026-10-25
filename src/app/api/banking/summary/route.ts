import { buildBudget } from "@/domain/finance/budget";
import { DEMO_AS_OF } from "@/fixtures/personas";
import { apiError, newRequestId } from "@/server/http";
import { bankingSnapshots } from "@/server/records";
import { personaForRequest } from "@/server/profiles";
import { ownerId } from "@/server/session";

/**
 * Normalized budget inputs from the owner's last banking read:
 * GET /api/banking/summary?personaId=maria&mode=sandbox (mode: fixture | sandbox; default fixture).
 */
export async function GET(request: Request) {
  const requestId = newRequestId();
  const owner = await ownerId();
  const url = new URL(request.url);
  const personaId = url.searchParams.get("personaId") ?? "";
  const mode = url.searchParams.get("mode") ?? "fixture";
  const p = (await personaForRequest(personaId))?.persona;
  if (!p) return apiError(400, "invalid_request", "Unknown persona", false, requestId, { personaId: "No such demo customer" });
  if (mode !== "fixture" && mode !== "sandbox") {
    return apiError(400, "invalid_request", "mode must be fixture or sandbox", false, requestId, { mode: "fixture | sandbox" });
  }
  const snapshot = bankingSnapshots.get(owner, `${personaId}:${mode}`);
  if (!snapshot) return apiError(409, "banking_not_loaded_resync", "Sync banking for this customer, then retry", true, requestId);
  const budget = buildBudget(snapshot, p.profile, DEMO_AS_OF);
  return Response.json({ requestId, mode, retrievedAt: snapshot.retrievedAt, window: budget.window, budget });
}
