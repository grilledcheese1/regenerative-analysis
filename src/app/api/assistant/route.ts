import { z } from "zod";
import { allowRequest, defaultAssistant } from "@/server/assistant/assistant";
import { apiError, newRequestId } from "@/server/http";
import { comparisons, consents, fieldErrors } from "@/server/records";
import { ownerId } from "@/server/session";

const MAX_QUESTION = 500;

const Turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_QUESTION) });
const Body = z.object({
  schemaVersion: z.literal("1.0"),
  comparisonId: z.string().min(1),
  question: z.string().trim().min(1).max(MAX_QUESTION),
  history: z.array(Turn).max(6).optional(),
});

/**
 * Answers a customer's question about a stored comparison. The domain decides and calculates;
 * the model only phrases, and anything it gets wrong falls back to a labeled template answer.
 */
export async function POST(request: Request) {
  const owner = await ownerId();
  const requestId = newRequestId();

  const json: unknown = await request.json().catch(() => null);
  const asked = (json as { question?: unknown } | null)?.question;
  if (typeof asked === "string" && asked.length > MAX_QUESTION) {
    return apiError(413, "question_too_long", `Questions can be up to ${MAX_QUESTION} characters`, false, requestId);
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "invalid_request", "Expected { schemaVersion, comparisonId, question, history? }", false, requestId, fieldErrors(parsed.error.issues));
  }
  const { comparisonId, question, history } = parsed.data;

  if (!allowRequest(owner)) {
    return apiError(429, "rate_limited", "Too many questions. Wait a moment and try again", true, requestId);
  }

  const record = comparisons.get(owner, comparisonId);
  if (!record) {
    return apiError(409, "comparison_not_found_resync", "Calculate the comparison again, then retry", true, requestId);
  }

  // Only an explicit "off" in Settings withholds banking figures; never having decided is not a refusal.
  const bankingAnalysisOff = consents.list(owner).find((c) => c.purpose === "banking_analysis")?.granted === false;

  const answer = await defaultAssistant().answer(record, question, history ?? [], { owner, requestId, bankingAnalysisOff });
  return Response.json(answer, { status: 200 });
}
