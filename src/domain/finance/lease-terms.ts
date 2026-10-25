import type { CandidateTerms, Cents, LeaseTermOffer, LeaseTermResult } from "@/contracts";
import { usd } from "@/domain/format";
import { leasePayment } from "./lease";

// Lease terms compared the way a shopper would: the all-in average monthly cost over each term's own
// length. Allowance and overage rates are synthetic scenario inputs.

export const LEASE_TERMS = {
  milesPerYear: 12_000,
  excessCentsPerMile: 15,
  warrantyMonths: 36,
  warrantyMiles: 36_000,
  aprPerMoneyFactor: 2400,
  dispositionFeeCents: 35000, // turn-in fee at the end of a new lease (synthetic)
} as const;

/** The candidate's term table; a legacy single-term candidate becomes a one-row table. */
export function leaseOffers(c: CandidateTerms): LeaseTermOffer[] {
  if (c.leaseTerms?.length) return c.leaseTerms;
  return [{ termMonths: c.leaseTermMonths as LeaseTermOffer["termMonths"], moneyFactor: c.moneyFactor!, residualCents: c.residualCents!, dueAtSigningCents: c.dueAtSigningCents }];
}

export interface LeaseTermInput {
  capCostCents: Cents;
  offer: LeaseTermOffer;
  mfAdjust: number; // credit-tier adjustment to the money factor
  monthlyRunningCents: Cents; // fuel, insurance, maintenance
  monthlyMiles: number;
  dispositionFeeCents: Cents; // due when this new lease ends
  equityAppliedCents: Cents; // trade-in equity put toward this lease (0 when none)
  extraUpfrontCents: Cents; // other cash due now (e.g. the current lease's turn-in charges)
  budgetCents: Cents;
  availableUpfrontCents: Cents;
}

export function leaseTermResult(i: LeaseTermInput): LeaseTermResult {
  const { termMonths: n, residualCents, dueAtSigningCents } = i.offer;
  const moneyFactor = Math.max(0, i.offer.moneyFactor + i.mfAdjust);
  const paymentCents = leasePayment(i.capCostCents, residualCents, n, moneyFactor);
  const miles = Math.max(0, Number.isFinite(i.monthlyMiles) ? i.monthlyMiles : 0) * n;
  const allowed = (LEASE_TERMS.milesPerYear * n) / 12;
  const mileageOverageCents = Math.max(0, Math.round(miles - allowed)) * LEASE_TERMS.excessCentsPerMile;
  const upfront = Math.max(0, dueAtSigningCents - i.equityAppliedCents) + i.extraUpfrontCents;
  const cashBack = Math.max(0, i.equityAppliedCents - dueAtSigningCents);
  const total = upfront - cashBack + paymentCents * n + i.dispositionFeeCents + mileageOverageCents + i.monthlyRunningCents * n;
  const totalMonthlyCents = paymentCents + i.monthlyRunningCents;

  let exclusion: string | null = null;
  if (upfront > i.availableUpfrontCents) exclusion = `Needs ${usd(upfront)} upfront; ${usd(Math.max(0, i.availableUpfrontCents))} available after the reserve`;
  else if (totalMonthlyCents > i.budgetCents) exclusion = `${usd(totalMonthlyCents)}/mo exceeds the ${usd(i.budgetCents)} vehicle budget`;

  return {
    termMonths: n,
    moneyFactor,
    aprEquivalentPct: moneyFactor * LEASE_TERMS.aprPerMoneyFactor,
    paymentCents,
    dueAtSigningCents,
    mileageOverageCents,
    avgMonthlyCostCents: Math.round(total / n),
    totalMonthlyCents,
    feasible: exclusion === null,
    exclusion,
    pastWarranty: n > LEASE_TERMS.warrantyMonths || miles > LEASE_TERMS.warrantyMiles,
  };
}

/** The cheapest feasible term by average monthly cost; when none is feasible, the cheapest. */
export function pickTerm(results: LeaseTermResult[]): LeaseTermResult {
  const byCost = [...results].sort((a, b) => a.avgMonthlyCostCents - b.avgMonthlyCostCents || a.termMonths - b.termMonths);
  return byCost.find((r) => r.feasible) ?? byCost[0];
}
