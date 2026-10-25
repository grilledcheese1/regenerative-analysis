import { describe, expect, it } from "vitest";
import { localConnection } from "@/domain/onboarding/connection";
import { felixAnswers } from "./fixtures";

describe("localConnection", () => {
  it("rebuilds the history, budget and record counts without touching Nessie", () => {
    const c = localConnection("acct_edit", felixAnswers);
    expect(c.snapshot.accounts).toHaveLength(3);
    expect(c.budget.recurringIncomeCents).toBe(480000);
    expect(c.steps.find((s) => s.label === "accounts")?.count).toBe(3);
    expect(c.steps.find((s) => s.label === "deposits")?.count).toBeGreaterThan(0);
    expect(c.steps[0]).toEqual({ label: "customers", count: 1 });
  });
});
