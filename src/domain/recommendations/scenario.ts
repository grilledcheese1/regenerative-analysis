import type { BankingSnapshot, CatalogVehicle, Comparison, Persona, ScenarioInputs } from "@/contracts";
import { creditProfile } from "@/domain/credit/profile";
import { buildBudget, type BudgetSnapshot } from "@/domain/finance/budget";
import { CATALOG } from "@/fixtures/catalog";
import { DEMO_AS_OF } from "@/fixtures/personas";
import { compareOptions } from "./compare";

/**
 * Budget plus comparison for one persona, banking snapshot and scenario. The screens and the
 * server both call this, so every figure reconciles across them.
 */
export function runScenario(
  persona: Persona,
  bank: BankingSnapshot,
  s: ScenarioInputs,
  asOf: string = DEMO_AS_OF,
  catalog: CatalogVehicle[] = CATALOG,
): { budget: BudgetSnapshot; comparison: Comparison } {
  const extra = s.extraMonthlySpendingCents
    ? [{ label: "New monthly expense", monthlyCents: s.extraMonthlySpendingCents }]
    : [];
  const budget = buildBudget(
    bank,
    { ...persona.profile, manualObligations: [...persona.profile.manualObligations, ...extra] },
    asOf,
  );
  const credit = creditProfile(bank, budget, persona.id.startsWith("u_") ? "user_reported" : "synthetic");
  const comparison = compareOptions({
    persona,
    budget,
    credit,
    catalog,
    asOf,
    overrides: {
      gasCentsPerGallon: s.gasCentsPerGallon,
      monthlyMiles: s.monthlyMiles,
      cityShare: s.cityShare,
      usageSource: s.usageSource,
    },
  });
  return { budget, comparison };
}
