import type { OnboardingAnswers, Persona } from "@/contracts";
import { monthlyFuel } from "@/domain/finance/fuel";
import { catalogVehicle } from "@/fixtures/catalog";
import type { BankingSpec } from "@/fixtures/banking";

// Nessie truncates decimals, so every record is whole dollars.
const dollars = (cents: number) => Math.max(0, Math.round(cents / 100));

/**
 * A bank history that matches what the user told us, in the fixture spec format. Descriptions are
 * chosen to hit the categorizer (src/server/providers/nessie-normalize.ts): "auto loan|lease",
 * "gas station", "auto insurance".
 */
export function bankingSpecFromAnswers(a: OnboardingAnswers, persona: Persona): BankingSpec {
  const m = a.money;
  const half = dollars(m.takeHomeMonthlyCents / 2);
  const fuel = monthlyFuel(catalogVehicle(persona.vehicle.catalogId), a.driving.monthlyMiles, a.driving.cityShare, persona.scenario.gasCentsPerGallon);
  const contract = a.contract;
  const keep = <T extends [string, number, number]>(rows: T[]) => rows.filter((r) => r[1] > 0);
  return {
    checking: dollars(m.checkingCents),
    savings: dollars(m.savingsCents),
    cardBalance: dollars(m.cardBalanceCents),
    monthly: {
      income: [half, half],
      bills: keep([
        ["Housing rent", dollars(m.housingCents), 1],
        ["Austin Energy electric", dollars(m.utilitiesCents), 12],
        ...(contract.type === "owned" ? [] : [[contract.type === "lease" ? "Auto lease payment" : "Auto loan payment", dollars(contract.paymentCents), 24] as [string, number, number]]),
        ["Auto insurance premium", dollars(a.insurance.monthlyCents), 5],
      ]),
      purchases: keep([
        ["Grocery market", dollars(m.groceriesCents / 2), 6],
        ["Grocery market", dollars(m.groceriesCents / 2), 20],
        ["Gas station fuel", dollars(fuel.costCents), 10],
      ]),
      card: keep([
        ["Dining and shopping", dollars(m.diningShoppingCents), 9],
        ["Streaming subscriptions", dollars(m.subscriptionsCents), 3],
      ]),
      savingsTransfer: dollars(a.goals.monthlySavingsGoalCents),
    },
  };
}
