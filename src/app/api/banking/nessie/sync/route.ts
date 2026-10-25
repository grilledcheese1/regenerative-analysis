import { z } from "zod";
import type { BankingSyncError, BankingSyncResult } from "@/contracts";
import { apiError, newRequestId } from "@/server/http";
import { fetchSandbox, fixtureSnapshot, NessieBadResponse, NessieUnavailable, sandboxCustomerId } from "@/server/providers/nessie";
import { bankingSnapshots } from "@/server/records";
import { personaForRequest } from "@/server/profiles";
import { ownerId } from "@/server/session";

const Body = z.object({ personaId: z.string(), mode: z.enum(["fixture", "sandbox", "sandbox_cached"]) });

/**
 * Banking sync for a synthetic persona. A failed sandbox read returns an error, never data
 * relabeled as fixture. When an earlier sandbox read exists, the error offers it
 * (`cachedSandboxAvailable`); the client asks for it explicitly with mode "sandbox_cached".
 * Successful reads are stored for the owner as `${personaId}:fixture` / `${personaId}:sandbox`,
 * where POST /api/options/compare reads them.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const owner = await ownerId();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", "Expected { personaId, mode }", false, requestId);
  const { personaId, mode } = parsed.data;
  const resolved = await personaForRequest(personaId);
  if (!resolved) return apiError(404, "unknown_persona", "No such demo customer", false, requestId);
  const userCustomerId = resolved.stored?.profile.banking.nessieCustomerId ?? null;

  const ok = (r: Omit<BankingSyncResult, "requestId">) => Response.json({ requestId, ...r } satisfies BankingSyncResult);

  if (mode === "fixture") {
    const snapshot = fixtureSnapshot(personaId, resolved.stored?.spec)!;
    bankingSnapshots.put(owner, `${personaId}:fixture`, snapshot);
    return ok({ snapshot, stale: false });
  }

  const cached = bankingSnapshots.get(owner, `${personaId}:sandbox`);
  if (mode === "sandbox_cached") {
    if (!cached) return apiError(404, "no_cached_sandbox_read", "There is no earlier sandbox read for this customer", false, requestId);
    return ok({ snapshot: cached, stale: true, staleSince: cached.retrievedAt });
  }

  const started = Date.now();
  const fail = (status: number, code: string, message: string, retryable: boolean) => {
    const body: BankingSyncError = {
      error: { code, message, retryable, requestId },
      ...(cached && { cachedSandboxAvailable: { retrievedAt: cached.retrievedAt } }),
    };
    return Response.json(body, { status });
  };
  try {
    const snapshot = await fetchSandbox(personaId, userCustomerId);
    bankingSnapshots.put(owner, `${personaId}:sandbox`, snapshot);
    log({ requestId, personaId, outcome: "ok", ms: Date.now() - started });
    return ok({ snapshot, stale: false });
  } catch (e) {
    if (e instanceof NessieBadResponse) {
      log({ requestId, personaId, outcome: "bad_response", path: e.path, ms: Date.now() - started });
      return fail(502, "provider_bad_response", "Nessie returned records we could not read", false);
    }
    if (e instanceof NessieUnavailable) {
      const configured = Boolean(process.env.NESSIE_API_KEY && (userCustomerId ?? sandboxCustomerId(personaId)));
      log({ requestId, personaId, outcome: configured ? "provider_error" : "not_configured", ms: Date.now() - started });
      return configured
        ? fail(502, "provider_error", e.message, e.retryable)
        : fail(503, "provider_not_configured", e.message, false);
    }
    throw e;
  }
}

// Codes and timings only: never balances, descriptions or the API key.
const log = (line: Record<string, unknown>) => console.info(JSON.stringify({ at: "nessie_sync", ...line }));
