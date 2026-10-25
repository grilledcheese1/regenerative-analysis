import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asOwner, cookiesMock, resetJar } from "../server/cookies";
import { felixAnswers, localBanking } from "./fixtures";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
  delete process.env.NESSIE_API_KEY;
});

const signup = await import("@/app/api/auth/signup/route");
const compareRoute = await import("@/app/api/options/compare/route");
const syncRoute = await import("@/app/api/banking/nessie/sync/route");
const customersRoute = await import("@/app/api/demo/customers/route");
const { saveProfile } = await import("@/server/profiles");
const { resetAccountsForTests } = await import("@/server/auth/accounts");

const post = (body: unknown) =>
  new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function signUpAs(email: string): Promise<string> {
  resetJar();
  const res = await signup.POST(post({ name: "Felix", email, password: "password123" }));
  return (await res.json()).account.accountId;
}

const compare = (personaId: string) =>
  compareRoute.POST(post({ schemaVersion: "1.0", personaId, bankingMode: "fixture", scenario: { gasCentsPerGallon: 300, monthlyMiles: 900, extraMonthlySpendingCents: 0, incomeConfirmed: true } }));

describe("user personas on the server", () => {
  let a = "";
  let b = "";
  beforeEach(async () => {
    resetAccountsForTests();
    asOwner("a");
    b = await signUpAs(`b-${Math.random()}@x.com`);
    a = await signUpAs(`a-${Math.random()}@x.com`);
    saveProfile(a, felixAnswers, localBanking);
  });

  it("compares the signed-in user's own persona", async () => {
    const res = await compare(`u_${a}`);
    expect(res.status).toBe(201);
    expect((await res.json()).comparison.personaId).toBe(`u_${a}`);
  });

  it("treats another account's persona as unknown", async () => {
    saveProfile(b, felixAnswers, localBanking);
    const res = await compare(`u_${b}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors.personaId).toBe("No such demo customer");
  });

  it("serves the user's bank history as the fixture snapshot", async () => {
    const res = await syncRoute.POST(post({ personaId: `u_${a}`, mode: "fixture" }));
    expect(res.status).toBe(200);
    expect((await res.json()).snapshot.customerId).toBe(`fixture_u_${a}`);
  });

  it("lists the user's own entry among the demo customers", async () => {
    const ids = ((await (await customersRoute.GET()).json()).customers as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(`u_${a}`);
    expect(ids).not.toContain(`u_${b}`);
    expect(ids).toContain("maria");
  });
});
