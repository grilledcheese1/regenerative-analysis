import { describe, expect, it } from "vitest";
import type { CandidateTerms, LeaseTermOffer } from "@/contracts";
import { leasePayment } from "@/domain/finance/lease";
import { leaseOffers, leaseTermResult, pickTerm } from "@/domain/finance/lease-terms";

const offer = (termMonths: LeaseTermOffer["termMonths"], over: Partial<LeaseTermOffer> = {}): LeaseTermOffer => ({ termMonths, moneyFactor: 0.002, residualCents: 1800000, dueAtSigningCents: 0, ...over });
const base = { capCostCents: 3000000, mfAdjust: 0, monthlyRunningCents: 20000, monthlyMiles: 1000, dispositionFeeCents: 0, equityAppliedCents: 0, extraUpfrontCents: 0, budgetCents: 200000, availableUpfrontCents: 1000000 };

describe("leaseTermResult", () => {
  it("prices the payment with the standard lease formula", () => {
    const r = leaseTermResult({ ...base, offer: offer(36) });
    expect(r.paymentCents).toBe(leasePayment(3000000, 1800000, 36, 0.002));
    expect(r.aprEquivalentPct).toBeCloseTo(4.8, 5);
  });

  it("spreads due at signing over the term", () => {
    const without = leaseTermResult({ ...base, offer: offer(36) });
    const withDue = leaseTermResult({ ...base, offer: offer(36, { dueAtSigningCents: 180000 }) });
    expect(withDue.avgMonthlyCostCents - without.avgMonthlyCostCents).toBe(5000);
  });

  it("charges 15¢ a mile over 12,000 miles a year", () => {
    expect(leaseTermResult({ ...base, offer: offer(24), monthlyMiles: 1000 }).mileageOverageCents).toBe(0);
    const heavy = leaseTermResult({ ...base, offer: offer(24), monthlyMiles: 1500 });
    expect(heavy.mileageOverageCents).toBe(180000);
    expect(heavy.avgMonthlyCostCents - leaseTermResult({ ...base, offer: offer(24), monthlyMiles: 1000 }).avgMonthlyCostCents).toBe(7500);
  });

  it("raises the payment for a weaker credit tier", () => {
    expect(leaseTermResult({ ...base, offer: offer(36), mfAdjust: 0.0005 }).paymentCents).toBeGreaterThan(leaseTermResult({ ...base, offer: offer(36) }).paymentCents);
  });

  it("flags terms that outrun the 3-year / 36,000-mile warranty", () => {
    expect(leaseTermResult({ ...base, offer: offer(48) }).pastWarranty).toBe(true);
    expect(leaseTermResult({ ...base, offer: offer(36), monthlyMiles: 1500 }).pastWarranty).toBe(true);
    expect(leaseTermResult({ ...base, offer: offer(36), monthlyMiles: 900 }).pastWarranty).toBe(false);
  });

  it("stays finite with no driving", () => {
    const r = leaseTermResult({ ...base, offer: offer(12), monthlyMiles: 0 });
    expect(r.mileageOverageCents).toBe(0);
    expect(Number.isFinite(r.avgMonthlyCostCents)).toBe(true);
  });

  it("applies equity to due at signing and counts the excess as cash back", () => {
    const r = leaseTermResult({ ...base, offer: offer(36, { dueAtSigningCents: 150000 }), equityAppliedCents: 250000 });
    const plain = leaseTermResult({ ...base, offer: offer(36, { dueAtSigningCents: 150000 }) });
    expect(Math.abs(plain.avgMonthlyCostCents - r.avgMonthlyCostCents - 250000 / 36)).toBeLessThanOrEqual(1);
  });

  it("marks a term over budget as not feasible, with the reason", () => {
    const r = leaseTermResult({ ...base, offer: offer(12, { residualCents: 2700000 }), budgetCents: 10000 });
    expect(r.feasible).toBe(false);
    expect(r.exclusion).toMatch(/exceeds the \$100 vehicle budget/);
  });
});

describe("pickTerm and leaseOffers", () => {
  it("prefers the cheapest feasible term over a cheaper infeasible one", () => {
    const a = leaseTermResult({ ...base, offer: offer(12), budgetCents: 1 });
    const b = leaseTermResult({ ...base, offer: offer(36) });
    expect(pickTerm([{ ...a, avgMonthlyCostCents: 1 }, b]).termMonths).toBe(36);
    expect(pickTerm([a, { ...a, termMonths: 24, avgMonthlyCostCents: a.avgMonthlyCostCents + 1 }]).termMonths).toBe(12);
  });

  it("turns a legacy single-term candidate into one offer", () => {
    const c: CandidateTerms = { catalogId: "x", acquisition: "lease", priceCents: 3000000, residualCents: 1800000, moneyFactor: 0.002, leaseTermMonths: 36, dueAtSigningCents: 150000, endValueCents: 0, insuranceMonthlyCents: 0, maintenanceMonthlyCents: 0 };
    expect(leaseOffers(c)).toEqual([{ termMonths: 36, moneyFactor: 0.002, residualCents: 1800000, dueAtSigningCents: 150000 }]);
  });
});
