import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AssistantAnswer,
  AssistantFallbackReason,
  AssistantTurn,
  WhatIfResult,
} from "@/contracts";
import { sha256Hex } from "@/server/hash";
import type { ComparisonRecord } from "@/server/records";
import { buildFacts, factsHash, runWhatIf, type AssistantFacts, type WhatIfBlock } from "./facts";
import { routeIntent } from "./intents";
import { ASSISTANT_PROMPT_VERSION, SYSTEM_PROMPT, userContent } from "./prompt";
import { selectProviders, TIMEOUT_MS, type Provider } from "./providers";
import { templateAnswer } from "./template";
import { validateAnswer } from "./validate";

class AssistantTimeout extends Error {}

interface AssistantOptions {
  providers?: Provider[]; // injected in tests
  dailyCap?: number;
  now?: () => Date;
  log?: (line: Record<string, unknown>) => void;
}

export interface AnswerContext {
  owner: string;
  requestId: string;
  /** From the consent store: false only when the customer switched banking analysis off. */
  bankingAnalysisOff: boolean;
}

const normalizeQuestion = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

export function createAssistant(opts: AssistantOptions = {}) {
  const providers = opts.providers ?? selectProviders();
  const dailyCap = opts.dailyCap ?? Number(process.env.ASSISTANT_DAILY_CAP ?? 100);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line) => console.info(JSON.stringify({ at: "assistant", ...line })));

  const cache = new Map<string, AssistantAnswer>();
  const usage = { day: "", count: 0 };

  return {
    async answer(record: ComparisonRecord, question: string, history: AssistantTurn[], ctx: AnswerContext): Promise<AssistantAnswer> {
      const started = Date.now();
      const routed = routeIntent(question);
      const { intent } = routed;

      let whatIf: WhatIfResult | undefined;
      let block: WhatIfBlock | undefined;
      let whatIfFailure: "unsupported" | "banking_not_loaded" | undefined;
      if (intent === "what_if") {
        const outcome = runWhatIf(ctx.owner, record, routed.whatIf ?? null);
        if (outcome.ok) {
          whatIf = outcome.result;
          block = outcome.block;
        } else whatIfFailure = outcome.reason;
      }
      const facts: AssistantFacts = buildFacts(record, { bankingAnalysisOff: ctx.bankingAnalysisOff, whatIf: block });
      const selectedOptionId = block ? block.after.selectedOptionId : record.comparison.recommendation.selectedOptionId;

      const base = (partial: Pick<AssistantAnswer, "answer" | "citedEvidenceIds" | "followUps" | "declined"> & Partial<AssistantAnswer>): AssistantAnswer => ({
        requestId: ctx.requestId,
        intent,
        mode: "template",
        provider: null,
        model: null,
        promptVersion: ASSISTANT_PROMPT_VERSION,
        ...(whatIf && { whatIf }),
        generatedAt: now().toISOString(),
        cacheHit: false,
        ...partial,
      });

      let provider: Provider | null = null;
      const done = (a: AssistantAnswer) => {
        log({
          requestId: ctx.requestId,
          intent,
          provider: a.provider ?? provider?.name ?? null,
          model: a.model,
          ms: Date.now() - started,
          mode: a.mode,
          fallbackReason: a.fallbackReason,
          rejectedDetail: a.rejectedDetail,
          cacheHit: a.cacheHit,
        });
        return a;
      };
      const template = (reason?: AssistantFallbackReason, detail?: string) => {
        const t = templateAnswer(intent, facts, question);
        const text = whatIfFailure === "banking_not_loaded" ? "Sync banking for this customer, then ask again." : t.answer;
        return done(base({ ...t, answer: text, ...(reason && { fallbackReason: reason }), ...(detail && { rejectedDetail: detail }) }));
      };

      // No model call when the answer is fixed by the rules: out-of-scope and unsupported what-ifs.
      if (intent === "out_of_scope" || (intent === "what_if" && !block)) return template();
      if (providers.length === 0) return template("not_configured");

      const day = now().toISOString().slice(0, 10);
      const user = userContent(facts, question, history);
      const questionKey = normalizeQuestion(question);
      const factsKey = factsHash(facts);

      let lastReason: AssistantFallbackReason = "provider_error";
      let lastDetail: string | undefined;
      for (const p of providers) {
        provider = p;
        const key = sha256Hex([ASSISTANT_PROMPT_VERSION, p.name, p.model, intent, factsKey, questionKey].join("|"));
        const cached = cache.get(key);
        if (cached) return done({ ...cached, requestId: ctx.requestId, cacheHit: true });

        if (usage.day !== day) Object.assign(usage, { day, count: 0 });
        if (usage.count >= dailyCap) return template("daily_cap");
        usage.count++;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new AssistantTimeout()), TIMEOUT_MS);
        let raw: unknown;
        try {
          raw = await Promise.race([
            p.call({ model: p.model, system: SYSTEM_PROMPT, user, signal: controller.signal }),
            new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new AssistantTimeout()), { once: true })),
          ]);
        } catch (e) {
          const timedOut = e instanceof AssistantTimeout || e instanceof Anthropic.APIConnectionTimeoutError || controller.signal.aborted;
          if (timedOut) {
            lastReason = "timeout";
            lastDetail = undefined;
          } else {
            lastReason = "provider_error";
            // Status or class only: never the message, which can echo request content.
            lastDetail = e instanceof Anthropic.APIError ? `api_status:${e.status ?? "none"}` : e instanceof Error ? e.message.startsWith("api_status:") ? e.message : e.name : "unknown";
          }
          continue;
        } finally {
          clearTimeout(timer);
        }

        const v = validateAnswer(raw, facts, { intent, selectedOptionId });
        if (!v.ok) {
          lastReason = "validation_failed";
          lastDetail = v.detail;
          continue;
        }
        const answer = base({
          mode: "ai",
          provider: p.name,
          model: p.model,
          answer: v.output.answer,
          citedEvidenceIds: v.output.citedEvidenceIds,
          followUps: v.output.followUps.slice(0, 3),
          declined: v.output.declined,
        });
        cache.set(key, answer);
        return done(answer);
      }
      return template(lastReason, lastDetail);
    },
  };
}

export type Assistant = ReturnType<typeof createAssistant>;

// One assistant per server instance, so the cache and the daily cap are shared across requests.
const g = globalThis as typeof globalThis & { __nmAssistant?: Assistant; __nmAssistantRate?: Map<string, number[]> };
export const defaultAssistant = () => (g.__nmAssistant ??= createAssistant());

/** In-memory sliding window per owner. Returns true when the request may proceed. */
export function allowRequest(owner: string, perMinute = Number(process.env.ASSISTANT_RATE_PER_MIN ?? 10), at = Date.now()): boolean {
  const map = (g.__nmAssistantRate ??= new Map<string, number[]>());
  const recent = (map.get(owner) ?? []).filter((t: number) => at - t < 60_000);
  if (recent.length >= perMinute) {
    map.set(owner, recent);
    return false;
  }
  recent.push(at);
  map.set(owner, recent);
  return true;
}
