import type { OnboardingAnswers } from "@/contracts";
import { CATALOG } from "@/fixtures/catalog";
import { DEMO_AS_OF } from "@/fixtures/personas";

type Errors = Record<string, string>;
const MONEY_MAX = 100_000_000; // $1M

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Field path → message for whatever parts of the answers are present. Empty when valid. */
export function validateAnswers(a: Partial<OnboardingAnswers>, asOf = DEMO_AS_OF): Errors {
  const e: Errors = {};
  const money = (path: string, v: number | null | undefined, optional = false) => {
    if (v === null && optional) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MONEY_MAX) e[path] = "Enter an amount between $0 and $1,000,000";
  };

  if (a.name !== undefined && !a.name.trim()) e.name = "Enter your name";
  if (a.car) {
    if (!CATALOG.some((c) => c.catalogId === a.car!.catalogId)) e["car.catalogId"] = "Pick your car";
    if (!(a.car.odometerMiles >= 0 && a.car.odometerMiles <= 500_000)) e["car.odometerMiles"] = "Enter miles between 0 and 500,000";
    money("car.estimatedValueCents", a.car.estimatedValueCents, true);
  }
  const c = a.contract;
  if (c?.type === "loan") {
    money("contract.payoffCents", c.payoffCents);
    money("contract.paymentCents", c.paymentCents);
    if (!(c.aprBps >= 0 && c.aprBps <= 3000)) e["contract.aprBps"] = "Enter an APR between 0% and 30%";
    if (!(Number.isInteger(c.remainingMonths) && c.remainingMonths >= 1 && c.remainingMonths <= 96)) e["contract.remainingMonths"] = "Enter between 1 and 96 payments";
  } else if (c?.type === "lease") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.maturityDate) || c.maturityDate <= asOf || c.maturityDate > addMonths(asOf, 48)) {
      e["contract.maturityDate"] = "Pick a date between today and 4 years from now";
    }
    money("contract.paymentCents", c.paymentCents);
    if (!(c.totalAllowedMiles > 0 && c.totalAllowedMiles <= 200_000)) e["contract.totalAllowedMiles"] = "Enter the miles your lease allows";
    if (!(c.excessCentsPerMile >= 0 && c.excessCentsPerMile <= 100)) e["contract.excessCentsPerMile"] = "Enter between 0¢ and 100¢ per mile";
    money("contract.purchaseOptionCents", c.purchaseOptionCents, true);
    money("contract.dispositionFeeCents", c.dispositionFeeCents, true);
  }
  if (a.money) for (const [k, v] of Object.entries(a.money)) money(`money.${k}`, v);
  if (a.driving) {
    if (!(a.driving.monthlyMiles >= 0 && a.driving.monthlyMiles <= 10_000)) e["driving.monthlyMiles"] = "Enter between 0 and 10,000 miles a month";
    if (!(a.driving.cityShare >= 0 && a.driving.cityShare <= 1)) e["driving.cityShare"] = "City share must be between 0% and 100%";
  }
  if (a.insurance) money("insurance.monthlyCents", a.insurance.monthlyCents);
  if (a.goals) {
    money("goals.monthlySavingsGoalCents", a.goals.monthlySavingsGoalCents);
    money("goals.monthlyBufferCents", a.goals.monthlyBufferCents);
    money("goals.protectedCashReserveCents", a.goals.protectedCashReserveCents);
  }
  return e;
}
