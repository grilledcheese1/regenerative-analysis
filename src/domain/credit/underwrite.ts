import type { CreditProfile, CreditReason, CreditTier, LoanApplication, LoanDecision, SourceKind } from "@/contracts";
import { loanPayment } from "@/domain/finance/loan";
import { usd } from "@/domain/format";
import { CREDIT_POLICY as P, GERMAN_BANDS as G, TIER_APR_BPS, TIER_LABEL, TIER_ORDER, tierForScore } from "./config";
import { CREDIT_MODEL, scoreGerman, type GermanInput } from "./model";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const shift = (t: CreditTier, by: number) => TIER_ORDER[Math.min(TIER_ORDER.length - 1, Math.max(0, TIER_ORDER.indexOf(t) + by))];
const reason = (code: string, text: string, label: string, display: string, source: SourceKind): CreditReason => ({ code, text, evidence: { label, display, source } });

function germanInput(app: LoanApplication, p: CreditProfile, ptiShare: number): GermanInput {
  const dm = (cents: number) => (cents / 100) * CREDIT_MODEL.dmPerUsd;
  const savings = dm(p.savingsCents);
  const [s1, s2, s3] = G.savingsDm;
  const [i1, i2, i3] = G.installmentPti;
  const openLoans = p.loans.filter((l) => l.amountCents > 0).length;
  return {
    A1: p.checkingCents < 0 ? "A11" : dm(p.checkingCents) < G.checkingDm ? "A12" : "A13",
    A2: Math.max(4, Math.round(app.termMonths * CREDIT_MODEL.durationScale)),
    A3: p.lateCarPayments > 0 ? "A33" : p.loans.length > 0 ? "A32" : "A30",
    A5: Math.round(dm(app.amountCents)),
    A6: savings < s1 ? "A61" : savings < s2 ? "A62" : savings < s3 ? "A63" : "A64",
    A8: ptiShare <= i1 ? 1 : ptiShare <= i2 ? 2 : ptiShare <= i3 ? 3 : 4,
    A16: Math.min(4, openLoans + 1) as 1 | 2 | 3 | 4,
  };
}

// Plain-language reasons for the model's features; `bad` when the feature pushed toward risk.
const MODEL_REASON: Record<keyof GermanInput, (p: CreditProfile, app: LoanApplication, bad: boolean) => CreditReason> = {
  A1: (p, _a, bad) => reason("checking", bad ? "Low checking balance" : "Healthy checking balance", "Checking balance", usd(p.checkingCents), "observed"),
  A2: (_p, a, bad) => reason("term", bad ? `Long loan term (${a.termMonths} months)` : `Short loan term (${a.termMonths} months)`, "Loan term", `${a.termMonths} months`, "derived"),
  A3: (p, _a, bad) =>
    reason("history", bad ? (p.lateCarPayments > 0 ? `${p.lateCarPayments} late car payments` : "Little credit history on file") : `Car payments on time (${p.onTimeCarPayments} observed)`, "Payment history", `${p.onTimeCarPayments} on time, ${p.lateCarPayments} late`, "observed"),
  A5: (_p, a, bad) => reason("amount", bad ? "Large amount for this profile" : "Modest loan amount", "Amount", usd(a.amountCents), "derived"),
  A6: (p, _a, bad) => reason("savings", bad ? "Little in savings" : `Savings of ${usd(p.savingsCents)}`, "Savings balance", usd(p.savingsCents), "observed"),
  A8: (_p, _a, bad) => reason("installment", bad ? "Payment is a large share of income" : "Payment is a small share of income", "Payment-to-income", "", "derived"),
  A16: (p, _a, bad) => {
    const open = p.loans.filter((l) => l.amountCents > 0).length;
    const text = bad ? (open > 1 ? `${open} open loans` : open === 1 ? "Already carrying an auto loan" : "No open loans on file") : open === 0 ? "No other open loans" : "Few open loans";
    return reason("loans", text, "Open loans", String(open), "observed");
  },
};

/**
 * Lender-style pre-qualification: policy knock-outs, a German Credit risk model that can move the
 * tier one band and send borderline files to review (never decline alone), Experian tier pricing,
 * and principal reasons. Estimates only: not an offer or a credit decision.
 */
