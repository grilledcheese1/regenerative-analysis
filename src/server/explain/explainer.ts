import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PROMPT_VERSION, type Comparison, type Explanation, type FallbackReason } from "@/contracts";
import { serverEnv } from "@/lib/env";
import { sha256Hex } from "@/server/hash";
import { buildEvidenceBundle, evidenceHash } from "./bundle";
import { ExplanationOutput, SYSTEM_PROMPT, userContent } from "./prompt";
import { templateExplanation } from "./template";
import { validateExplanation } from "./validate";

const TIMEOUT_MS = 10_000;

/** Models that accept the server-side refusal fallback chain (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class ExplainTimeout extends Error {}

/** One model call: returns Claude's parsed output (or whatever it returned) for validation. */
export type CallModel = (args: { model: string; system: string; user: string; signal: AbortSignal }) => Promise<unknown>;

function anthropicCaller(apiKey: string): CallModel {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return async ({ model, system, user, signal }) => {
    const fallback = FALLBACK_MODELS.has(model);
    const res = await client.beta.messages.parse(
      {
        model,
        max_tokens: 4000,
        ...(fallback && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        system,
        messages: [{ role: "user", content: user }],
        // A short explanation of fixed numbers: low effort keeps it fast and cheap.
        output_config: { effort: "low", format: betaZodOutputFormat(ExplanationOutput) },
      },
      { signal },
    );
    if (res.stop_reason === "refusal") throw new Error("refusal");
    return res.parsed_output;
  };
}

interface ExplainerOptions {
  callModel?: CallModel; // injected in tests
  apiKey?: string;
  model?: string;
  dailyCap?: number;
  now?: () => Date;
  log?: (line: Record<string, unknown>) => void;
}

interface ExplainContext {
  comparisonId: string;
  requestId: string;
}

export function createExplainer(opts: ExplainerOptions = {}) {
  const env = serverEnv();
  const apiKey = opts.apiKey ?? env.anthropicApiKey;
  const model = opts.model ?? env.anthropicModel;
  const dailyCap = opts.dailyCap ?? Number(process.env.AI_DAILY_CAP ?? 50);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line) => console.info(JSON.stringify({ at: "explain", ...line })));
  const callModel = opts.callModel ?? (apiKey ? anthropicCaller(apiKey) : null);

  const cache = new Map<string, Explanation>();
  const usage = { day: "", count: 0 };

  return {
    async explain(c: Comparison, ctx: ExplainContext): Promise<Explanation> {
      const started = Date.now();
      const done = (e: Explanation) => {
        log({
          requestId: ctx.requestId,
          comparisonId: ctx.comparisonId,
          model: e.model ?? model,
          ms: Date.now() - started,
          mode: e.mode,
          fallbackReason: e.fallbackReason,
          rejectedDetail: e.rejectedDetail,
          cacheHit: e.cacheHit,
        });
        return e;
      };
      const fallback = (reason: FallbackReason, detail?: string) => done(templateExplanation(c, reason, detail));

      if (!callModel) return fallback("not_configured");

      const bundle = buildEvidenceBundle(c);
      const key = sha256Hex([ctx.comparisonId, PROMPT_VERSION, model, evidenceHash(bundle)].join("|"));
      const cached = cache.get(key);
      if (cached) return done({ ...cached, cacheHit: true });

      const day = now().toISOString().slice(0, 10);
      if (usage.day !== day) Object.assign(usage, { day, count: 0 });
      if (usage.count >= dailyCap) return fallback("daily_cap");
      usage.count++;

      let raw: unknown;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new ExplainTimeout()), TIMEOUT_MS);
      try {
        raw = await Promise.race([
          callModel({ model, system: SYSTEM_PROMPT, user: userContent(bundle), signal: controller.signal }),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener("abort", () => reject(new ExplainTimeout()), { once: true }),
          ),
        ]);
      } catch (e) {
        const timedOut = e instanceof ExplainTimeout || e instanceof Anthropic.APIConnectionTimeoutError || controller.signal.aborted;
        if (timedOut) return fallback("timeout");
        // Status or class only: never the message, which can echo request content.
        const detail = e instanceof Anthropic.APIError ? `api_status:${e.status ?? "none"}` : e instanceof Error ? e.name : "unknown";
        return fallback("provider_error", detail);
      } finally {
        clearTimeout(timer);
      }

      const v = validateExplanation(raw, bundle);
      if (!v.ok) return fallback("validation_failed", v.detail);

      const explanation: Explanation = {
        mode: "ai",
        promptVersion: PROMPT_VERSION,
        model,
        summary: v.output.summary,
        tradeoffs: v.output.tradeoffs,
        missingInfo: v.output.missingInfo,
        nextAction: v.output.nextAction,
        citedEvidenceIds: v.output.citedEvidenceIds,
        generatedAt: now().toISOString(),
        cacheHit: false,
      };
      cache.set(key, explanation);
      return done(explanation);
    },
  };
}

export type Explainer = ReturnType<typeof createExplainer>;

// One explainer per server instance, so the cache and the daily cap are shared across requests.
const g = globalThis as typeof globalThis & { __nmExplainer?: Explainer };
export const defaultExplainer = () => (g.__nmExplainer ??= createExplainer());
