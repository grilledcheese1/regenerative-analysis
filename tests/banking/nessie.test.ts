import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { asOwner, cookiesMock } from "../server/cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

const KEY = "test-key-SECRET-123";
const { fetchCustomer, nessieGet, NessieBadResponse, NessieUnavailable } = await import("@/server/providers/nessie");
const syncRoute = await import("@/app/api/banking/nessie/sync/route");
const summaryRoute = await import("@/app/api/banking/summary/route");
const { normalizeNessie } = await import("@/server/providers/nessie-normalize");

type Handler = (path: string) => { status: number; body: unknown } | "network";
let calls: string[] = [];

/** Replaces fetch with a router over request paths (the key is stripped before routing). */
function mockNessie(handler: Handler) {
  calls = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("key")).toBe(KEY);
    calls.push(url.pathname);
    const r = handler(url.pathname);
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
}

/** A tiny live-shaped sandbox: one checking + one savings account, transfers as the API returns them. */
const liveShaped: Handler = (path) => {
  if (path === "/customers/cust_m/accounts")
    return {
      status: 200,
      body: [
        { _id: "a1", type: "Checking", nickname: "Everyday checking", rewards: 0, balance: 3800, account_number: "1", customer_id: "cust_m" },
        { _id: "a2", type: "Savings", nickname: "Savings", rewards: 0, balance: 5700, account_number: "2", customer_id: "cust_m" },
      ],
    };
  if (path === "/accounts/a1/deposits")
    return { status: 200, body: [{ _id: "d1", medium: "balance", transaction_date: "2026-07-01", status: "completed", amount: 2100, description: "Payroll direct deposit" }] };
  if (path === "/accounts/a1/transfers")
    return { status: 200, body: [{ id: "t1", transaction_date: "2026-07-02", status: "completed", amount: 400, description: "Transfer to savings" }] };
  if (path.endsWith("/transfers")) return { status: 404, body: "No transfers found for this account" };
  return { status: 200, body: [] };
};