export function underwrite(app: LoanApplication, p: CreditProfile): LoanDecision {
  const scoreSrc = p.scoreSource;
  const scoreTier = p.score.known ? tierForScore(p.score.value) : "near_prime";
  const gross = p.grossMonthlyCents;
  const share = (cents: number) => (gross > 0 ? cents / gross : 1);

  const provisional = app.paymentCents ?? loanPayment(app.amountCents, TIER_APR_BPS[scoreTier][app.vehicleCondition], app.termMonths);
  const { pBad, contributions } = scoreGerman(germanInput(app, p, share(provisional)));
  const th = CREDIT_MODEL.thresholds;
  const tier = pBad <= th.tierUp ? shift(scoreTier, -1) : pBad >= th.tierDown ? shift(scoreTier, 1) : scoreTier;

  const ltv = app.collateralValueCents && app.collateralValueCents > 0 ? app.amountCents / app.collateralValueCents : null;
  let aprBps = TIER_APR_BPS[tier][app.vehicleCondition];
  if (app.termMonths > P.longTermMonths) aprBps += P.longTermAddBps;
  if (ltv !== null && ltv > P.highLtv) aprBps += P.highLtvAddBps;
  const paymentCents = app.paymentCents ?? loanPayment(app.amountCents, aprBps, app.termMonths);
  const debts = Math.max(0, p.otherDebtMonthlyCents - app.replacesPaymentCents) + p.housingMonthlyCents + p.cardMinimumCents + paymentCents;
  const pti = share(paymentCents);
  const dti = share(debts);

  const failed: CreditReason[] = [];
  if (p.score.known && p.score.value < P.minScore) failed.push(reason("score", `Credit score ${p.score.value} is below ${P.minScore}`, "Credit score", String(p.score.value), scoreSrc));
  if (gross <= 0 || p.payrollDepositsPerMonth < P.minPayrollDepositsPerMonth) {
    failed.push(reason("income", "No steady income found: fewer than 2 payroll deposits a month", "Payroll deposits", `${p.payrollDepositsPerMonth.toFixed(1)}/mo`, "observed"));
  }
  const hasIncome = gross > 0;
  // Without income the ratios are meaningless; the income rule alone explains the decline.
  if (hasIncome && pti > P.maxPti) failed.push(reason("pti", `Car payment would be ${pct(pti)} of income (limit ${pct(P.maxPti)})`, "Payment-to-income", pct(pti), "derived"));
  if (hasIncome && dti > P.maxDti) failed.push(reason("dti", `Debt payments would be ${pct(dti)} of income (limit ${pct(P.maxDti)})`, "Debt-to-income", pct(dti), "derived"));
  if (ltv !== null && ltv > P.maxLtv) failed.push(reason("ltv", `Loan is ${pct(ltv)} of the car's value (limit ${pct(P.maxLtv)})`, "Loan-to-value", pct(ltv), "derived"));
  if (app.termMonths > P.maxTermMonths) failed.push(reason("term", `${app.termMonths}-month term is longer than ${P.maxTermMonths} months`, "Term", `${app.termMonths} months`, "derived"));

  const nearLimit = (hasIncome && (pti > P.maxPti * P.nearLimitShare || dti > P.maxDti * P.nearLimitShare)) || (ltv !== null && ltv > P.maxLtv * P.nearLimitShare);
  const status: LoanDecision["status"] = failed.length ? "not_prequalified" : pBad >= th.review || nearLimit ? "needs_review" : "prequalified";

  const notes: CreditReason[] = [];
  if (!p.score.known) notes.push(reason("score_unknown", "Credit score not provided, so near-prime pricing is assumed", "Credit score", "Not provided", scoreSrc));
  if (app.collateralValueCents === null) notes.push(reason("collateral_unknown", "Car value unknown, so loan-to-value wasn't checked", "Car value", "Unknown", "user_reported"));
  // Adverse-action style for anything short of pre-qualified; otherwise the factors that helped most.
  const against = status !== "prequalified";
  const modelReasons = [...contributions]
    .filter((c) => (against ? c.value > 0 : c.value < 0) && (hasIncome || c.feature !== "A8"))
    .sort((a, b) => (against ? b.value - a.value : a.value - b.value))
    .map((c) => {
      const r = MODEL_REASON[c.feature](p, app, against);
      return c.feature === "A8" ? { ...r, evidence: { ...r.evidence, display: pct(pti) } } : r;
    });
  const reasons = [...failed, ...notes, ...modelReasons].slice(0, P.maxReasons);

  const perDollar = loanPayment(100_000, aprBps, app.termMonths) / 100_000;
  const maxAmountCents = gross > 0 ? Math.floor((P.maxPti * gross) / perDollar / 10_000) * 10_000 : 0;

  let worthIt: boolean | undefined;
  if (app.purpose === "refinance" && app.currentAprBps !== undefined) {
    const savings = (loanPayment(app.amountCents, app.currentAprBps, app.termMonths) - paymentCents) * app.termMonths;
    worthIt = aprBps <= app.currentAprBps - P.refinanceMinSavingsBps && savings > (app.feeCents ?? P.refinanceFeeCents);
  }

  return {
    status,
    tier,
    scoreTier,
    aprBps,
    aprBandBps: [aprBps - P.bandBps, aprBps + P.bandBps],
    paymentCents,
    maxAmountCents,
    pBad,
    ptiPct: hasIncome ? Math.round(pti * 1000) / 10 : null,
    dtiPct: hasIncome ? Math.round(dti * 1000) / 10 : null,
    ltvPct: ltv === null ? null : Math.round(ltv * 1000) / 10,
    reasons,
    ...(worthIt !== undefined && { worthIt }),
  };
}

export const tierLabel = (t: CreditTier) => TIER_LABEL[t];
