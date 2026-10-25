import "server-only";
import type { Comparison } from "@/contracts";
import { usd } from "@/domain/format";
import { canonicalJson, sha256Hex } from "@/server/hash";

/**
 * Everything Claude sees, and nothing else: the fixed decision, option figures formatted
 * exactly as the screens show them, and the evidence facts. Raw transactions, account ids,
 * coordinates and market listing text never go in.
 */
export function buildEvidenceBundle(c: Comparison) {
  const r = c.recommendation;
  return {
    horizonMonths: c.horizonMonths,
    actionDate: c.actionDate,
    preparation: c.preparation && {
      months: c.preparation.months,
      cash: usd(c.preparation.cashCents),
      note: c.preparation.note,
    },
    decision: {
      status: r.status,
      selectedOptionId: r.selectedOptionId,
      nextAction: r.nextAction,
      headline: r.headline,
    },
    templateLines: r.explanation,
    missingInputs: r.missingInputs,
    options: c.options.map((o) => ({
      optionId: o.optionId,
      label: o.label,
      feasible: o.feasible,
      exclusions: o.exclusions,
      missingInputs: o.missingInputs,
      tradeoff: o.tradeoff,
      upfrontCash: usd(o.upfrontCashCents),
      totalMonthly: `${usd(o.totalMonthlyCents)}/mo`,
      budgetLeft: usd(o.monthlyRemainingCents),
      cashOutOverHorizon: usd(o.netCashOutflowCents),
      debtAtHorizon: usd(o.endingDebtCents),
      equityAtHorizon: usd(o.endingEquityCents),
      economicCost: usd(o.economicCostCents),
    })),
    evidence: c.evidence.map((e) => ({ id: e.id, label: e.label, display: e.display, source: e.source })),
    sensitivity: c.sensitivity,
    notConsidered: c.notConsidered,
    allowedNextAction: r.nextAction,
  };
}

export type EvidenceBundle = ReturnType<typeof buildEvidenceBundle>;

export const evidenceHash = (b: EvidenceBundle) => sha256Hex(canonicalJson(b));
