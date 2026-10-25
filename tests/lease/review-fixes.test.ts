import { describe, expect, it } from "vitest";
import type { Comparison, OptionResult, Persona } from "@/contracts";
import { reliabilityFor } from "@/domain/reliability";
import { recommend } from "@/domain/recommendations/recommend";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const run = (p: Persona, miles = p.usage.monthlyMiles) =>
  runScenario(p, fixtureSnapshot(p.id === "jordan" ? "jordan" : p.id)!, { gasCentsPerGallon: 300, monthlyMiles: miles, extraMonthlySpendingCents: 0, incomeConfirmed: true });
const jordan = persona("jordan")!;

describe("review fixes", () => {
  it("sensitivity keeps 'continue the lease' at its real average", () => {
    const cheaper: Persona = { ...jordan, contract: { ...(jordan.contract as Extract<Persona["contract"], { type: "lease" }>), paymentCents: 50000 } };
    for (const miles of [200, 1050]) {
      const { comparison } = run(cheaper, miles);
      for (const s of comparison.sensitivity) expect(s.detail).not.toMatch(/^Continue the lease/);
    }
  });

  it("doesn't record a missed NHTSA lookup as a clean record", () => {
    const camry25 = reliabilityFor("camry_hev_le_2025");
    expect(camry25.complaints === null || camry25.complaints > 0).toBe(true);
  });

  it("keeps lease decisions out of the 'finance your next car' card", () => {
    const { comparison } = run(jordan);
    const leaseDecisions = comparison.options.filter((o) => o.lease).map((o) => o.credit);
    expect(leaseDecisions).not.toContain(comparison.prequalification.finance);
    const financed = comparison.options.find((o) => o.optionId === "switch_finance_rav4_hybrid_awd_2025")!;
    expect(comparison.prequalification.finance).toBe(financed.credit);
  });

  it("quotes recalls when recalls decided the tie", () => {
    const { comparison, budget } = run(persona("maria")!);
    const [a, b] = comparison.options.filter((o) => o.feasible && o.reliability);
    const tied: OptionResult[] = comparison.options.map((o) =>
      o.optionId === a.optionId ? { ...o, avgMonthlyCostCents: 50000, reliability: { ...o.reliability!, complaints: 31, recalls: 4 } }
      : o.optionId === b.optionId ? { ...o, avgMonthlyCostCents: 51000, reliability: { ...o.reliability!, complaints: 31, recalls: 1 } }
      : { ...o, feasible: false },
    );
    const c: Omit<Comparison, "recommendation"> = { ...comparison, options: tied };
    const text = recommend(c, persona("maria")!, budget).explanation.join("\n");
    expect(text).toMatch(/NHTSA lists 1 recall .* against 4/);
  });
});
