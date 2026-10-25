import type { EvidenceBundle } from "./bundle";
import { ExplanationOutput } from "./prompt";

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const PROHIBITED =
  /\b(pre-?approved|approved|pre-?qualified|you qualify|guarantee[sd]?|locked[- ]in|booked|appointment (is|has been) (set|made)|discount of)\b/i;
const MAX_SUMMARY = 600;
const MAX_ITEM = 200;
const MAX_ITEMS = 3;

/** "$15,138.00" → "15138"; "10%" → "10". Single digits are ignored by the caller. */
const normalize = (token: string) => token.replace(/[$,%]/g, "").replace(/\.00$/, "").replace(/\.$/, "");

function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(normalize).filter((n) => n.length > 0);
}

/** Every number written anywhere in the bundle, tokenized the same way as the output. */
function allowedNumbers(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") numbersIn(value).forEach((n) => out.add(n));
  else if (typeof value === "number") numbersIn(String(value)).forEach((n) => out.add(n));
  else if (Array.isArray(value)) value.forEach((v) => allowedNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allowedNumbers(v, out));
  return out;
}

export type Validation = { ok: true; output: ExplanationOutput } | { ok: false; detail: string };

/**
 * Checks Claude's explanation against the bundle it was given. The first failure wins;
 * any failure means the caller shows the deterministic template instead.
 */
export function validateExplanation(raw: unknown, bundle: EvidenceBundle): Validation {
  const parsed = ExplanationOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, detail: "bad_shape" };
  const o = parsed.data;

  if (o.nextAction !== bundle.decision.nextAction) return { ok: false, detail: "changed_next_action" };
  if (o.recommendedOptionId !== bundle.decision.selectedOptionId) return { ok: false, detail: "changed_option" };

  const knownIds = new Set([...bundle.evidence.map((e) => e.id), ...bundle.options.map((op) => op.optionId)]);
  if (o.citedEvidenceIds.length === 0) return { ok: false, detail: "no_citations" };
  const unknownId = o.citedEvidenceIds.find((id) => !knownIds.has(id));
  if (unknownId) return { ok: false, detail: `unknown_evidence:${unknownId}` };

  const texts = [o.summary, ...o.tradeoffs, ...o.missingInfo];
  const allowed = allowedNumbers(bundle);
  for (const text of texts) {
    const bad = numbersIn(text).find((n) => !/^\d$/.test(n) && !allowed.has(n));
    if (bad) return { ok: false, detail: `unsupported_number:${bad}` };
  }

  if (texts.some((t) => PROHIBITED.test(t))) return { ok: false, detail: "prohibited_claim" };

  if (
    o.summary.length > MAX_SUMMARY ||
    o.tradeoffs.length > MAX_ITEMS ||
    o.missingInfo.length > MAX_ITEMS ||
    [...o.tradeoffs, ...o.missingInfo].some((t) => t.length > MAX_ITEM)
  ) {
    return { ok: false, detail: "too_long" };
  }

  return { ok: true, output: o };
}
