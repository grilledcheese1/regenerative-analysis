import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CompareRequest, CompareResponse, ConsentState, RecommendationRecord } from "@/contracts";
import { asOwner, cookiesMock, ownerUuid } from "./cookies";

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY; // the explainer must fall back to the template
});

const compareRoute = await import("@/app/api/options/compare/route");
const recsRoute = await import("@/app/api/recommendations/route");
const recByIdRoute = await import("@/app/api/recommendations/[id]/route");
const consentsRoute = await import("@/app/api/consents/route");
const meDataRoute = await import("@/app/api/me/data/route");
const { bankingSnapshots } = await import("@/server/records");
const { fixtureSnapshot } = await import("@/server/providers/nessie");

const req = (over: Partial<CompareRequest> = {}): CompareRequest => ({
  schemaVersion: "1.0",
  personaId: "maria",
  bankingMode: "fixture",
  scenario: { gasCentsPerGallon: 300, monthlyMiles: 875, extraMonthlySpendingCents: 0, incomeConfirmed: false },
  ...over,
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("POST /api/options/compare", () => {
  it("calculates a fixture comparison and returns 201, then 200 for the same inputs", async () => {
    asOwner("a");
    const first = await compareRoute.POST(post(req()));
    expect(first.status).toBe(201);
    const a = (await first.json()) as CompareResponse;
    expect(a.comparisonId).toMatch(/^cmp_[0-9a-f]{16}$/);
    expect(a.comparison.recommendation.nextAction).toBe("request_buyout_quote");

    const again = await compareRoute.POST(post(req()));
    expect(again.status).toBe(200);
    expect(((await again.json()) as CompareResponse).comparisonId).toBe(a.comparisonId);
  });

  it("a changed scenario gives a different comparison id", async () => {
    asOwner("a");
    const base = (await (await compareRoute.POST(post(req()))).json()) as CompareResponse;
    const changed = (await (
      await compareRoute.POST(post(req({ scenario: { ...req().scenario, extraMonthlySpendingCents: 30_000 } })))
    ).json()) as CompareResponse;
    expect(changed.comparisonId).not.toBe(base.comparisonId);
  });

  it("sandbox mode with no stored sync is a 409, never a fixture substitute", async () => {
    asOwner("a");
    const res = await compareRoute.POST(post(req({ bankingMode: "sandbox" })));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("banking_not_loaded_resync");
  });

  it("sandbox mode uses the owner's stored sync", async () => {
    asOwner("a");
    const snap = { ...fixtureSnapshot("kai")!, mode: "sandbox" as const, customerId: "nessie_kai" };
    bankingSnapshots.put(ownerUuid("a"), "kai:sandbox", snap);
    const res = await compareRoute.POST(post(req({ personaId: "kai", bankingMode: "sandbox" })));
    expect(res.status).toBe(201);
    asOwner("b");
    const other = await compareRoute.POST(post(req({ personaId: "kai", bankingMode: "sandbox" })));
    expect(other.status).toBe(409);
  });

  it("validates the body", async () => {
    asOwner("a");
    const res = await compareRoute.POST(post({ ...req(), schemaVersion: "2.0", scenario: { ...req().scenario, monthlyMiles: -5 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.fieldErrors).toHaveProperty("schemaVersion");
    expect(body.error.fieldErrors).toHaveProperty(["scenario.monthlyMiles"]);
    const unknown = await compareRoute.POST(post(req({ personaId: "zed" })));
    expect((await unknown.json()).error.fieldErrors).toHaveProperty("personaId");
  });

  it("honours Idempotency-Key", async () => {
    asOwner("a");
    const r1 = await compareRoute.POST(post(req(), { "idempotency-key": "same" }));
    const r2 = await compareRoute.POST(post(req(), { "idempotency-key": "same" }));
    expect(r2.headers.get("idempotent-replay")).toBe("true");
    expect(await r2.json()).toEqual(await r1.json());
    const clash = await compareRoute.POST(post(req({ personaId: "devon" }), { "idempotency-key": "same" }));
    expect(clash.status).toBe(409);
  });
});

describe("recommendations", () => {
  let record: RecommendationRecord;

  it("without an API key, explains with the template (201) and keeps the domain decision", async () => {
    asOwner("a");
    const { comparisonId, comparison } = (await (await compareRoute.POST(post(req()))).json()) as CompareResponse;
    const res = await recsRoute.POST(post({ comparisonId }));
    expect(res.status).toBe(201);
    record = (await res.json()) as RecommendationRecord;
    expect(record.explanation).toMatchObject({ mode: "template", fallbackReason: "not_configured" });
    expect(record.recommendation).toMatchObject({
      nextAction: comparison.recommendation.nextAction,
      selectedOptionId: comparison.recommendation.selectedOptionId,
      status: comparison.recommendation.status,
      explanationMode: "template",
    });
  });

  it("an unknown comparison asks the client to resync", async () => {
    asOwner("a");
    const res = await recsRoute.POST(post({ comparisonId: "cmp_missing" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("comparison_not_found_resync");
  });

  it("GET returns the owner's record and hides it from other owners", async () => {
    asOwner("a");
    const mine = await recByIdRoute.GET(new Request("http://test"), { params: Promise.resolve({ id: record.recommendationId }) });
    expect(mine.status).toBe(200);
    expect((await mine.json()).recommendationId).toBe(record.recommendationId);

    asOwner("b");
    const theirs = await recByIdRoute.GET(new Request("http://test"), { params: Promise.resolve({ id: record.recommendationId }) });
    expect(theirs.status).toBe(404);
    const recompute = await recsRoute.POST(post({ comparisonId: record.comparisonId }));
    expect(recompute.status).toBe(409);
  });
});

describe("consents", () => {
  const put = (body: unknown) =>
    new Request("http://test/api/consents", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("starts empty, records grants and revocations, newest first", async () => {
    asOwner("b");
    const initial = (await (await consentsRoute.GET()).json()) as ConsentState;
    expect(initial.effective.driving_analysis).toBeNull();

    await consentsRoute.PUT(put({ purpose: "driving_analysis", granted: true }));
    const revoked = await consentsRoute.PUT(put({ purpose: "driving_analysis", granted: false }));
    const state = (await revoked.json()) as ConsentState & { note?: string };
    expect(state.effective.driving_analysis?.granted).toBe(false);
    expect(state.history.map((h) => h.granted)).toEqual([false, true]);
    expect(state.note).toMatch(/Future use stops/);
  });

  it("insurer sharing cannot be granted and leaves history unchanged", async () => {
    asOwner("b");
    const before = ((await (await consentsRoute.GET()).json()) as ConsentState).history.length;
    const res = await consentsRoute.PUT(put({ purpose: "insurer_sharing", granted: true }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("purpose_not_available");
    const after = ((await (await consentsRoute.GET()).json()) as ConsentState).history.length;
    expect(after).toBe(before);
  });
});

describe("DELETE /api/me/data", () => {
  it("removes the owner's records and nobody else's", async () => {
    asOwner("a");
    const { comparisonId } = (await (await compareRoute.POST(post(req()))).json()) as CompareResponse;
    asOwner("b");
    const res = await meDataRoute.DELETE();
    const body = await res.json();
    expect(body.state).toBe("complete");
    expect(body.deleted).toContain("consents");

    asOwner("a");
    expect((await recsRoute.POST(post({ comparisonId }))).status).toBe(201); // A's comparison survived B's deletion
    const del = await (await meDataRoute.DELETE()).json();
    expect(del.deleted).toEqual(expect.arrayContaining(["comparisons", "recommendations"]));
    expect((await recsRoute.POST(post({ comparisonId }))).status).toBe(409);
  });
});
