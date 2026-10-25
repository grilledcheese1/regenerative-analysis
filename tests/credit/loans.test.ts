import { afterEach, describe, expect, it, vi } from "vitest";
import { nessieFixture } from "@/fixtures/banking";
import { fixtureSnapshot } from "@/server/providers/nessie";
import { planCounts, planPersona, writePlan } from "@/server/providers/nessie-seed";

const { fetchCustomer } = await import("@/server/providers/nessie");

describe("Nessie loan records", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("puts Maria's credit score on her lease record", () => {
    const loans = fixtureSnapshot("maria")!.loans ?? [];
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ type: "auto lease", creditScore: 712, monthlyPaymentCents: 38900 });
  });

  it("gives Devon a zero-balance credit file", () => {
    expect(fixtureSnapshot("devon")!.loans).toEqual([expect.objectContaining({ type: "credit file", amountCents: 0, creditScore: 768 })]);
  });

  it("seeds one loan record for Kai", () => {
    expect(planCounts(planPersona("kai", "t")).loans).toBe(1);
    const loan = planPersona("kai", "t").accounts.flatMap((a) => a.writes).find((w) => w.path === "loans")!;
    expect(Object.keys(loan.body).sort()).toEqual(["amount", "credit_score", "description", "monthly_payment", "status", "type"]);
  });

  it("reads seeded loans back the same as the fixture", async () => {
    vi.stubEnv("NESSIE_API_KEY", "k");
    let n = 0;
    const lists = new Map<string, Record<string, unknown>[]>();
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === "POST") {
        const created = { _id: `id${++n}`, ...(JSON.parse(String(init.body)) as Record<string, unknown>) };
        (lists.get(path) ?? lists.set(path, []).get(path)!).push(created);
        return Response.json({ objectCreated: created });
      }
      const rows = lists.get(path);
      return rows ? Response.json(rows) : Response.json({ message: "none" }, { status: 404 });
    });
    const { customerId } = await writePlan(planPersona("kai", "t"));
    const live = await fetchCustomer(customerId);
    const strip = (l: { loanId: string; accountId: string }[]) => l.map(({ loanId, accountId, ...rest }) => (void loanId, void accountId, rest));
    expect(strip(live.loans ?? [])).toEqual(strip(fixtureSnapshot("kai")!.loans ?? []));
    expect(nessieFixture("kai")![0].loans?.length).toBe(1);
  });
});
