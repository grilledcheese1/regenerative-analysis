import { describe, expect, it } from "vitest";
import { tierForScore } from "@/domain/credit/config";
import { PEOPLE } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

describe("case-study credit profiles", () => {
  const scores = PEOPLE.map((p) => ({ p, loans: fixtureSnapshot(p.id)!.loans ?? [] }));

  it("gives every case study a scored loan record that matches their contract", () => {
    for (const { p, loans } of scores) {
      expect(loans.length, p.id).toBeGreaterThan(0);
      expect(loans[0].creditScore, p.id).toBeGreaterThanOrEqual(300);
      const want = p.contract.type === "loan" ? "auto" : p.contract.type === "lease" ? "auto lease" : "credit file";
      expect(loans[0].type, p.id).toBe(want);
    }
  });

  it("spreads the generated people across at least 4 of the 5 tiers", () => {
    const tiers = new Set(scores.filter(({ p }) => p.id.startsWith("user-")).map(({ loans }) => tierForScore(loans[0].creditScore)));
    expect(tiers.size).toBeGreaterThanOrEqual(4);
  });
});
