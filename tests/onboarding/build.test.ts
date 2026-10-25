import { describe, expect, it } from "vitest";
import type { OnboardingAnswers } from "@/contracts";
import { bankingSpecFromAnswers } from "@/domain/onboarding/banking";
import { simulatedToyotaPolicy } from "@/domain/onboarding/insurance";
import { buildUserPersona } from "@/domain/onboarding/persona";
import { validateAnswers } from "@/domain/onboarding/validate";
import { runScenario } from "@/domain/recommendations/scenario";
import { nessieBundlesFromSpec } from "@/fixtures/banking";
import { normalizeNessie } from "@/server/providers/nessie-normalize";

const base: OnboardingAnswers = {
  name: "Felix",
  car: { catalogId: "rav4_awd_2021", odometerMiles: 61200, estimatedValueCents: 1900000 },
  contract: { type: "loan", payoffCents: 1400000, aprBps: 790, paymentCents: 45500, remainingMonths: 30 },
  money: {
    takeHomeMonthlyCents: 480000,
    housingCents: 150000,
    utilitiesCents: 12000,
    groceriesCents: 45000,
    diningShoppingCents: 35000,
    subscriptionsCents: 4000,
    checkingCents: 320000,
    savingsCents: 600000,
    cardBalanceCents: 25000,
  },
  driving: { monthlyMiles: 900, cityShare: 0.6, source: "user_reported" },
  insurance: { monthlyCents: 16500, source: "user_reported", policy: null },
  goals: { monthlySavingsGoalCents: 30000, monthlyBufferCents: 15000, protectedCashReserveCents: 300000, objective: "minimize_cost" },
};
const lease: Extract<OnboardingAnswers["contract"], { type: "lease" }> = {
  type: "lease",
  maturityDate: "2027-03-15",
  paymentCents: 42000,
  totalAllowedMiles: 36000,
  excessCentsPerMile: 15,
  purchaseOptionCents: 2100000,
  dispositionFeeCents: 35000,
};
const scenario = { gasCentsPerGallon: 300, monthlyMiles: 900, extraMonthlySpendingCents: 0, incomeConfirmed: true };

const run = (a: OnboardingAnswers) => {
  const p = buildUserPersona("acct_0123456789abcdef", a);
  const bank = normalizeNessie(`fixture_${p.id}`, "fixture", nessieBundlesFromSpec(p.id, bankingSpecFromAnswers(a, p)));
  return { p, ...runScenario(p, bank, scenario) };
};

describe("buildUserPersona", () => {
  it("builds a persona the comparison engine accepts", () => {
    const { p, budget, comparison } = run(base);
    expect(p.id).toBe("u_acct_0123456789abcdef");
    expect(p.summary).toBe("Felix · 2021 RAV4 AWD, loan, 30 payments left");
    expect(p.usage.routeId).toBe("mixed");
    expect(budget.recurringIncomeCents).toBe(480000);
    expect(comparison.options.length).toBeGreaterThan(0);
  });

  it("goes negative, not NaN, when spending exceeds income", () => {
    const { budget, comparison } = run({ ...base, money: { ...base.money, housingCents: 600000 } });
    expect(budget.vehicleBudgetCents).toBeLessThan(0);
    expect(Number.isFinite(budget.vehicleBudgetCents)).toBe(true);
    expect(comparison.recommendation.status).toBe("no_feasible_option");
  });

  it("handles an unknown car value", () => {
    const { p, comparison } = run({ ...base, car: { ...base.car, estimatedValueCents: null }, contract: { type: "owned" } });
    expect(p.vehicle.estimatedValueCents.known).toBe(false);
    expect(comparison.notConsidered.map((n) => n.label)).toContain("Sell and replace");
  });

  it("builds lease and owned summaries", () => {
    expect(buildUserPersona("acct_1", { ...base, contract: lease }).summary).toBe("Felix · 2021 RAV4 AWD, lease ending Mar 2027");
    expect(buildUserPersona("acct_1", { ...base, contract: { type: "owned" } }).summary).toBe("Felix · 2021 RAV4 AWD, paid off");
  });

  it("picks the drive route from the city share", () => {
    expect(buildUserPersona("acct_1", { ...base, driving: { ...base.driving, cityShare: 0.7 } }).usage.routeId).toBe("downtown");
    expect(buildUserPersona("acct_1", { ...base, driving: { ...base.driving, cityShare: 0.3 } }).usage.routeId).toBe("hills");
  });
});

describe("bankingSpecFromAnswers", () => {
  it("records the car payment, fuel and insurance as vehicle spending", () => {
    const { budget } = run(base);
    expect(budget.observedVehicleMonthlyCents.vehicle_payment).toBe(45500);
    expect(budget.observedVehicleMonthlyCents.vehicle_insurance).toBe(16500);
    expect(budget.observedVehicleMonthlyCents.vehicle_fuel).toBeGreaterThan(0);
  });
});

describe("simulatedToyotaPolicy", () => {
  it("prices the simulated policy deterministically", () => {
    const a = simulatedToyotaPolicy("rav4_awd_2021", 2021, 61200);
    expect(a).toEqual(simulatedToyotaPolicy("rav4_awd_2021", 2021, 61200));
    expect(a.provider).toBe("Toyota Insurance (simulated)");
    expect(a.monthlyCents).toBe(15500);
    expect(a.policyNumber).toMatch(/^SIM-\d{6}$/);
  });
});

describe("validateAnswers", () => {
  it("rejects a lease maturity in the past", () => {
    expect(validateAnswers({ contract: { ...lease, maturityDate: "2026-01-01" } })["contract.maturityDate"]).toBe("Pick a date between today and 4 years from now");
  });
  it("accepts complete answers", () => {
    expect(validateAnswers(base)).toEqual({});
  });
  it("rejects out-of-range driving", () => {
    expect(validateAnswers({ driving: { monthlyMiles: -5, cityShare: 1.2, source: "user_reported" } })).toMatchObject({
      "driving.monthlyMiles": expect.any(String),
      "driving.cityShare": expect.any(String),
    });
  });
});
