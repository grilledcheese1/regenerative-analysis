import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

const TIMEOUT_MS = 8000;

function errorBody(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable, requestId: crypto.randomUUID() } };
}

export async function POST(request: Request) {
  const { anthropicApiKey, anthropicModel } = serverEnv();
  if (!anthropicApiKey) {
    return NextResponse.json(errorBody("provider_not_configured", "ANTHROPIC_API_KEY is not set", false), { status: 503 });
  }

  let summary: unknown;
  try {
    summary = await request.json();
  } catch {
    return NextResponse.json(errorBody("invalid_input", "Request body must be JSON", false), { status: 400 });
  }

  const client = new Anthropic({ apiKey: anthropicApiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const message = await client.messages.create({
      model: anthropicModel,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are a hybrid driving coach. Given this trip summary, give one specific, short tip to recover more energy through regenerative braking.\n\n${JSON.stringify(summary)}`,
        },
      ],
    });
    const block = message.content[0];
    return NextResponse.json({ tip: block.type === "text" ? block.text : "" });
  } catch {
    return NextResponse.json(errorBody("provider_error", "The AI provider did not answer in time", true), { status: 502 });
  }
}
