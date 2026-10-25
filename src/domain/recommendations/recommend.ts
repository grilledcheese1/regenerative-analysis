import type { Comparison, NextAction, OptionResult, Persona, Recommendation } from "@/contracts";
import type { BudgetSnapshot } from "@/domain/finance/budget";
import { usd } from "@/domain/format";
import { rankWithTieBreak } from "./rank";

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  keep_current_plan: "Keep the current plan",
  request_buyout_quote: "Request a buyout quote",
  request_payoff_quote: "Request a payoff statement",
  compare_confirmed_offers: "Compare confirmed offers",
  review_insurance_program: "Review an insurance program",
  review_budget: "Review the budget",
  obtain_missing_vehicle_information: "Add missing vehicle information",
};

/**
 * Feasibility and ranking are decided here, in code. The explanation is a deterministic
 * template over those results; an AI explainer may later rephrase it but not change it.
 */
export function recommend(
  c: Omit<Comparison, "recommendation">,
  persona: Persona,
  budget: BudgetSnapshot,
): Recommendation {
  const { ranked, tieBreak } = rankWithTieBreak(c.options, persona.profile.objective);
  const top = ranked[0];

  if (!top) {
    const cheapest = [...c.options].sort((a, b) => a.totalMonthlyCents - b.totalMonthlyCents)[0];
    const recurringGap = cheapest ? cheapest.totalMonthlyCents - budget.vehicleBudgetCents : 0;
    const hasLoan = persona.contract.type === "loan";
    return {
      status: "no_feasible_option",
      selectedOptionId: null,
      nextAction: recurringGap > 0 ? "review_budget" : hasLoan ? "request_payoff_quote" : "review_budget",
      headline: "No option fits these constraints",
      explanation: [
        `The vehicle budget is ${usd(budget.vehicleBudgetCents)}/mo and ${usd(Math.max(0, budget.availableUpfrontCashCents))} is available upfront after the reserve.`,
        cheapest
          ? `The lowest monthly option, ${cheapest.label}, costs ${usd(cheapest.totalMonthlyCents)}/mo, ${usd(recurringGap)} over budget.`
          : "No options could be calculated.",
        hasLoan
          ? "A payoff statement confirms the real balance before any refinance or sale is worth pursuing."
          : "Review spending, the savings goal, or the reserve before considering a change.",
      ],
      evidenceIds: ["vehicle_budget", "available_upfront_cash", ...(hasLoan ? ["payoff"] : [])],
      missingInputs: [...new Set(c.options.flatMap((o) => o.missingInputs))],
      explanationMode: "template",
    };
  }

  const runnerUp = ranked[1];
  const flips = c.sensitivity.some((s) => s.flipsRanking);
  const byMonthly = persona.profile.objective === "lowest_monthly";
  const key = (o: OptionResult) => (byMonthly ? o.totalMonthlyCents : o.avgMonthlyCostCents);
  const lease = top.lease ? top.lease.terms.find((t) => t.termMonths === top.lease!.chosenTermMonths)! : null;
  const lines = [
    byMonthly
      ? `${top.label} has the lowest monthly total: ${usd(top.totalMonthlyCents)}/mo.`
      : lease
        ? `${top.label} has the lowest average monthly cost: ${usd(top.avgMonthlyCostCents)}/mo over its ${lease.termMonths}-month term, counting what's due at signing, fees and expected mileage charges.`
        : `${top.label} has the lowest average monthly cost: ${usd(top.avgMonthlyCostCents)}/mo over ${c.horizonMonths} months, after counting ${usd(top.endingEquityCents)} of ending equity.`,
    `It costs ${usd(top.totalMonthlyCents)}/mo including fuel, insurance and maintenance, leaving ${usd(top.monthlyRemainingCents)} of the ${usd(budget.vehicleBudgetCents)} vehicle budget.`,
  ];
  if (lease) {
    const alt = top.lease!.terms.filter((t) => t.termMonths !== lease.termMonths).sort((a, b) => a.avgMonthlyCostCents - b.avgMonthlyCostCents)[0];
    if (alt) lines.push(`${lease.termMonths}-month term: ${usd(lease.avgMonthlyCostCents)}/mo on average; ${alt.termMonths} months would cost ${usd(alt.avgMonthlyCostCents - lease.avgMonthlyCostCents)} more a month.`);
  }
  if (top.switchMath) lines.push(`That's ${usd(top.switchMath.savingsPerMonthCents)}/mo less than continuing the lease (${usd(top.switchMath.continueAvgMonthlyCents)}/mo).`);
  if (tieBreak && tieBreak.winner === top.optionId) {
    const loser = c.options.find((o) => o.optionId === tieBreak.loser)!;
    const w = top.reliability!;
    const l = loser.reliability!;
    // Quote whichever count decided: complaints, or recalls when complaints were equal.
    const [n, other, noun] = w.complaints !== l.complaints ? [w.complaints!, l.complaints!, "owner complaint"] : [w.recalls!, l.recalls!, "recall"];
    lines.push(
      `${top.label} and ${loser.label} are less than $25 a month apart, so reliability decided: NHTSA lists ${n} ${noun}${n === 1 ? "" : "s"} for its model year against ${other}.`,
    );
  } else if (runnerUp) {
    lines.push(`Next best is ${runnerUp.label}, ${usd(key(runnerUp) - key(top))}/mo more ${byMonthly ? "each month" : "on average"}.`);
  }
  if (top.warranty) lines.push(top.warranty);
  if (flips) lines.push("The ranking changes if ending vehicle values move by 10%, so treat it as a close call.");

  let nextAction: NextAction;
  let status: Recommendation["status"] = "recommended";
  if (top.missingInputs.includes("confirmed_buyout_taxes_and_fees")) {
    nextAction = "request_buyout_quote";
    status = "needs_information";
    lines.push("The buyout figure is the contract purchase option before taxes and fees; a quote confirms it.");
  } else if (top.missingInputs.includes("payoff_statement")) {
    nextAction = "request_payoff_quote";
    status = "needs_information";
  } else if (top.kind === "keep") {
    nextAction = "keep_current_plan";
    const alt = c.options.find((o) => o.kind !== "keep");
    if (alt) {
      lines.push(
        alt.feasible
          ? `Replacing saves on fuel but does not recover its cost within ${c.horizonMonths} months.`
          : `Replacing is not feasible now: ${alt.exclusions[0]?.toLowerCase()}.`,
      );
    }
  } else if (top.credit?.status === "needs_review") {
    nextAction = "compare_confirmed_offers";
    status = "needs_information";
    lines.push(`The loan needs a lender's review: ${top.credit.reasons[0]?.text.toLowerCase() ?? "borderline file"}.`);
  } else if (flips || top.missingInputs.length > 0) {
    nextAction = "compare_confirmed_offers";
    status = "needs_information";
  } else {
    nextAction = "compare_confirmed_offers";
  }

  return {
    status,
    selectedOptionId: top.optionId,
    nextAction,
    headline: status === "needs_information" ? `Leading option: ${top.label}` : top.label,
    explanation: lines,
    evidenceIds: ["vehicle_budget", "available_upfront_cash", ...c.evidence.map((e) => e.id).filter((id) => id !== "vehicle_budget" && id !== "available_upfront_cash")],
    missingInputs: top.missingInputs,
    explanationMode: "template",
  };
}
