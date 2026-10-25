import { describe, expect, it } from "vitest";
import type { OptionResult, Persona } from "@/contracts";
import { pickTerm } from "@/domain/finance/lease-terms";
import { rankWithTieBreak } from "@/domain/recommendations/rank";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (p: Persona, extra = 0) =>
  runScenario(p, fixtureSnapshot(p.id)!, { gasCentsPerGallon: 300, monthlyMiles: p.usage.monthlyMiles, extraMonthlySpendingCents: extra, incomeConfirmed: true }).comparison;
const maria = persona("maria")!;

describe("lease terms in the comparison", () => {
  it("offers Maria four terms and picks the cheapest feasible one", () => {
    const lease = run(maria).options.find((o) => o.kind === "lease_new")!;
    expect(lease.lease!.terms.map((t) => t.termMonths)).toEqual([12, 24, 36, 48]);
    const chosen = pickTerm(lease.lease!.terms);
    expect(lease.lease!.chosenTermMonths).toBe(chosen.termMonths);
    expect(lease.avgMonthlyCostCents).toBe(chosen.avgMonthlyCostCents);
  });

  it("ranks everything else by economic cost per horizon month", () => {
    for (const o of run(maria).options.filter((x) => x.kind !== "lease_new")) expect(o.avgMonthlyCostCents).toBe(Math.round(o.economicCostCents / 36));
  });

  it("leaves Devon's and Kai's results alone", () => {
    const devon = run(persona("devon")!);
    expect(devon.recommendation.headline).toBe("Keep the 2016 Corolla");
    expect(devon.recommendation.selectedOptionId).toBe("keep");
    const kai = run(persona("kai")!);
    expect(kai.recommendation.headline).toBe("No option fits these constraints");
  });

  it("still shows a car whose every term is unaffordable, excluded with the reason", () => {
    const lease = run(maria, 10_000_000).options.find((o) => o.kind === "lease_new")!;
    expect(lease.feasible).toBe(false);
    expect(lease.exclusions.length).toBeGreaterThan(0);
    expect(lease.lease!.terms.every((t) => !t.feasible)).toBe(true);
  });

  it("turns a generated person's single-term lease into a one-term table", () => {
    const lease = run(persona("user-004")!).options.find((o) => o.kind === "lease_new");
    expect(lease?.lease?.terms).toHaveLength(1);
  });

  it("attaches NHTSA reliability to every option with a car", () => {
    for (const o of run(maria).options.filter((x) => x.catalogId)) expect(o.reliability?.catalogId).toBe(o.catalogId);
  });

  it("notes the warranty when the picked term runs past 36 months", () => {
    const only48: Persona = {
      ...maria,
      scenario: {
        ...maria.scenario,
        candidates: maria.scenario.candidates.map((c) => (c.acquisition === "lease" ? { ...c, leaseTerms: c.leaseTerms!.filter((t) => t.termMonths === 48) } : c)),
      },
    };
    const lease = run(only48).options.find((o) => o.kind === "lease_new")!;
    expect(lease.warranty).toBe("Repairs after 3 years or 36,000 miles aren't covered by Toyota's basic warranty.");
  });
});

describe("reliability tie-break", () => {
  const opt = (id: string, avg: number, catalogId: string, complaints: number): OptionResult =>
    ({ optionId: id, feasible: true, avgMonthlyCostCents: avg, totalMonthlyCents: avg, upfrontCashCents: 0, catalogId, reliability: { catalogId, recalls: 0, complaints, retrievedAt: "2026-10-25", source: "observed" } }) as unknown as OptionResult;

  it("lets a more reliable car within $25/mo rank first", () => {
    const { ranked, tieBreak } = rankWithTieBreak([opt("a", 50000, "x", 300), opt("b", 52000, "y", 30)], "minimize_cost");
    expect(ranked[0].optionId).toBe("b");
    expect(tieBreak).toEqual({ winner: "b", loser: "a" });
  });

  it("doesn't override a gap larger than $25/mo", () => {
    const { ranked, tieBreak } = rankWithTieBreak([opt("a", 50000, "x", 300), opt("b", 53000, "y", 30)], "minimize_cost");
    expect(ranked[0].optionId).toBe("a");
    expect(tieBreak).toBeNull();
  });
});

describe("lease underwriting", () => {
  it("pre-qualifies Maria's lease on its own payment", () => {
    const lease = run(maria).options.find((o) => o.kind === "lease_new")!;
    expect(lease.credit?.reasons.map((r) => r.code)).not.toContain("dti");
    expect(lease.credit?.paymentCents).toBe(lease.monthlyPaymentCents);
  });
});
