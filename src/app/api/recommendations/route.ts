import { z } from "zod";
import { PROMPT_VERSION, type RecommendationRecord } from "@/contracts";
import { defaultExplainer } from "@/server/explain/explainer";
import { templateExplanation } from "@/server/explain/template";
import { sha256Hex } from "@/server/hash";
import { apiError, newRequestId, withIdempotency } from "@/server/http";
import { comparisons, fieldErrors, recommendations } from "@/server/records";
import { ownerId } from "@/server/session";

const Body = z.object({ comparisonId: z.string().min(1), explain: z.boolean().default(true) });

/**
 * Explains a stored comparison. The decision (option, status, next action) always comes from
 * the domain; Claude may only phrase it, and anything it gets wrong falls back to the template.
 */
export async function POST(request: Request) {
  const owner = await ownerId();
  return withIdempotency(request, owner, "recommendations", async (json) => {
    const requestId = newRequestId();
    const parsed = Body.safeParse(json ?? {});
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Expected { comparisonId, explain? }", false, requestId, fieldErrors(parsed.error.issues));
    }
    const { comparisonId, explain } = parsed.data;
    const stored = comparisons.get(owner, comparisonId);
    if (!stored) {
      return apiError(409, "comparison_not_found_resync", "Calculate the comparison again, then retry", true, requestId);
    }

    const c = stored.comparison;
    const explanation = explain
      ? await defaultExplainer().explain(c, { comparisonId, requestId })
      : templateExplanation(c);
    const recommendationId = "rec_" + sha256Hex([comparisonId, PROMPT_VERSION, explanation.model ?? "template"].join("|")).slice(0, 16);

    const record: RecommendationRecord = {
      requestId,
      recommendationId,
      comparisonId,
      // Only the explanation mode can differ from the domain result; the decision never does.
      recommendation: { ...c.recommendation, explanationMode: explanation.mode },
      explanation,
    };
    recommendations.put(owner, recommendationId, record);
    return Response.json(record, { status: 201 });
  });
}
