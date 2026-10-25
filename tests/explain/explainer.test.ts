import { describe, expect, it, vi } from "vitest";
import { runScenario } from "@/domain/recommendations/scenario";
import { persona } from "@/fixtures/personas";
import { buildEvidenceBundle } from "@/server/explain/bundle";
import { createExplainer, type CallModel } from "@/server/explain/explainer";
import type { ExplanationOutput } from "@/server/explain/prompt";
import { validateExplanation } from "@/server/explain/validate";
import { fixtureSnapshot } from "@/server/providers/nessie";

const maria = persona("maria")!;
const comparison = runScenario(maria, fixtureSnapshot("maria")!, {
  gasCentsPerGallon: maria.scenario.gasCentsPerGallon,
  monthlyMiles: maria.usage.monthlyMiles,
  extraMonthlySpendingCents: 0,
  incomeConfirmed: false,
}).comparison;
const bundle = buildEvidenceBundle(comparison);
const top = bundle.options.find((o) => o.optionId === bundle.decision.selectedOptionId)!;

/** A grounded output: numbers copied from the bundle, decision unchanged. */
const good = (): ExplanationOutput => ({
  summary: `${top.label} has the lowest modeled cost over ${bundle.horizonMonths} months, at ${top.economicCost}.`,
  tradeoffs: [`It costs ${top.totalMonthly} including running costs.`],
  missingInfo: ["A confirmed buyout quote including taxes and fees."],
  nextAction: bundle.decision.nextAction,
  recommendedOptionId: bundle.decision.selectedOptionId,
  citedEvidenceIds: ["vehicle_budget", top.optionId],
});

const ctx = { comparisonId: "cmp_test", requestId: "req_test" };
const quiet = () => {};
const explainerWith = (callModel: CallModel, extra: Parameters<typeof createExplainer>[0] = {}) =>
  createExplainer({ callModel, apiKey: "test", model: "claude-test", log: quiet, ...extra });

describe("validation (domain decision is fixed)", () => {
  it("accepts a grounded output", () => {
    expect(validateExplanation(good(), bundle).ok).toBe(true);
  });

  it.each([
    ["changed next action", { nextAction: "keep_current_plan" }, "changed_next_action"],
    ["changed option", { recommendedOptionId: "something_else" }, "changed_option"],
    ["invented number", { summary: "You will save $412 a month." }, "unsupported_number:412"],
    ["invented decimal", { summary: "Gas at $3.50 changes nothing." }, "unsupported_number:3.50"],
    ["unknown evidence id", { citedEvidenceIds: ["made_up_id"] }, "unknown_evidence:made_up_id"],
    ["no citations", { citedEvidenceIds: [] }, "no_citations"],
    ["approval claim", { summary: "Good news: you are pre-approved for the buyout." }, "prohibited_claim"],
    ["internal status code", { summary: "The status is still needs_information." }, "internal_identifier:needs_information"],
    ["data field name", { summary: "It has a totalMonthly of $609/mo." }, "internal_identifier:totalMonthly"],
    ["too many tradeoffs", { tradeoffs: ["a", "b", "c", "d"] }, "too_long"],
    ["bad shape", { nextAction: "buy_a_boat" }, "bad_shape"],
  ])("rejects %s", (_name, patch, detail) => {
    const v = validateExplanation({ ...good(), ...patch }, bundle);
    expect(v).toEqual({ ok: false, detail });
  });

  it("allows numbers written exactly as the bundle writes them", () => {
    const e = maria.contract.type === "lease" ? "lease_end_date" : "vehicle_budget";
    const fact = bundle.evidence.find((f) => f.id === e)!;
    expect(validateExplanation({ ...good(), summary: `See ${fact.label}: ${fact.display}.` }, bundle).ok).toBe(true);
  });
});

