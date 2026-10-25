import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { serverEnv } from "@/lib/env";
import { AssistantOutput } from "./prompt";

export const TIMEOUT_MS = 10_000;

/** One model call: returns whatever the model returned, parsed, for validation. */
export type AssistantCall = (args: { model: string; system: string; user: string; signal: AbortSignal }) => Promise<unknown>;

export interface Provider {
  name: "meta" | "anthropic";
  model: string;
  call: AssistantCall;
}

/** Thrown for a non-2xx provider response. Carries the status only, never the body. */
export class ProviderStatusError extends Error {
  constructor(public status: number) {
    super(`api_status:${status}`);
  }
}

/**
 * Meta Muse Spark through an OpenAI-style chat endpoint. The base URL comes from Meta's docs and
 * is configuration, not a guess. JSON is requested in the prompt; structured-output flags are
 * not sent until Meta documents them.
 */
export function metaCaller(apiKey: string, baseUrl: string): AssistantCall {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return async ({ model, system, user, signal }) => {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new ProviderStatusError(res.status);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "";
    // Models sometimes wrap JSON in a code fence.
    const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(text) as unknown;
  };
}

/** Models that accept the server-side refusal fallback chain, same list as the explainer. */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function anthropicCaller(apiKey: string): AssistantCall {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return async ({ model, system, user, signal }) => {
    const fallback = FALLBACK_MODELS.has(model);
    const res = await client.beta.messages.parse(
      {
        model,
        max_tokens: 2000,
        ...(fallback && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: betaZodOutputFormat(AssistantOutput) },
      },
      { signal },
    );
    if (res.stop_reason === "refusal") throw new Error("refusal");
    return res.parsed_output;
  };
}

type Env = Record<string, string | undefined>;

/**
 * Providers to try, in order. `AI_PROVIDER` picks the first (`meta`, `anthropic` or `none`);
 * unset, it uses whichever is configured, Meta first. `AI_FALLBACK_PROVIDER=anthropic` adds Claude
 * as a second try when Meta fails or its answer doesn't validate.
 */
export function selectProviders(env: Env = process.env): Provider[] {
  const meta = (): Provider | null =>
    env.META_API_KEY && env.META_BASE_URL
      ? { name: "meta", model: env.META_MODEL || "muse-spark-1.1", call: metaCaller(env.META_API_KEY, env.META_BASE_URL) }
      : null;
  const claudeKey = env.ANTHROPIC_API_KEY ?? serverEnv().anthropicApiKey;
  const claude = (): Provider | null =>
    claudeKey ? { name: "anthropic", model: env.ANTHROPIC_MODEL || serverEnv().anthropicModel, call: anthropicCaller(claudeKey) } : null;

  const choice = (env.AI_PROVIDER || "").toLowerCase();
  if (choice === "none") return [];
  const first = choice === "anthropic" ? claude() : choice === "meta" ? meta() : (meta() ?? claude());
  const out = first ? [first] : [];
  if (first?.name === "meta" && (env.AI_FALLBACK_PROVIDER || "").toLowerCase() === "anthropic") {
    const second = claude();
    if (second) out.push(second);
  }
  return out;
}
