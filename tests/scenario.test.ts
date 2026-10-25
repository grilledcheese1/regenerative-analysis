import { describe, expect, it } from "vitest";
import type { ScenarioInputs } from "@/contracts";
import { creditProfile } from "@/domain/credit/profile";
import { buildBudget } from "@/domain/finance/budget";
import { compareOptions } from "@/domain/recommendations/compare";
import { runScenario } from "@/domain/recommendations/scenario";
import { CATALOG, catalogVehicle } from "@/fixtures/catalog";
import { DEMO_AS_OF, PERSONAS } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const scenarioFor = (p: (typeof PERSONAS)[number], extra = 0): ScenarioInputs => ({
  gasCentsPerGallon: p.scenario.gasCentsPerGallon,
  monthlyMiles: p.usage.monthlyMiles,
  extraMonthlySpendingCents: extra,
  incomeConfirmed: false,
});

describe("runScenario", () => {
  for (const p of PERSONAS) {
    for (const extra of [0, 30_000]) {
      it(`${p.id} (+${extra / 100}/mo) matches the screens' two-step calculation`, () => {
        const bank = fixtureSnapshot(p.id)!;
        // The computation NextMoveApp did before runScenario existed.
        const manual = extra ? [{ label: "New monthly expense", monthlyCents: extra }] : [];
        const budget = buildBudget(bank, { ...p.profile, manualObligations: [...p.profile.manualObligations, ...manual] }, DEMO_AS_OF);
        const comparison = compareOptions({
          persona: p,
          budget,
          catalog: CATALOG,
          asOf: DEMO_AS_OF,
          overrides: { gasCentsPerGallon: p.scenario.gasCentsPerGallon, monthlyMiles: p.usage.monthlyMiles },
          credit: creditProfile(bank, budget, "synthetic"),
        });

        const out = runScenario(p, bank, scenarioFor(p, extra));
        expect(out.budget).toEqual(budget);
        expect(out.comparison).toEqual(comparison);
      });
    }
  }
});

describe("usage overrides from imported drives", () => {
  const maria = PERSONAS.find((p) => p.id === "maria")!;
  const bank = fixtureSnapshot("maria")!;
  const keep = (cityShare?: number) =>
    runScenario(maria, bank, { ...scenarioFor(maria), cityShare }).comparison.options[0];

  it("moves fuel cost in the direction the city/highway ratings imply", () => {
    const v = catalogVehicle(maria.vehicle.catalogId);
    const allCity = keep(1).monthlyRunningCents;
    const allHighway = keep(0).monthlyRunningCents;
    if (v.cityMpg < v.highwayMpg) expect(allCity).toBeGreaterThan(allHighway);
    else if (v.cityMpg > v.highwayMpg) expect(allCity).toBeLessThan(allHighway);
    else expect(allCity).toBe(allHighway);
  });

  it("reports the city share and the usage source as evidence", () => {
    const c = runScenario(maria, bank, { ...scenarioFor(maria), cityShare: 0.62, usageSource: "user_reported" }).comparison;
    expect(c.evidence.find((e) => e.id === "city_share")).toMatchObject({ display: "62% city", source: "modeled" });
    expect(c.evidence.find((e) => e.id === "monthly_miles")?.source).toBe("user_reported");
  });

  it("without overrides, uses the persona's own city share and source", () => {
    const c = runScenario(maria, bank, scenarioFor(maria)).comparison;
    expect(c.evidence.find((e) => e.id === "city_share")).toMatchObject({
      display: `${Math.round(maria.usage.cityShare * 100)}% city`,
      source: maria.usage.source,
    });
  });
});