describe("explainer", () => {
  it("returns a validated AI explanation and caches it", async () => {
    const call = vi.fn<CallModel>(async () => good());
    const ex = explainerWith(call);
    const first = await ex.explain(comparison, ctx);
    expect(first).toMatchObject({ mode: "ai", model: "claude-test", cacheHit: false, nextAction: bundle.decision.nextAction });
    const second = await ex.explain(comparison, ctx);
    expect(second.cacheHit).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("falls back to the template when the model changes the decision", async () => {
    const ex = explainerWith(async () => ({ ...good(), nextAction: "keep_current_plan" }));
    const e = await ex.explain(comparison, ctx);
    expect(e).toMatchObject({ mode: "template", fallbackReason: "validation_failed", rejectedDetail: "changed_next_action" });
    expect(e.nextAction).toBe(comparison.recommendation.nextAction);
  });

  it("falls back on an invented number", async () => {
    const ex = explainerWith(async () => ({ ...good(), summary: "Buying out saves $412 every month." }));
    expect(await ex.explain(comparison, ctx)).toMatchObject({ mode: "template", rejectedDetail: "unsupported_number:412" });
  });

  it("falls back on an unknown evidence id", async () => {
    const ex = explainerWith(async () => ({ ...good(), citedEvidenceIds: ["made_up_id"] }));
    expect(await ex.explain(comparison, ctx)).toMatchObject({ mode: "template", rejectedDetail: "unknown_evidence:made_up_id" });
  });

  it("falls back on a prohibited claim", async () => {
    const ex = explainerWith(async () => ({ ...good(), tradeoffs: ["You are pre-approved, so act now."] }));
    expect(await ex.explain(comparison, ctx)).toMatchObject({ mode: "template", rejectedDetail: "prohibited_claim" });
  });

  it("times out after 10 s and uses the template", async () => {
    vi.useFakeTimers();
    try {
      const ex = explainerWith(() => new Promise(() => {}));
      const pending = ex.explain(comparison, ctx);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toMatchObject({ mode: "template", fallbackReason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the template on a provider error", async () => {
    const ex = explainerWith(async () => {
      throw new Error("HTTP 529");
    });
    expect(await ex.explain(comparison, ctx)).toMatchObject({ mode: "template", fallbackReason: "provider_error" });
  });

  it("without an API key, returns the template as not_configured", async () => {
    const ex = createExplainer({ apiKey: "", log: quiet });
    expect(await ex.explain(comparison, ctx)).toMatchObject({ mode: "template", fallbackReason: "not_configured", model: null });
  });

  it("stops calling the model once the daily cap is reached", async () => {
    const call = vi.fn<CallModel>(async () => good());
    const ex = explainerWith(call, { dailyCap: 1 });
    await ex.explain(comparison, { ...ctx, comparisonId: "cmp_1" });
    const capped = await ex.explain(comparison, { ...ctx, comparisonId: "cmp_2" });
    expect(capped).toMatchObject({ mode: "template", fallbackReason: "daily_cap" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("logs codes and timings, never the bundle or the output text", async () => {
    const lines: Record<string, unknown>[] = [];
    const ex = explainerWith(async () => good(), { log: (l) => lines.push(l) });
    await ex.explain(comparison, ctx);
    const text = JSON.stringify(lines);
    expect(text).toContain("cmp_test");
    expect(text).not.toContain(top.economicCost);
    expect(text).not.toContain("summary");
  });
});

describe("evidence bundle", () => {
  it("contains no transactions, account ids, coordinates or listing text", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) {
          keys.add(k);
          walk(child);
        }
      }
    };
    walk(bundle);
    for (const banned of ["transactions", "accountId", "accounts", "lat", "lon", "snippet", "url"]) {
      expect(keys.has(banned), banned).toBe(false);
    }
  });

  it("formats money exactly as the screens do", () => {
    expect(top.economicCost).toMatch(/^-?\$[\d,]+$/);
    expect(top.totalMonthly).toMatch(/^-?\$[\d,]+\/mo$/);
  });
});
