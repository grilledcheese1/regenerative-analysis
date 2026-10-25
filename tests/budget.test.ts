import { describe, expect, it } from "vitest";
import type { BankingSnapshot, Transaction } from "@/contracts";
import { buildBudget } from "@/domain/finance/budget";
import { nessieFixture } from "@/fixtures/banking";
import { DEMO_AS_OF, persona } from "@/fixtures/personas";
import { normalizeNessie } from "@/server/providers/nessie-normalize";

const maria = persona("maria")!;
const snapshot = () => normalizeNessie("fixture_maria", "fixture", nessieFixture("maria")!);

describe("budget from Nessie records", () => {
  it("reproduces the spec example: $4,200 − $2,700 − $400 − $200 = $900", () => {
    const b = buildBudget(snapshot(), maria.profile, DEMO_AS_OF);
    expect(b.window).toEqual({ start: "2026-07-01", end: "2026-10-01", months: 3 });
    expect(b.recurringIncomeCents).toBe(420000);
    expect(b.otherMonthlySpendingCents).toBe(270000);
    expect(b.vehicleBudgetCents).toBe(90000);
    expect(b.vehicleBudgetCents - 68000).toBe(22000); // a $680 option leaves $220
  });

  it("a new $300 obligation drops the budget to $600", () => {
    const profile = { ...maria.profile, manualObligations: [{ label: "New expense", monthlyCents: 30000 }] };
    expect(buildBudget(snapshot(), profile, DEMO_AS_OF).vehicleBudgetCents).toBe(60000);
  });

  it("excludes internal transfers, the card payment, refunds, pending, cancelled and duplicate bills", () => {
    const b = buildBudget(snapshot(), maria.profile, DEMO_AS_OF);
    const reasons = Object.fromEntries(b.excluded.map((e) => [e.reason, e.count]));
    expect(reasons["Transfer between own accounts"]).toBe(6); // 3 savings transfers + 3 card payments
    expect(reasons["Refund (not income)"]).toBe(1);
    expect(reasons["Pending (not settled)"]).toBe(1);
    expect(reasons["Cancelled (not settled)"]).toBe(1);
    expect(reasons["Bill payment already counted"]).toBe(1);
    expect(reasons["Scheduled bill (counted when paid)"]).toBe(1);
  });

  it("keeps vehicle costs out of other spending and reports them as observed", () => {
    const b = buildBudget(snapshot(), maria.profile, DEMO_AS_OF);
    expect(b.observedVehicleMonthlyCents.vehicle_payment).toBe(38900);
    expect(b.observedVehicleMonthlyCents.vehicle_fuel).toBe(5000);
    expect(b.observedVehicleMonthlyCents.vehicle_insurance).toBe(14000);
  });

  it("uses liquid balances minus the reserve for upfront cash, ignoring the card", () => {
    const b = buildBudget(snapshot(), maria.profile, DEMO_AS_OF);
    expect(b.liquidCashCents).toBe(950000);
    expect(b.availableUpfrontCashCents).toBe(350000);
  });

  it("a transfer between owned accounts adds neither income nor spending", () => {
    const base = snapshot();
    const xfer: Transaction = {
      transactionId: "t_x",
      providerRecordId: "x",
      accountId: base.accounts[1].accountId,
      type: "deposit",
      status: "completed",
      amountCents: 500000,
      effectiveAt: "2026-08-10",
      description: "Transfer from checking",
      category: "internal_transfer",
    };
    const withXfer: BankingSnapshot = { ...base, transactions: [...base.transactions, xfer] };
    const a = buildBudget(base, maria.profile, DEMO_AS_OF);
    const b = buildBudget(withXfer, maria.profile, DEMO_AS_OF);
    expect(b.recurringIncomeCents).toBe(a.recurringIncomeCents);
    expect(b.otherMonthlySpendingCents).toBe(a.otherMonthlySpendingCents);
  });

  it("a negative budget stays negative", () => {
    const profile = { ...maria.profile, monthlySavingsGoalCents: 200000 };
    expect(buildBudget(snapshot(), profile, DEMO_AS_OF).vehicleBudgetCents).toBe(-70000);
  });
});
