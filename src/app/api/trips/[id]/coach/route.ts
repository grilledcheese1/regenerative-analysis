// GET /api/trips/hill-aggressive-wet/coach -> { tip, basedOn, source }
// tip: one short coaching tip. basedOn: the facts it was written from, for the UI's credit line.
// Written by Claude when ANTHROPIC_API_KEY is set, otherwise rule-based. Cached per trip in memory.

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { getTrip, type SimulatedTrip } from "../../../_lib/trips";

const SYSTEM = `You are Regen Coach, a friendly driving coach for Toyota Camry Hybrid drivers.
You get facts about one simulated trip. Write one coaching tip of at most two short sentences that tells the
driver the single most useful thing to do differently next time to recover more braking energy.
Use only the numbers you are given, round them, and do not invent new ones. Plain text, no lists or markdown.`;

const ROAD = { dry: "dry", wet: "wet", snow: "snowy", mud: "muddy" } as const;
const tips = new Map<string, { tip: string; basedOn: string; source: "claude" | "rules" }>();

function facts({ trip, analysis: a, route }: SimulatedTrip): string {
  const causes: Record<string, number> = {};
  for (const e of a.missed) causes[e.cause] = (causes[e.cause] ?? 0) + 1;
  const causeList = Object.entries(causes).map(([c, n]) => `${n}x ${c.replace("-", " ")}`).join(", ");
  return [
    `Route: ${route.name}, ${(trip.header.distanceM / 1000).toFixed(1)} km`,
    `Driver: ${trip.header.driver}; road: ${trip.header.condition}`,
    `Score ${a.score}/100 (${a.label}); recovered ${a.regenKwh.toFixed(3)} of ${a.ceilingKwh.toFixed(3)} kWh possible`,
    `${Math.round(a.regenShare * 100)}% of braking went to regen; ${a.frictionKwh.toFixed(3)} kWh lost as brake heat`,
    `Missed regen events: ${a.missed.length}${causeList ? ` (${causeList})` : ""}`,
    ...a.axes.map((x) => `${x.label}: ${x.value}/100`),
  ].join("\n");
}

function ruleTip({ trip, analysis: a }: SimulatedTrip): string {
  const counts: Record<string, number> = {};
  for (const e of a.missed) counts[e.cause] = (counts[e.cause] ?? 0) + 1;
  const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (!top) return `Clean trip: ${Math.round(a.regenShare * 100)}% of your braking went back into the battery. Keep easing off early before stops.`;
  if (top === "late-braking") return `${counts[top]} stops were braked too hard for regen to keep up. Lift off earlier and brake gently to turn more of that energy into charge.`;
  if (top === "low-grip") return `On ${ROAD[trip.header.condition]} roads the car limits regen to keep the tires gripping. Start slowing sooner and more gently.`;
  if (top === "full-battery") return `The battery filled up on the descents, so the friction brakes took over. Using a little electric power before a big hill leaves room to recover more.`;
  return `A cold battery accepts less charge, so regen was capped. Gentle, early braking still recovers the most energy in the cold.`;
}

async function claudeTip(apiKey: string, model: string, basedOn: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: basedOn }],
  });
  if (response.stop_reason === "refusal") throw new Error("declined");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  if (!text) throw new Error("empty response");
  return text;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/trips/[id]/coach">) {
  const { id } = await ctx.params;
  if (tips.has(id)) return Response.json(tips.get(id));
  const found = await getTrip(id);
  if (!found) return Response.json({ error: `No trip "${id}". See /api/trips.` }, { status: 404 });
  if (!found.trip.header.regenEnabled)
    return Response.json({ error: "Coaching is only for trips with regen on." }, { status: 400 });

  const basedOn = facts(found);
  const { anthropicApiKey, anthropicModel } = serverEnv();
  let result = { tip: ruleTip(found), basedOn, source: "rules" as "claude" | "rules" };
  if (anthropicApiKey) {
    try {
      result = { tip: await claudeTip(anthropicApiKey, anthropicModel, basedOn), basedOn, source: "claude" };
    } catch (err) {
      console.warn(`coach ${id}: Claude failed (${(err as Error).message}), using a rule-based tip`);
    }
  }
  tips.set(id, result);
  return Response.json(result);
}
