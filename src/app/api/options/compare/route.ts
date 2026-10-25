import { z } from "zod";
import type { CompareResponse } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { comparisonIdFor, loadBank } from "@/server/compare";
import { apiError, newRequestId, withIdempotency } from "@/server/http";
import { comparisons, fieldErrors } from "@/server/records";
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
    const p = persona(req.personaId);
    if (!p) return apiError(400, "invalid_request", "Unknown persona", false, requestId, { personaId: "No such demo customer" });

    const bank = loadBank(owner, req.personaId, req.bankingMode);
    if (!bank) {
      return apiError(409, "banking_not_loaded_resync", "Sync banking for this customer, then retry", true, requestId);
    }

    const comparisonId = comparisonIdFor(req, bank);

    const existing = comparisons.get(owner, comparisonId);
    if (existing) {
      return Response.json({ requestId, comparisonId, comparison: existing.comparison } satisfies CompareResponse, { status: 200 });
    }

    const { comparison } = runScenario(p, bank, req.scenario);
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
