import { z } from "zod";
import type { BankingSnapshot, CompareResponse } from "@/contracts";
import { MODEL_VERSION } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { canonicalJson, sha256Hex } from "@/server/hash";
import { apiError, newRequestId, withIdempotency } from "@/server/http";
import { fixtureSnapshot } from "@/server/providers/nessie";
import { bankingSnapshots, comparisons, fieldErrors } from "@/server/records";
import { personaForRequest } from "@/server/profiles";
import { ownerId } from "@/server/session";

const SOURCE_KINDS = ["observed", "user_reported", "derived", "modeled", "synthetic"] as const;

const Body = z.object({
  schemaVersion: z.literal("1.0"),
  personaId: z.string().min(1),
  bankingMode: z.enum(["fixture", "sandbox", "sandbox_cached"]),
  scenario: z.object({
    gasCentsPerGallon: z.number().int().min(50).max(2000),
    monthlyMiles: z.number().min(0).max(20_000),
    cityShare: z.number().min(0).max(1).optional(),
    usageSource: z.enum(SOURCE_KINDS).optional(),
    extraMonthlySpendingCents: z.number().int().min(0).max(10_000_000),
    incomeConfirmed: z.boolean(),
  }),
});

/**
 * Calculates the ownership comparison on the server with the same pure functions the screens
 * use, and stores it as an immutable snapshot. Banking comes from the fixture or from the
 * owner's last sandbox sync; a missing sandbox read is a 409, never a silent fixture swap.
 */
export async function POST(request: Request) {
  const owner = await ownerId();
  return withIdempotency(request, owner, "options/compare", async (json) => {
    const requestId = newRequestId();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Expected a CompareRequest (schemaVersion 1.0)", false, requestId, fieldErrors(parsed.error.issues));
    }
    const req = parsed.data;
    const resolved = await personaForRequest(req.personaId);
    if (!resolved) return apiError(400, "invalid_request", "Unknown persona", false, requestId, { personaId: "No such demo customer" });

    let bank: BankingSnapshot | null | undefined;
    if (req.bankingMode === "fixture") bank = fixtureSnapshot(req.personaId, resolved.stored?.spec);
    else bank = bankingSnapshots.get(owner, `${req.personaId}:sandbox`);
    if (!bank) {
      return apiError(409, "banking_not_loaded_resync", "Sync banking for this customer, then retry", true, requestId);
    }

    // Fixture records are static, so their load time doesn't make a new comparison; a sandbox
    // read is identified by when it was retrieved.
    const bankIdentity = {
      customerId: bank.customerId,
      mode: bank.mode,
      retrievedAt: bank.mode === "fixture" ? null : bank.retrievedAt,
    };
    const comparisonId = "cmp_" + sha256Hex(canonicalJson({ req, bank: bankIdentity, MODEL_VERSION })).slice(0, 16);

    const existing = comparisons.get(owner, comparisonId);
    if (existing) {
      return Response.json({ requestId, comparisonId, comparison: existing.comparison } satisfies CompareResponse, { status: 200 });
    }

    const { comparison } = runScenario(resolved.persona, bank, req.scenario);
    comparisons.put(owner, comparisonId, {
      comparisonId,
      request: req,
      bank: { customerId: bank.customerId, mode: bank.mode, retrievedAt: bank.retrievedAt },
      comparison,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ requestId, comparisonId, comparison } satisfies CompareResponse, { status: 201 });
  });
}
