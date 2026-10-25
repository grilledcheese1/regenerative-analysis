import { describe, expect, it } from "vitest";
import { runScenario } from "@/domain/recommendations/scenario";
import { CATALOG } from "@/fixtures/catalog";
import { nessieFixture } from "@/fixtures/banking";
import { GENERATED_PEOPLE, PEOPLE, PERSONAS, persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (id: string, over: Partial<{ gasCentsPerGallon: number; monthlyMiles: number; extraMonthlySpendingCents: number }> = {}) => {
  const p = persona(id)!;
  return runScenario(p, fixtureSnapshot(id)!, { gasCentsPerGallon: p.scenario.gasCentsPerGallon, monthlyMiles: p.usage.monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed: false, ...over });
};

describe("the 29 people you can sign in as", () => {
  it("are the 3 curated personas plus 26 generated ones, with unique ids, and only the curated ones are seeded to Nessie", () => {
    expect(PEOPLE).toHaveLength(29);
    expect(GENERATED_PEOPLE).toHaveLength(26);
    expect(new Set(PEOPLE.map((p) => p.id)).size).toBe(29);
    expect(PERSONAS.map((p) => p.id)).toEqual(["maria", "devon", "kai"]);
    expect(persona("user-004")?.profile.displayName).toBeTruthy();
    expect(persona("maria")).toBe(PERSONAS[0]);
  });

  it("only use catalog vehicles, and mark every invented input as synthetic", () => {
    const ids = new Set(CATALOG.map((c) => c.catalogId));
    for (const p of GENERATED_PEOPLE) {
      expect(ids.has(p.vehicle.catalogId), p.id).toBe(true);
      for (const c of p.scenario.candidates) expect(ids.has(c.catalogId), `${p.id} candidate`).toBe(true);
      expect(p.vehicle.valuationSource, p.id).toBe("synthetic");
      expect(p.usage.source, p.id).toBe("synthetic");
      expect(p.situation, p.id).toMatch(/Illustrative/);
    }
  });

  it("each have a bank history that loads", () => {
    for (const p of PEOPLE) {
      expect(nessieFixture(p.id), p.id).not.toBeNull();
      const snap = fixtureSnapshot(p.id)!;
      expect(snap.accounts, p.id).toHaveLength(3);
      expect(snap.transactions.length, p.id).toBeGreaterThan(30);
    }
  });

  it("each run through the same engine without errors, and every number is finite", () => {
    for (const p of PEOPLE) {
      const { budget, comparison } = run(p.id);
      expect(Number.isFinite(budget.vehicleBudgetCents), p.id).toBe(true);
      expect(budget.recurringIncomeCents, p.id).toBeGreaterThan(0);
      expect(comparison.options.length, p.id).toBeGreaterThan(1);
      for (const o of comparison.options) {
        for (const v of [o.upfrontCashCents, o.totalMonthlyCents, o.economicCostCents]) expect(Number.isFinite(v), `${p.id} ${o.optionId}`).toBe(true);
      }
    }
  });

  it("do not all get the same answer, and some are told there is no feasible option", () => {
    const results = PEOPLE.map((p) => ({ id: p.id, ...run(p.id).comparison.recommendation }));
    const actions = new Set(results.map((r) => r.nextAction));
    const statuses = new Set(results.map((r) => r.status));
    expect(actions.size, [...actions].join(", ")).toBeGreaterThanOrEqual(3);
    expect(statuses.has("recommended")).toBe(true);
    expect(statuses.has("no_feasible_option") || statuses.has("needs_information")).toBe(true);
    const leaders = new Set(results.map((r) => r.selectedOptionId?.split("_")[0]).filter(Boolean));
    expect(leaders.size).toBeGreaterThanOrEqual(2);
  });

  it("change their result when a new monthly bill appears in their budget", () => {
    let changed = 0;
    for (const p of PEOPLE) {
      const a = run(p.id).comparison;
      const b = run(p.id, { extraMonthlySpendingCents: 60000 }).comparison;
      expect(b.options.length).toBe(a.options.length);
      if (a.recommendation.selectedOptionId !== b.recommendation.selectedOptionId || a.recommendation.status !== b.recommendation.status) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe("peer rank", () => {
  it("is truthful: the percentage is the share of others beaten, so a low score reads low", async () => {
    const { peerRank } = await import("@/lib/peers");
    const ranks = PEOPLE.map((p) => ({ id: p.id, ...peerRank(p.id) }));
    for (const r of ranks) {
      expect(r.n).toBe(PEOPLE.length - 1);
      expect(r.betterThanPct).toBeGreaterThanOrEqual(0);
      expect(r.betterThanPct).toBeLessThanOrEqual(100);
    }
    const lowest = ranks.reduce((a, b) => (a.score <= b.score ? a : b));
    const highest = ranks.reduce((a, b) => (a.score >= b.score ? a : b));
    expect(lowest.betterThanPct).toBeLessThan(50);
    expect(highest.betterThanPct).toBeGreaterThan(50);
  });
});
