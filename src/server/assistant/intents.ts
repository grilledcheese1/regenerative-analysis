import type { AssistantIntent, ScenarioInputs } from "@/contracts";

export type WhatIfChange = Partial<Pick<ScenarioInputs, "gasCentsPerGallon" | "monthlyMiles" | "extraMonthlySpendingCents">>;

/** `vague` means the question asked for "more" or "less" driving without a number. */
export interface ParsedWhatIf {
  change: WhatIfChange;
  vague?: "more_miles" | "fewer_miles";
}

export interface RoutedIntent {
  intent: AssistantIntent;
  /** Only for what_if. `null` means the question changes something the model doesn't cover. */
  whatIf?: ParsedWhatIf | null;
}

// Limits match POST /api/options/compare.
const GAS_CENTS = { min: 50, max: 2000 };
const MILES = { min: 0, max: 20_000 };
const EXTRA_CENTS = { min: 0, max: 10_000_000 };
/** Step used when someone asks "what if I drive more": stated in the answer, never hidden. */
export const VAGUE_MILES_FACTOR = 1.25;

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));
const num = (s: string) => Number(s.replace(/,/g, ""));

const OUT_OF_SCOPE =
  /\b(approve|approval|pre-?approv|pre-?qualif|qualify|credit score|credit report|legal|lawyer|sue|tax advice|invest|stock|crypto|joke|poem|weather|ignore (all |the |your |previous )|system prompt|your (rules|instructions)|reveal|jailbreak|other (customers?|people|users?)|someone else|another customer)\b/i;

/** Pulls gas, mileage and new-expense changes out of a "what if" question. */
export function parseWhatIf(q: string): ParsedWhatIf | null {
  const change: WhatIfChange = {};
  const text = q.toLowerCase();

  if (/\b(gas|gasoline|fuel|petrol|gallon)\b/.test(text)) {
    const m = text.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks)/);
    const dollars = m ? Number(m[1] ?? m[2]) : NaN;
    if (Number.isFinite(dollars)) change.gasCentsPerGallon = clamp(Math.round(dollars * 100), GAS_CENTS);
  }

  const miles = text.match(/([\d][\d,]*(?:\.\d+)?)\s*(k\b)?\s*(?:miles?|mi\b)(?:\s*(?:a|per|\/|each|every)\s*(month|mo|year|yr|week))?/);
  if (miles) {
    let value = num(miles[1]) * (miles[2] ? 1000 : 1);
    const unit = miles[3];
    if (unit === "year" || unit === "yr") value /= 12;
    else if (unit === "week") value *= 52 / 12;
    // "18,000 miles" with no period is read as a year only when it is too big for a month.
    else if (!unit && value > MILES.max) value /= 12;
    change.monthlyMiles = clamp(Math.round(value), MILES);
  }

  const expense = text.match(/(?:add|adding|extra|new|another|extra monthly)\s+(?:a\s+)?\$\s?([\d,]+(?:\.\d{1,2})?)/) ?? text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(?:a|per|\/)?\s*(?:month|mo)?\s*(?:expense|bill|payment|subscription)/);
  if (expense) change.extraMonthlySpendingCents = clamp(Math.round(num(expense[1]) * 100), EXTRA_CENTS);

  if (Object.keys(change).length > 0) return { change };
  if (/\b(drive|driving|commute)\b.*\b(more|farther|further|longer)\b|\bmore miles\b/.test(text)) return { change: {}, vague: "more_miles" };
  if (/\b(drive|driving|commute)\b.*\b(less|fewer|shorter)\b|\bfewer miles\b/.test(text)) return { change: {}, vague: "fewer_miles" };
  return null;
}

/** Rules first: the model only phrases answers, it never classifies. Anything unclear is out of scope. */
export function routeIntent(question: string): RoutedIntent {
  const q = question.trim().toLowerCase();
  if (!q || OUT_OF_SCOPE.test(q)) return { intent: "out_of_scope" };

  if (/\b(what if|suppose|supposing|if gas|if i (drive|add|spend)|say gas)\b/.test(q)) {
    return { intent: "what_if", whatIf: parseWhatIf(q) };
  }
  if (/\b(next step|what do i do|do next|do now|what now|what should i do next|get started|how do i proceed)\b/.test(q)) return { intent: "next_step" };
  if (/\b(missing|what else|need from me|more information|more info|information.*(needed|missing))\b/.test(q)) return { intent: "missing_info" };
  if (/\b(fees?|mileage (cap|limit|penalt|overage)|overage|terms|apr|interest|penalt|residual|payoff|maturity)\b/.test(q)) return { intent: "fees_and_terms" };
  if (/\b(afford|budget|income|cost each month|monthly cost|per month|a month|how much can i)\b/.test(q)) return { intent: "budget" };
  if (/\b(hybrid|sav(e|es|ing|ings)|fuel|gas cost|running cost)\b/.test(q)) return { intent: "hybrid_savings" };
  if (/\b(compare|comparison|versus|vs\.?|difference between|better than)\b/.test(q)) return { intent: "compare_options" };
  if (/\b(why|reason|recommend|leading|leader|buy ?out|should i|best option|this option|decision|keep)\b/.test(q)) return { intent: "explain_decision" };
  return { intent: "out_of_scope" };
}
