import { FOLLOW_UPS, type AssistantIntent } from "@/contracts";
import { allowedNumbers, INTERNAL_ID, numbersIn, PROHIBITED } from "@/server/explain/validate";
import type { AssistantFacts } from "./facts";
import { AssistantOutput } from "./prompt";

const MAX_ANSWER = 700;
/** Words that make a sentence a recommendation about an option. */
const RECOMMENDS = /\b(recommend\w*|best|leading|leader|top (pick|choice)|go with|choose|should (buy|lease|keep|get|take))\b/i;

export type AnswerValidation = { ok: true; output: AssistantOutput } | { ok: false; detail: string };

/**
 * Checks a model answer against the facts it was given. The first failure wins and the caller
 * shows the template instead.
 */
export function validateAnswer(
  raw: unknown,
  facts: AssistantFacts,
  ctx: { intent: AssistantIntent; selectedOptionId: string | null },
): AnswerValidation {
  const parsed = AssistantOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, detail: "bad_shape" };
  const o = parsed.data;

  if (ctx.intent === "out_of_scope" && !o.declined) return { ok: false, detail: "must_decline" };
  if (o.followUps.some((f) => !(FOLLOW_UPS as readonly string[]).includes(f))) return { ok: false, detail: "bad_follow_up" };

  const knownIds = new Set([...facts.evidence.map((e) => e.id), ...facts.options.map((op) => op.optionId)]);
  if (!o.declined && o.citedEvidenceIds.length === 0) return { ok: false, detail: "no_citations" };
  const unknownId = o.citedEvidenceIds.find((id) => !knownIds.has(id));
  if (unknownId) return { ok: false, detail: `unknown_evidence:${unknownId}` };

  const allowed = allowedNumbers(facts);
  const bad = numbersIn(o.answer).find((n) => !/^\d$/.test(n) && !allowed.has(n));
  if (bad) return { ok: false, detail: `unsupported_number:${bad}` };

  if (PROHIBITED.test(o.answer)) return { ok: false, detail: "prohibited_claim" };
  const internal = o.answer.match(INTERNAL_ID);
  if (internal) return { ok: false, detail: `internal_identifier:${internal[0]}` };
  if (o.answer.length > MAX_ANSWER) return { ok: false, detail: "too_long" };

  // A sentence that recommends an option must recommend the one the domain chose.
  const selected = ctx.selectedOptionId;
  for (const sentence of o.answer.split(/(?<=[.!?])\s+/)) {
    if (!RECOMMENDS.test(sentence)) continue;
    const named = facts.options.filter((op) => sentence.toLowerCase().includes(op.label.toLowerCase()));
    if (named.length > 0 && !named.some((op) => op.optionId === selected)) return { ok: false, detail: "changed_decision" };
  }

  return { ok: true, output: o };
}
