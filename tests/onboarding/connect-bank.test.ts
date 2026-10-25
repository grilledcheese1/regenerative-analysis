import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asOwner, cookiesMock, resetJar } from "../server/cookies";
import { felixAnswers } from "./fixtures";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  process.env.ACCOUNTS_FILE = "off";
});

const signup = await import("@/app/api/auth/signup/route");
const connect = await import("@/app/api/onboarding/connect-bank/route");
const { resetAccountsForTests } = await import("@/server/auth/accounts");

const post = (body: unknown) =>
  new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** An in-memory Nessie: POSTs store records, GETs serve them back. `failOnPost` makes that POST (1-based) fail. */
function fakeNessie(failOnPost = 0) {
  let n = 0;
  let posts = 0;
  const lists = new Map<string, Record<string, unknown>[]>();
  const list = (k: string) => lists.get(k) ?? lists.set(k, []).get(k)!;
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "POST") {
      posts++;
      if (posts === failOnPost) return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
      const created = { _id: `id${++n}`, ...(JSON.parse(String(init.body)) as Record<string, unknown>) };
      list(path).push(created);
      return Response.json({ code: 201, objectCreated: created });
    }
    const rows = lists.get(path);
    return rows ? Response.json(rows) : Response.json({ code: 404, message: "No records found" }, { status: 404 });
  });
  return { posts: () => posts };
}

describe("POST /api/onboarding/connect-bank", () => {
  beforeEach(async () => {
    resetAccountsForTests();
    resetJar();
    asOwner("a");
    await signup.POST(post({ name: "Felix", email: `f-${Math.random()}@x.com`, password: "password123" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses a local copy when Nessie isn't configured", async () => {
    vi.stubEnv("NESSIE_API_KEY", "");
    const res = await connect.POST(post({ answers: felixAnswers }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.banking).toMatchObject({ mode: "fixture", nessieCustomerId: null, note: "Nessie isn't configured on this server, so the same history was created locally." });
    expect(body.budget.recurringIncomeCents).toBe(480000);
  });

  it("seeds a sandbox customer and reads it back", async () => {
    vi.stubEnv("NESSIE_API_KEY", "test-key");
    fakeNessie();
    const res = await connect.POST(post({ answers: felixAnswers }));
    const body = await res.json();
    expect(body.banking.mode).toBe("sandbox");
    expect(body.banking.nessieCustomerId).toMatch(/^id\d+$/);
    expect(body.snapshot.mode).toBe("sandbox");
    expect(body.budget.recurringIncomeCents).toBe(480000);
    expect(body.steps.find((s: { label: string }) => s.label === "accounts").count).toBe(3);
    expect(body.steps.find((s: { label: string }) => s.label === "deposits").count).toBeGreaterThan(0);
  });

  it("stores the credit score on a Nessie loan record and reads it back", async () => {
    vi.stubEnv("NESSIE_API_KEY", "test-key");
    fakeNessie();
    const body = await (await connect.POST(post({ answers: { ...felixAnswers, credit: { score: 742 } } }))).json();
    expect(body.steps.find((s: { label: string }) => s.label === "loans").count).toBe(1);
    expect(body.snapshot.loans).toEqual([expect.objectContaining({ type: "auto", creditScore: 742, monthlyPaymentCents: 45500 })]);
  });

  it("falls back to the local copy when Nessie fails partway", async () => {
    vi.stubEnv("NESSIE_API_KEY", "test-key");
    fakeNessie(5);
    const body = await (await connect.POST(post({ answers: felixAnswers }))).json();
    expect(body.banking.mode).toBe("fixture");
    expect(body.banking.nessieCustomerId).toBeNull();
    expect(body.banking.note).toMatch(/^Couldn't finish connecting to Nessie: .+\. Using the same history locally\.$/);
    expect(body.budget.recurringIncomeCents).toBe(480000);
  });

  it("requires sign-in", async () => {
    resetJar();
    expect((await connect.POST(post({ answers: felixAnswers }))).status).toBe(401);
  });
});
