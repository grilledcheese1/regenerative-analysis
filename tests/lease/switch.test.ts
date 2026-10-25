import { describe, expect, it } from "vitest";
import type { Persona } from "@/contracts";
import { runScenario } from "@/domain/recommendations/scenario";
import { PERSONAS, persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (p: Persona) =>
  runScenario(p, fixtureSnapshot("jordan")!, { gasCentsPerGallon: 300, monthlyMiles: p.usage.monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed: true }).comparison;

describe("mid-lease switch (Jordan)", () => {
  const jordan = persona("jordan")!;
  const c = run(jordan);

  it("recommends switching now to a lease", () => {
    const top = c.options.find((o) => o.optionId === c.recommendation.selectedOptionId)!;
    expect(top.kind).toBe("switch_now");
    expect(top.lease).toBeDefined();
  });

  it("shows the switch math, with equity of $2,500 and at least $40/mo saved", () => {
    const top = c.options.find((o) => o.optionId === c.recommendation.selectedOptionId)!;
    expect(top.switchMath!.equityCents).toBe(250000);
    expect(top.switchMath!.savingsPerMonthCents).toBeGreaterThanOrEqual(4000);
    expect(top.switchMath!.savingsPerMonthCents).toBe(top.switchMath!.continueAvgMonthlyCents - top.avgMonthlyCostCents);
  });

  it("puts every switch number in the evidence as synthetic", () => {
    const ev = Object.fromEntries(c.evidence.map((e) => [e.id, e]));
    for (const id of ["early_payoff", "trade_in_value"]) expect(ev[id].source).toBe("synthetic");
    expect(ev.trade_in_equity.source).toBe("derived");
    expect(ev.continue_lease_avg).toBeDefined();
  });

  it("offers continuing the lease, averaged over the months left", () => {
    const cont = c.options.find((o) => o.kind === "keep")!;
    expect(cont.label).toMatch(/^Continue the lease to /);
  });

  it("counts negative equity as cash due now, excluded when cash can't cover it", () => {
    const underwater: Persona = { ...jordan, contract: { ...(jordan.contract as Extract<Persona["contract"], { type: "lease" }>), tradeInValueCents: 1740000 } };
    const sw = run(underwater).options.filter((o) => o.kind === "switch_now");
    expect(sw.length).toBeGreaterThan(0);
    for (const o of sw) {
      expect(o.switchMath!.equityCents).toBe(-1000000);
      expect(o.upfrontCashCents).toBeGreaterThanOrEqual(1000000);
      expect(o.feasible).toBe(false);
    }
  });

  it("is a curated case study, seeded to Nessie with the others", () => {
    expect(PERSONAS.map((p) => p.id)).toContain("jordan");
  });
});

describe("lease end (Maria)", () => {
  it("has no switch option without payoff and trade-in values", () => {
    const maria = persona("maria")!;
    const c = runScenario(maria, fixtureSnapshot("maria")!, { gasCentsPerGallon: 300, monthlyMiles: 875, extraMonthlySpendingCents: 0, incomeConfirmed: true }).comparison;
    expect(c.options.some((o) => o.kind === "switch_now")).toBe(false);
  });
});
