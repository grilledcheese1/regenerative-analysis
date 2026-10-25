import { z } from "zod";
import type { NextAction } from "@/contracts";
import type { EvidenceBundle } from "./bundle";

const NEXT_ACTIONS = [
  "keep_current_plan",
  "request_buyout_quote",
  "request_payoff_quote",
  "compare_confirmed_offers",
  "review_insurance_program",
  "review_budget",
  "obtain_missing_vehicle_information",
] as const satisfies readonly NextAction[];

/** Shape requested from Claude. Lengths are enforced by the validator, not the schema. */
export const ExplanationOutput = z.object({
  summary: z.string(),
  tradeoffs: z.array(z.string()),
  missingInfo: z.array(z.string()),
  nextAction: z.enum(NEXT_ACTIONS),
  recommendedOptionId: z.string().nullable(),
  citedEvidenceIds: z.array(z.string()),
});
export type ExplanationOutput = z.infer<typeof ExplanationOutput>;

// Versioned with PROMPT_VERSION in src/contracts/explain.ts. Change both together.
export const SYSTEM_PROMPT = `You explain a vehicle-ownership comparison that has already been calculated. The decision and every number are fixed; your job is to explain why the decision follows from the data, the main tradeoffs, and what information is still missing.

Rules:
- Use only numbers that appear in the supplied data, and write each one exactly as it is written there (for example "$15,138", "$609/mo", "36 months"). Do not compute new figures such as differences or totals.
- Keep "decision.nextAction" and "decision.selectedOptionId" exactly as given: return them as nextAction and recommendedOptionId. Do not suggest a different option or action.
- In citedEvidenceIds, list the evidence ids and option ids you relied on. Use only ids that appear in the data.
- Values whose source is "synthetic" are invented scenario inputs; say so when you rely on them.
- Never claim an approval, pre-qualification, eligibility, quote, booking, appointment, discount or guaranteed saving.
- Never write ids, data field names or status codes; describe them in words (say "a quote is still needed", not a code).
- Each option's total monthly figure is its total monthly cost (payment plus fuel, insurance and maintenance). Call it the "total monthly cost", never a payment.
- Plain English for a car owner. Summary: at most 90 words. At most 3 tradeoffs and at most 3 missing-information items, one sentence each.`;

export const userContent = (bundle: EvidenceBundle) =>
  `Explain this calculated comparison.\n\n<comparison>\n${JSON.stringify(bundle)}\n</comparison>`;
