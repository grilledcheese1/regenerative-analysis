import { PROMPT_VERSION, type Comparison, type Explanation, type FallbackReason } from "@/contracts";

const words = (id: string) => {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** The deterministic explanation, built only from the domain recommendation. */
export function templateExplanation(c: Comparison, reason?: FallbackReason, rejectedDetail?: string): Explanation {
  const r = c.recommendation;
  return {
    mode: "template",
    promptVersion: PROMPT_VERSION,
    model: null,
    summary: [r.headline, r.explanation[0]].filter(Boolean).join(". "),
    tradeoffs: r.explanation.slice(1, 4),
    missingInfo: r.missingInputs.slice(0, 3).map(words),
    nextAction: r.nextAction,
    citedEvidenceIds: r.evidenceIds,
    ...(reason && { fallbackReason: reason }),
    ...(rejectedDetail && { rejectedDetail }),
    generatedAt: new Date().toISOString(),
    cacheHit: false,
  };
}
