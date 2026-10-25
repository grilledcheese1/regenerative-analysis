import { describe, expect, it } from "vitest";
import { TIER_APR_BPS } from "@/domain/credit/config";
import { buildBudget } from "@/domain/finance/budget";
import { compareOptions } from "@/domain/recommendations/compare";
import { runScenario } from "@/domain/recommendations/scenario";
import { CATALOG } from "@/fixtures/catalog";
import { DEMO_AS_OF, PEOPLE, persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (id: string) => {
  const p = persona(id)!;
  return runScenario(p, fixtureSnapshot(id)!, { gasCentsPerGallon: 300, monthlyMiles: p.usage.monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed: true }).comparison;
};

describe("personal rates in the comparison", () => {
  it("prices Kai's refinance from his own credit, not the synthetic 8.40%", () => {
    const c = run("kai");
    const refi = c.options.find((o) => o.kind === "refinance")!;
    expect(refi.credit).toBeDefined();
    expect(refi.credit!.aprBps).not.toBe(840);
    expect(c.prequalification.refinance).toEqual(refi.credit);
  });

  it("underwrites Maria's buyout as a used-car loan", () => {
    const buyout = run("maria").options.find((o) => o.kind === "buyout")!;
    expect(buyout.credit!.aprBps).toBeGreaterThanOrEqual(TIER_APR_BPS[buyout.credit!.tier].used);
  });

  it("gives a lease holder no refinance", () => {
    const c = run("maria");
    expect(c.prequalification.refinance).toBeNull();
    expect(c.prequalification.finance).not.toBeNull();
  });

  it("excludes financing for someone below a 500 score, with the reason", () => {
    const low = PEOPLE.find((p) => (fixtureSnapshot(p.id)!.loans ?? [])[0]?.creditScore < 500 && p.scenario.candidates.some((c) => c.acquisition === "finance"))!;
    const financed = run(low.id).options.filter((o) => o.credit && o.kind !== "refinance");
    expect(financed.length).toBeGreaterThan(0);
    for (const o of financed) {
      expect(o.feasible).toBe(false);
      expect(o.exclusions[0]).toMatch(/^Not pre-qualified: Credit score \d+ is below 500/);
    }
  });

  it("adds the credit score and estimated gross income to the evidence", () => {
    const ids = run("kai").evidence.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["credit_score", "estimated_gross_income"]));
  });

  it("without a credit profile, behaves as before", () => {
    const p = persona("devon")!;
    const c = compareOptions({ persona: p, budget: buildBudget(fixtureSnapshot("devon")!, p.profile, DEMO_AS_OF), catalog: CATALOG, asOf: DEMO_AS_OF });
    expect(c.options.every((o) => o.credit === undefined)).toBe(true);
    expect(c.prequalification).toEqual({ finance: null, refinance: null });
  });
});