const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  process.env.NESSIE_API_KEY = KEY;
  process.env.NESSIE_CUSTOMERS = "maria:cust_m";
  asOwner("a");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("nessieGet", () => {
  it("B1 retries 5xx and then succeeds", async () => {
    let n = 0;
    mockNessie(() => (++n < 3 ? { status: 503, body: "busy" } : { status: 200, body: [] }));
    await expect(nessieGet("/accounts", z.array(z.unknown()))).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it("B2 does not retry a 4xx", async () => {
    mockNessie(() => ({ status: 404, body: "Not found" }));
    const err = (await nessieGet("/accounts/x", z.unknown()).catch((e) => e)) as InstanceType<typeof NessieUnavailable>;
    expect(err).toBeInstanceOf(NessieUnavailable);
    expect(err.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("treats 404 on a list endpoint as an empty list", async () => {
    mockNessie(() => ({ status: 404, body: "No transfers found for this account" }));
    await expect(nessieGet("/accounts/x/transfers", z.array(z.unknown()), { emptyOn404: true })).resolves.toEqual([]);
  });

  it("B3 gives up after retries when Nessie never answers", async () => {
    mockNessie(() => "network");
    const err = await nessieGet("/accounts", z.unknown()).catch((e) => e);
    expect(err).toEqual(new NessieUnavailable("Nessie did not respond", true));
    expect(calls).toHaveLength(3);
  });

  it("reports a malformed record by field path only", async () => {
    mockNessie(() => ({ status: 200, body: [{ _id: "d", amount: "12", status: "completed", description: "secret memo", transaction_date: "2026-07-01" }] }));
    const err = (await nessieGet("/accounts/a/deposits", z.array(z.object({ amount: z.number() }))).catch((e) => e)) as InstanceType<typeof NessieBadResponse>;
    expect(err).toBeInstanceOf(NessieBadResponse);
    expect(err.path).toBe("0.amount");
    expect(err.message).not.toContain("secret memo");
  });
});

describe("fetchCustomer against live-shaped responses", () => {
  it("reads accounts, handles 404 empty lists and id-only transfers", async () => {
    mockNessie(liveShaped);
    const snap = await fetchCustomer("cust_m");
    expect(snap.mode).toBe("sandbox");
    expect(snap.accounts.map((a) => a.balanceCents)).toEqual([380000, 570000]);
    const transfer = snap.transactions.find((t) => t.type === "transfer")!;
    expect(transfer).toMatchObject({ providerRecordId: "t1", category: "internal_transfer", amountCents: 40000 });
    expect(transfer.counterpartAccountId).toBeUndefined();
  });

  it("an outgoing transfer to someone else is not internal", () => {
    const snap = normalizeNessie("c", "sandbox", [
      {
        account: { _id: "a1", type: "Checking", nickname: "", balance: 0 },
        deposits: [],
        withdrawals: [],
        purchases: [],
        bills: [],
        transfers: [{ _id: "t9", amount: 50, status: "completed", description: "Venmo to a friend", transaction_date: "2026-07-03" }],
      },
    ]);
    expect(snap.transactions[0].category).not.toBe("internal_transfer");
  });
});

describe("POST /api/banking/nessie/sync", () => {
  it("B4 a malformed record is a 502 provider_bad_response, logged by path only", async () => {
    mockNessie((p) => (p.endsWith("/deposits") ? { status: 200, body: [{ _id: "d", amount: "12", status: "completed", description: "secret memo", transaction_date: "2026-07-01" }] } : liveShaped(p)));
    const res = await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("provider_bad_response");
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).toContain("bad_response");
    expect(logged).not.toContain("secret memo");
  });

  it("B5 after a good read, a failure offers the cached read; sandbox_cached serves it as stale", async () => {
    asOwner("a");
    mockNessie(liveShaped);
    expect((await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }))).status).toBe(200);

    mockNessie(() => ({ status: 503, body: "down" }));
    const failed = await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }));
    expect(failed.status).toBe(502);
    const body = await failed.json();
    expect(body.cachedSandboxAvailable.retrievedAt).toMatch(/^\d{4}-/);

    const cached = await syncRoute.POST(post({ personaId: "maria", mode: "sandbox_cached" }));
    expect(cached.status).toBe(200);
    expect(await cached.json()).toMatchObject({ stale: true, staleSince: body.cachedSandboxAvailable.retrievedAt });
  });

  it("B6 sandbox_cached with nothing cached is a 404", async () => {
    asOwner("b");
    const res = await syncRoute.POST(post({ personaId: "devon", mode: "sandbox_cached" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("no_cached_sandbox_read");
  });

  it("B7 another owner never sees the cached read", async () => {
    asOwner("a");
    mockNessie(liveShaped);
    await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }));
    asOwner("b");
    expect((await syncRoute.POST(post({ personaId: "maria", mode: "sandbox_cached" }))).status).toBe(404);
  });

  it("without a mapping it is 503 provider_not_configured", async () => {
    process.env.NESSIE_CUSTOMERS = "";
    const res = await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("provider_not_configured");
  });

  it("B10 no response or log ever contains the key", async () => {
    const seen: string[] = [];
    for (const handler of [() => ({ status: 503, body: "x" }), () => ({ status: 401, body: "x" }), () => "network" as const, liveShaped]) {
      mockNessie(handler as Handler);
      const res = await syncRoute.POST(post({ personaId: "maria", mode: "sandbox" }));
      seen.push(await res.text());
    }
    seen.push(JSON.stringify(vi.mocked(console.info).mock.calls));
    for (const s of seen) {
      expect(s).not.toContain(KEY);
      expect(s).not.toContain("key=");
    }
  });
});

describe("GET /api/banking/summary", () => {
  it("returns budget inputs from the owner's last read, or 409 before any read", async () => {
    asOwner("b");
    const before = await summaryRoute.GET(new Request("http://localhost/api/banking/summary?personaId=kai&mode=fixture"));
    expect(before.status).toBe(409);
    await syncRoute.POST(post({ personaId: "kai", mode: "fixture" }));
    const after = await summaryRoute.GET(new Request("http://localhost/api/banking/summary?personaId=kai&mode=fixture"));
    expect(after.status).toBe(200);
    const body = await after.json();
    expect(body.window).toEqual({ start: "2026-07-01", end: "2026-10-01", months: 3 });
    expect(body.budget.vehicleBudgetCents).toBeTypeOf("number");
  });
});
