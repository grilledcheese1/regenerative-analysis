import { afterEach, describe, expect, it, vi } from "vitest";
import { runScenario } from "@/domain/recommendations/scenario";
import { nessieFixture } from "@/fixtures/banking";
import { PERSONAS, persona } from "@/fixtures/personas";
import { normalizeNessie } from "@/server/providers/nessie-normalize";
import { planCounts, planPersona } from "@/server/providers/nessie-seed";

const seedRoute = await import("@/app/api/dev/seed-nessie/route");

describe("seed plan", () => {
  it.each(PERSONAS.map((p) => p.id))("B8 %s: one write per fixture record (transfers once, on the sender)", (id) => {
    const bundles = nessieFixture(id)!;
    const counts = planCounts(planPersona(id, "test"));
    const sum = (k: "deposits" | "withdrawals" | "purchases" | "bills") => bundles.reduce((n, b) => n + b[k].length, 0);
    const transfers = new Set(bundles.flatMap((b) => b.transfers.map((t) => t._id))).size;
    const loans = bundles.reduce((n, b) => n + (b.loans?.length ?? 0), 0);
    expect(counts).toEqual({
      customers: 1,
      accounts: bundles.length,
      ...(sum("deposits") && { deposits: sum("deposits") }),
      ...(sum("withdrawals") && { withdrawals: sum("withdrawals") }),
      ...(sum("purchases") && { purchases: sum("purchases") }),
      ...(sum("bills") && { bills: sum("bills") }),
      ...(transfers && { transfers }),
      ...(loans && { loans }),
    });
  });

  it("every bill carries recurring_date (one without it breaks Nessie's bill list)", () => {
    for (const p of PERSONAS) {
      const bills = planPersona(p.id, "t").accounts.flatMap((a) => a.writes.filter((w) => w.path === "bills"));
      expect(bills.length).toBeGreaterThan(0);
      for (const b of bills) expect(b.body.recurring_date).toBeTypeOf("number");
    }
  });

  it("transfers use the live API's fields only", () => {
    const t = planPersona("maria", "t").accounts.flatMap((a) => a.writes).find((w) => w.path === "transfers")!;
    expect(Object.keys(t.body).sort()).toEqual(["amount", "description", "status", "transaction_date"]);
  });

  it("deposit and purchase amounts are whole dollars", () => {
    for (const p of PERSONAS) expect(planPersona(p.id, "t").warnings).toEqual([]);
  });
});

describe("seed route guard", () => {
  const req = (host = "localhost:3000") => new Request("http://localhost/api/dev/seed-nessie", { method: "POST", headers: { host }, body: JSON.stringify({ dryRun: true }) });
  afterEach(() => vi.unstubAllEnvs());

  it("B9 is a 404 without NESSIE_SEED_ALLOW, in production, or from another host", async () => {
    vi.stubEnv("NESSIE_SEED_ALLOW", "");
    expect((await seedRoute.POST(req())).status).toBe(404);
    vi.stubEnv("NESSIE_SEED_ALLOW", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await seedRoute.POST(req())).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    expect((await seedRoute.POST(req("example.com"))).status).toBe(404);
    const ok = await seedRoute.POST(req());
    expect(ok.status).toBe(200);
    expect((await ok.json()).dryRun).toBe(true);
  });
});

describe("Nessie data changes the result", () => {
  it("B11 a $300/month bill in the budget window lowers Maria's budget by $300 and changes the result", () => {
    const maria = persona("maria")!;
    const scenario = { gasCentsPerGallon: maria.scenario.gasCentsPerGallon, monthlyMiles: maria.usage.monthlyMiles, extraMonthlySpendingCents: 0, incomeConfirmed: false };
    const base = runScenario(maria, normalizeNessie("m", "sandbox", nessieFixture("maria")!), scenario);

    const bundles = nessieFixture("maria")!;
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      bundles[0].bills.push({ _id: `child_${month}`, status: "completed", payee: "Childcare", nickname: "Childcare", payment_date: `${month}-20`, payment_amount: 300 });
    }
    const changed = runScenario(maria, normalizeNessie("m", "sandbox", bundles), scenario);

    expect(base.budget.vehicleBudgetCents - changed.budget.vehicleBudgetCents).toBe(30_000);
    const r0 = base.comparison.recommendation;
    const r1 = changed.comparison.recommendation;
    expect([r1.status, r1.nextAction, r1.selectedOptionId]).not.toEqual([r0.status, r0.nextAction, r0.selectedOptionId]);
  });
});
