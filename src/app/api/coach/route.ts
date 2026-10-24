import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export async function POST(request: Request) {
  const { anthropicApiKey, anthropicModel } = serverEnv();
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const summary = await request.json();
  const client = new Anthropic({ apiKey: anthropicApiKey });
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
}
