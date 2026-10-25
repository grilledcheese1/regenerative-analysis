import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asOwner, cookiesMock, resetJar } from "../server/cookies";
import { felixAnswers } from "./fixtures";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
});

const signup = await import("@/app/api/auth/signup/route");
const profileRoute = await import("@/app/api/me/profile/route");
const { bankingProof } = await import("@/server/profiles");
const { resetAccountsForTests } = await import("@/server/auth/accounts");

const req = (method: string, body: unknown) =>
  new Request("http://test/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("a profile can only claim a Nessie customer this server connected for it", () => {
  let accountId = "";
  beforeEach(async () => {
    resetAccountsForTests();
    resetJar();
    asOwner("a");
    accountId = (await (await signup.POST(req("POST", { name: "Felix", email: `f-${Math.random()}@x.com`, password: "password123" }))).json()).account.accountId;
  });

  const sandbox = (customerId: string, proof?: string) => ({ mode: "sandbox", nessieCustomerId: customerId, connectedAt: "2026-10-24T12:00:00Z", note: null, ...(proof && { proof }) });

  it("rejects a sandbox customer id without a proof", async () => {
    const res = await profileRoute.PUT(req("PUT", { answers: felixAnswers, banking: sandbox("someone-elses-customer") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors["banking.nessieCustomerId"]).toBeTruthy();
  });

  it("rejects a proof made for another account", async () => {
    const res = await profileRoute.PUT(req("PUT", { answers: felixAnswers, banking: sandbox("cust1", bankingProof("acct_other", "cust1")) }));
    expect(res.status).toBe(400);
  });

  it("accepts the proof connect-bank issued for this account", async () => {
    const res = await profileRoute.PUT(req("PUT", { answers: felixAnswers, banking: sandbox("cust1", bankingProof(accountId, "cust1")) }));
    expect(res.status).toBe(200);
  });

  it("rejects a customer id on local banking", async () => {
    const res = await profileRoute.PUT(req("PUT", { answers: felixAnswers, banking: { mode: "fixture", nessieCustomerId: "cust1", connectedAt: "x", note: null } }));
    expect(res.status).toBe(400);
  });
});
