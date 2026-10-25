import { describe, expect, it } from "vitest";
import type { Comparison, OptionResult } from "@/contracts";
import { recommend } from "@/domain/recommendations/recommend";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (id: string) => {
  const p = persona(id)!;
  return runScenario(p, fixtureSnapshot(id)!, { gasCentsPerGallon: 300, monthlyMiles: p.usage.monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed: true });
};

describe("recommendation copy", () => {
  it("states the leader's average monthly cost and its period", () => {
    const { comparison } = run("maria");
    expect(comparison.recommendation.explanation[0]).toMatch(/lowest average monthly cost: \$[\d,]+\/mo over 36 months/);
  });

  it("explains the picked lease term against the next cheapest term", () => {
    const { comparison } = run("jordan");
    const lines = comparison.recommendation.explanation.join("\n");
    expect(lines).toMatch(/\d+-month term: \$[\d,]+\/mo on average; \d+ months would cost \$[\d,]+ more a month/);
  });

  it("says how much switching saves against continuing the lease", () => {
    const lines = run("jordan").comparison.recommendation.explanation.join("\n");
    expect(lines).toMatch(/\$[\d,]+\/mo less than continuing the lease/);
  });

  it("adds the warranty note when the leader has one", () => {
    const { comparison } = run("jordan");
    const top = comparison.options.find((o) => o.optionId === comparison.recommendation.selectedOptionId)!;
    if (top.warranty) expect(comparison.recommendation.explanation).toContain(top.warranty);
  });

  it("names the complaint counts when reliability broke a near tie", () => {
    const { comparison, budget } = run("maria");
    const [a, b] = comparison.options.filter((o) => o.feasible && o.reliability);
    const tied: OptionResult[] = comparison.options.map((o) =>
      o.optionId === a.optionId ? { ...o, avgMonthlyCostCents: 50000, reliability: { ...o.reliability!, complaints: 300 } }
      : o.optionId === b.optionId ? { ...o, avgMonthlyCostCents: 51000, reliability: { ...o.reliability!, complaints: 20 } }
      : { ...o, feasible: false },
    );
    const c: Omit<Comparison, "recommendation"> = { ...comparison, options: tied };
    const r = recommend(c, persona("maria")!, budget);
    expect(r.selectedOptionId).toBe(b.optionId);
    expect(r.explanation.join("\n")).toMatch(/NHTSA lists 20 owner complaints .* against 300/);
  });
});
