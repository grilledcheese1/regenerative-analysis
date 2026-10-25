import { describe, expect, it } from "vitest";
import { known, unknown, type CreditProfile, type LoanApplication } from "@/contracts";
import { CREDIT_POLICY as P, TIER_APR_BPS } from "@/domain/credit/config";
import { underwrite } from "@/domain/credit/underwrite";
import { loanPayment } from "@/domain/finance/loan";

const prime: CreditProfile = {
  score: known(720),
  scoreSource: "user_reported",
  loans: [{ loanId: "l1", accountId: "a", type: "credit file", status: "approved", creditScore: 720, monthlyPaymentCents: 0, amountCents: 0, description: "" }],
  onTimeCarPayments: 0,
  lateCarPayments: 0,
  payrollDepositsPerMonth: 2,
  takeHomeMonthlyCents: 500000,
  grossMonthlyCents: Math.round(500000 / 0.78),
  housingMonthlyCents: 150000,
  otherDebtMonthlyCents: 0,
  cardMinimumCents: 2500,
  checkingCents: 400000,
  savingsCents: 800000,
};
const car: LoanApplication = { purpose: "finance", vehicleCondition: "new", amountCents: 2500000, termMonths: 60, collateralValueCents: 2800000, replacesPaymentCents: 0 };

describe("underwrite", () => {
  it("pre-qualifies a prime borrower at the prime new-car rate", () => {
    const d = underwrite(car, prime);
    expect(d.status).toBe("prequalified");
    expect(d.scoreTier).toBe("prime");
    expect(d.aprBps).toBe(TIER_APR_BPS[d.tier].new);
    expect(d.aprBandBps).toEqual([d.aprBps - 75, d.aprBps + 75]);
  });

  it("adds 50 bps past 60 months and 75 bps above 100% LTV", () => {
    const base = underwrite(car, prime);
    const d = underwrite({ ...car, termMonths: 72, collateralValueCents: 2000000 }, prime);
    expect(d.tier).toBe(base.tier);
    expect(d.aprBps).toBe(base.aprBps + 125);
  });

  it("declines on payment-to-income with that as the first reason", () => {
    const d = underwrite(car, { ...prime, takeHomeMonthlyCents: 150000, grossMonthlyCents: Math.round(150000 / 0.78), housingMonthlyCents: 30000 });
    expect(d.status).toBe("not_prequalified");
    expect(d.reasons[0].code).toBe("pti");
    expect(d.reasons[0].text).toContain("limit 20%");
  });

  it("declines below a 500 score", () => {
    const d = underwrite(car, { ...prime, score: known(480) });
    expect(d.status).toBe("not_prequalified");
    expect(d.reasons[0].code).toBe("score");
  });

  it("never declines on the model alone", () => {
    const risky = { ...prime, checkingCents: -5000, savingsCents: 0, lateCarPayments: 3 };
    const d = underwrite({ ...car, termMonths: 84 }, risky);
    expect(d.pBad).toBeGreaterThan(0.5);
    expect(d.status).toBe("needs_review");
  });

  it("declines without NaN when there is no income", () => {
    const d = underwrite(car, { ...prime, takeHomeMonthlyCents: 0, grossMonthlyCents: 0, payrollDepositsPerMonth: 0 });
    expect(d.status).toBe("not_prequalified");
    expect(d.ptiPct).toBeNull(); // no income: no ratio, never NaN
    expect(d.dtiPct).toBeNull();
    expect(Number.isFinite(d.maxAmountCents)).toBe(true);
    expect(d.reasons.map((r) => r.code)).toContain("income");
  });

  it("treats an unknown score as near prime with a reason", () => {
    const d = underwrite(car, { ...prime, score: unknown("Not provided") });
    expect(d.scoreTier).toBe("near_prime");
    expect(d.reasons.map((r) => r.code)).toContain("score_unknown");
  });

  it("skips LTV when the car value is unknown", () => {
    const d = underwrite({ ...car, collateralValueCents: null }, prime);
    expect(d.ltvPct).toBeNull();
    expect(d.reasons.map((r) => r.code)).toContain("collateral_unknown");
    expect(d.status).not.toBe("not_prequalified");
  });

  it("computes the max amount from the 20% PTI limit", () => {
    const d = underwrite(car, prime);
    const pay = loanPayment(d.maxAmountCents, d.aprBps, car.termMonths);
    expect(Math.abs(pay - P.maxPti * prime.grossMonthlyCents)).toBeLessThan(100);
  });

  it("marks a refinance worth it only when it beats the current rate after fees", () => {
    const refi: LoanApplication = { purpose: "refinance", vehicleCondition: "used", amountCents: 1400000, termMonths: 30, collateralValueCents: 1900000, replacesPaymentCents: 50000, currentAprBps: 1190, feeCents: 25000 };
    expect(underwrite(refi, prime).worthIt).toBe(true);
    expect(underwrite({ ...refi, currentAprBps: 600 }, prime).worthIt).toBe(false);
  });

  it("orders reasons: failed rules first, at most 4", () => {
    const d = underwrite({ ...car, termMonths: 96 }, { ...prime, score: known(480), takeHomeMonthlyCents: 150000, grossMonthlyCents: Math.round(150000 / 0.78), housingMonthlyCents: 20000 });
    expect(d.reasons.length).toBeLessThanOrEqual(4);
    expect(d.reasons.slice(0, 3).map((r) => r.code).sort()).toEqual(["pti", "score", "term"].sort());
  });
});

describe("reason copy", () => {
  it("never calls a single open loan 'several'", () => {
    const one = { ...prime, loans: [{ ...prime.loans[0], type: "auto", amountCents: 2000000, monthlyPaymentCents: 50000 }] };
    const d = underwrite({ ...car, termMonths: 84 }, { ...one, checkingCents: -5000, savingsCents: 0 });
    const r = d.reasons.find((x) => x.code === "loans");
    if (r) expect(r.text).not.toMatch(/several/i);
  });
});

describe("review fixes", () => {
  it("with no income, cites only the income rule, never an invented 100%", () => {
    const d = underwrite(car, { ...prime, takeHomeMonthlyCents: 0, grossMonthlyCents: 0, payrollDepositsPerMonth: 0 });
    const codes = d.reasons.map((r) => r.code);
    expect(codes).toContain("income");
    expect(codes).not.toContain("pti");
    expect(codes).not.toContain("dti");
    expect(d.ptiPct).toBeNull();
    expect(d.dtiPct).toBeNull();
  });
});
