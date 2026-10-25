import "server-only";
import type { WhatIfResult } from "@/contracts";
import { usd } from "@/domain/format";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { comparisonIdFor, loadBank } from "@/server/compare";
import { buildEvidenceBundle, type EvidenceBundle } from "@/server/explain/bundle";
import { canonicalJson, sha256Hex } from "@/server/hash";
import { comparisons, type ComparisonRecord } from "@/server/records";
import { VAGUE_MILES_FACTOR, type ParsedWhatIf } from "./intents";

/** The re-run comparison, formatted exactly as the screens show it. */
export interface WhatIfBlock {
  changes: string[];
  assumption?: string;
  before: { headline: string; nextAction: string };
  after: {
    headline: string;
    selectedOptionId: string | null;
    nextAction: string;
    options: { optionId: string; label: string; totalMonthly: string; budgetLeft: string }[];
  };
  decisionChanged: boolean;
}

export interface AssistantFacts extends EvidenceBundle {
  /** Per-option running cost (fuel, insurance, maintenance), for hybrid-savings questions. */
  running: { optionId: string; label: string; runningMonthly: string }[];
  /** True when the customer turned banking analysis off in Settings; budget figures are then withheld. */
  bankingAnalysisOff: boolean;
  whatIf?: WhatIfBlock;
}

export const factsHash = (f: AssistantFacts) => sha256Hex(canonicalJson(f));

export function buildFacts(record: ComparisonRecord, opts: { bankingAnalysisOff: boolean; whatIf?: WhatIfBlock }): AssistantFacts {
  const bundle = buildEvidenceBundle(record.comparison);
  const facts: AssistantFacts = {
    ...bundle,
    running: record.comparison.options.map((o) => ({
      optionId: o.optionId,
      label: o.label,
      runningMonthly: `${usd(o.monthlyRunningCents)}/mo`,
    })),
    bankingAnalysisOff: opts.bankingAnalysisOff,
    ...(opts.whatIf && { whatIf: opts.whatIf }),
  };
  if (opts.bankingAnalysisOff) {
    // Without consent no banking-derived figure reaches the answer.
    const banking = new Set(["vehicle_budget", "recurring_income", "available_upfront_cash"]);
    facts.evidence = facts.evidence.filter((e) => !banking.has(e.id));
    facts.options = facts.options.map((o) => ({ ...o, budgetLeft: "not shown" }));
  }
  return facts;
}

export type WhatIfOutcome =
  | { ok: true; result: WhatIfResult; block: WhatIfBlock }
  | { ok: false; reason: "unsupported" | "banking_not_loaded" };

/**
 * Re-runs the real scenario math with one customer-stated change and stores the result as a new
 * snapshot for the owner (so "Delete my demo data" clears it). The screens never see it.
 */
export function runWhatIf(owner: string, record: ComparisonRecord, parsed: ParsedWhatIf | null): WhatIfOutcome {
  if (!parsed) return { ok: false, reason: "unsupported" };
  const base = record.request.scenario;
  const p = persona(record.request.personaId);
  if (!p) return { ok: false, reason: "unsupported" };
  const bank = loadBank(owner, record.request.personaId, record.request.bankingMode);
  if (!bank) return { ok: false, reason: "banking_not_loaded" };

  const change = { ...parsed.change };
  let assumption: string | undefined;
  if (parsed.vague) {
    const factor = parsed.vague === "more_miles" ? VAGUE_MILES_FACTOR : 1 / VAGUE_MILES_FACTOR;
    change.monthlyMiles = Math.round(base.monthlyMiles * factor);
    assumption = `"${parsed.vague === "more_miles" ? "More" : "Fewer"}" was read as ${parsed.vague === "more_miles" ? "25% more" : "20% fewer"} miles.`;
  }
  if (change.extraMonthlySpendingCents !== undefined) {
    // "Add $300" adds to any expense already in the scenario, up to the route's limit.
    change.extraMonthlySpendingCents = Math.min(10_000_000, base.extraMonthlySpendingCents + change.extraMonthlySpendingCents);
  }
  if (Object.keys(change).length === 0) return { ok: false, reason: "unsupported" };

  const scenario = { ...base, ...change };
  const { comparison } = runScenario(p, bank, scenario);
  const request = { ...record.request, scenario };
  const comparisonId = comparisonIdFor(request, bank);
  if (!comparisons.get(owner, comparisonId)) {
    comparisons.put(owner, comparisonId, {
      comparisonId,
      request,
      bank: { customerId: bank.customerId, mode: bank.mode, retrievedAt: bank.retrievedAt },
      comparison,
      createdAt: new Date().toISOString(),
    });
  }

  const before = record.comparison.recommendation;
  const after = comparison.recommendation;
  const decisionChanged = before.selectedOptionId !== after.selectedOptionId || before.nextAction !== after.nextAction;

  const changes: string[] = [];
  if (change.gasCentsPerGallon !== undefined) changes.push(`Gas price ${usd(change.gasCentsPerGallon, 2)}/gal`);
  if (change.monthlyMiles !== undefined) changes.push(`Driving ${change.monthlyMiles.toLocaleString("en-US")} miles a month`);
  if (change.extraMonthlySpendingCents !== undefined) {
    changes.push(`New monthly expenses ${usd(scenario.extraMonthlySpendingCents)}/mo in total`);
  }

  return {
    ok: true,
    result: {
      changed: change,
      ...(assumption && { assumption }),
      comparisonId,
      headline: after.headline,
      selectedOptionId: after.selectedOptionId,
      nextAction: after.nextAction,
      decisionChanged,
    },
    block: {
      changes,
      ...(assumption && { assumption }),
      before: { headline: before.headline, nextAction: before.nextAction },
      after: {
        headline: after.headline,
        selectedOptionId: after.selectedOptionId,
        nextAction: after.nextAction,
        options: comparison.options.map((o) => ({
          optionId: o.optionId,
          label: o.label,
          totalMonthly: `${usd(o.totalMonthlyCents)}/mo`,
          budgetLeft: usd(o.monthlyRemainingCents),
        })),
      },
      decisionChanged,
    },
  };
}

