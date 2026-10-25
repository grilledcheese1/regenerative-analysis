import { describe, expect, it } from "vitest";
import { known, type Persona } from "@/contracts";
import { buildBudget, type BudgetSnapshot } from "@/domain/finance/budget";
import { compareOptions } from "@/domain/recommendations/compare";
import { nessieFixture } from "@/fixtures/banking";
import { CATALOG } from "@/fixtures/catalog";
import { DEMO_AS_OF, persona, PERSONAS } from "@/fixtures/personas";
import { normalizeNessie } from "@/server/providers/nessie-normalize";

const budgetFor = (p: Persona, extraMonthlyCents = 0) =>
  buildBudget(
    normalizeNessie(`fixture_${p.id}`, "fixture", nessieFixture(p.id)!),
    { ...p.profile, manualObligations: extraMonthlyCents ? [{ label: "extra", monthlyCents: extraMonthlyCents }] : [] },
    DEMO_AS_OF,
  );
const run = (id: string, extra = 0) => {
  const p = persona(id)!;
  return compareOptions({ persona: p, budget: budgetFor(p, extra), catalog: CATALOG, asOf: DEMO_AS_OF });
};

describe("equity accounting (spec worked example)", () => {
  // $16,000 car owned outright. Keep: $10,000 operating cash, worth $10,000 at the horizon.
  // Replace: $30,000 all-in cash purchase, sell the old car for $16,000, $7,000 operating
  // cash, worth $22,000. A 40 month horizon makes the monthly figures whole cents.
  const example = (replacementEndValue: number): Persona => ({
    ...persona("devon")!,
    vehicle: { ...persona("devon")!.vehicle, estimatedValueCents: known(1600000) },
    costs: { insuranceMonthlyCents: 25000, maintenanceMonthlyCents: 0 },
    scenario: {
      ...persona("devon")!.scenario,
      horizonMonths: 40,
      gasCentsPerGallon: 0,
      currentVehicleEndValueCents: 1000000,
      candidates: [
        {
          catalogId: "camry_hev_le_2025",
          acquisition: "cash",
          priceCents: 3000000,
          dueAtSigningCents: 0,
          endValueCents: replacementEndValue,
          insuranceMonthlyCents: 17500,
          maintenanceMonthlyCents: 0,
        },
      ],
    },
  });
  const rich: BudgetSnapshot = { ...budgetFor(persona("devon")!), availableUpfrontCashCents: 5000000, vehicleBudgetCents: 100000 };

  it("reconciles to $16,000 keep and $15,000 replace", () => {
    const c = compareOptions({ persona: example(2200000), budget: rich, catalog: CATALOG, asOf: DEMO_AS_OF });
    const keep = c.options.find((o) => o.kind === "keep")!;
    const replace = c.options.find((o) => o.kind === "sell_replace")!;
    expect(keep.netCashOutflowCents).toBe(1000000);
    expect(keep.economicCostCents).toBe(1600000);
    expect(replace.netCashOutflowCents).toBe(2100000);
    expect(replace.startingEquityCents).toBe(1600000);
    expect(replace.endingEquityCents).toBe(2200000);
    expect(replace.economicCostCents).toBe(1500000);
  });

  it("a $20,000 ending value makes replacement cost $17,000 and keeping cheaper", () => {
    const c = compareOptions({ persona: example(2000000), budget: rich, catalog: CATALOG, asOf: DEMO_AS_OF });
    expect(c.options.find((o) => o.kind === "sell_replace")!.economicCostCents).toBe(1700000);
    expect(c.recommendation.selectedOptionId).toBe("keep");
  });

  it("the cash replacement is excluded when it exceeds available cash", () => {
    const tight = { ...rich, availableUpfrontCashCents: 500000 };
    const c = compareOptions({ persona: example(2200000), budget: tight, catalog: CATALOG, asOf: DEMO_AS_OF });
    const replace = c.options.find((o) => o.kind === "sell_replace")!;
    expect(replace.feasible).toBe(false);
    expect(replace.exclusions[0]).toMatch(/upfront/);
  });
});

describe("demo personas", () => {
  it("Maria: buyout leads but needs a quote, so the next action is a buyout quote", () => {
    const c = run("maria");
    expect(c.recommendation.status).toBe("needs_information");
    expect(c.recommendation.selectedOptionId).toBe("buyout_finance");
    expect(c.recommendation.nextAction).toBe("request_buyout_quote");
    expect(c.preparation?.months).toBe(4);
    expect(c.evidence.find((e) => e.id === "mileage_overage")?.display).toMatch(/\$315/);
  });

  it("Maria: the mileage charge applies to return options, not the buyout", () => {
    const c = run("maria");
    const buyout = c.options.find((o) => o.kind === "buyout")!;
    const lease = c.options.find((o) => o.kind === "lease_new")!;
    expect(buyout.upfrontCashCents).toBe(0);
    expect(lease.upfrontCashCents).toBe(31500 + 35000 + 150000);
  });

  it("Maria: a new $300/mo expense changes feasibility and the next action", () => {
    const before = run("maria");
    const after = run("maria", 30000);
    expect(after.options.filter((o) => o.feasible).length).toBeLessThan(before.options.filter((o) => o.feasible).length);
    expect(after.recommendation.nextAction).not.toBe(before.recommendation.nextAction);
  });

  it("Devon: keeping the paid-off car is the preferred result", () => {
    const c = run("devon");
    expect(c.recommendation.selectedOptionId).toBe("keep");
    expect(c.recommendation.nextAction).toBe("keep_current_plan");
  });

  it("Kai: no option satisfies the constraints", () => {
    const c = run("kai");
    expect(c.options.every((o) => !o.feasible)).toBe(true);
    expect(c.recommendation.status).toBe("no_feasible_option");
    expect(c.recommendation.selectedOptionId).toBeNull();
  });

  it("refinancing lowers Kai's payment but leaves more debt at the horizon", () => {
    const c = run("kai");
    const keep = c.options.find((o) => o.kind === "keep")!;
    const refi = c.options.find((o) => o.kind === "refinance")!;
    expect(refi.monthlyPaymentCents).toBeLessThan(keep.monthlyPaymentCents);
    expect(refi.endingDebtCents).toBeGreaterThan(keep.endingDebtCents);
  });

  it("every option satisfies economic cost = net cash + starting equity − ending equity", () => {
    for (const p of PERSONAS) {
      for (const o of run(p.id).options) {
        expect(o.economicCostCents).toBe(o.netCashOutflowCents + o.startingEquityCents - o.endingEquityCents);
        expect(o.endingEquityCents).toBe(o.endingValueCents - o.endingDebtCents);
      }
    }
  });
});
