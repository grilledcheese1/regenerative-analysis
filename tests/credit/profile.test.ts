import { describe, expect, it } from "vitest";
import { creditProfile } from "@/domain/credit/profile";
import { buildBudget } from "@/domain/finance/budget";
import { DEMO_AS_OF, persona } from "@/fixtures/personas";
import { fixtureSnapshot } from "@/server/providers/nessie";

const profileFor = (id: string) => {
  const bank = fixtureSnapshot(id)!;
  return creditProfile(bank, buildBudget(bank, persona(id)!.profile, DEMO_AS_OF), "synthetic");
};

describe("creditProfile", () => {
  it("reads Kai's score and loan from Nessie and his history from the bank", () => {
    const p = profileFor("kai");
    expect(p.score).toEqual({ known: true, value: 618 });
    expect(p.otherDebtMonthlyCents).toBe(58200);
    expect(p.onTimeCarPayments).toBeGreaterThanOrEqual(3);
    expect(p.lateCarPayments).toBe(0);
    expect(p.payrollDepositsPerMonth).toBe(2);
    expect(p.grossMonthlyCents).toBe(Math.round(p.takeHomeMonthlyCents / 0.78));
    expect(p.housingMonthlyCents).toBeGreaterThan(0);
  });

  it("treats a 0 score as not provided and missing loans as none", () => {
    const bank = { ...fixtureSnapshot("devon")!, loans: undefined };
    const p = creditProfile(bank, buildBudget(bank, persona("devon")!.profile, DEMO_AS_OF), "synthetic");
    expect(p.score.known).toBe(false);
    expect(p.loans).toEqual([]);
  });
});

describe("late payments", () => {
  it("doesn't count a pending car payment as late", () => {
    const bank = fixtureSnapshot("kai")!;
    const withPending = {
      ...bank,
      transactions: bank.transactions.map((t, i) => (t.category === "vehicle_payment" && i === bank.transactions.findIndex((x) => x.category === "vehicle_payment") ? { ...t, status: "pending" as const } : t)),
    };
    const p = creditProfile(withPending, buildBudget(withPending, persona("kai")!.profile, DEMO_AS_OF), "synthetic");
    expect(p.lateCarPayments).toBe(0);
  });
});
