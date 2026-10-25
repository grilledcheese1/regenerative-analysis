import { z } from "zod";
import { PERSONAS } from "@/fixtures/personas";
import { apiError, newRequestId } from "@/server/http";
import { NessieBadResponse, NessieUnavailable } from "@/server/providers/nessie";
import { planCounts, planPersona, seedPersona } from "@/server/providers/nessie-seed";

const Body = z.object({ personas: z.array(z.string()).optional(), dryRun: z.boolean().optional() });

// Seeding takes ~20 s per persona against the live sandbox.
export const maxDuration = 120;

/** Dev-only. Every guard must pass, otherwise this route does not exist (404). */
function allowed(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  return process.env.NODE_ENV !== "production" && process.env.NESSIE_SEED_ALLOW === "1" && (host === "localhost" || host === "127.0.0.1");
}

/**
 * POST /api/dev/seed-nessie { personas?: string[], dryRun?: boolean }
 * Creates one Nessie sandbox customer per persona from the fixture records, reads it back and
 * compares the budget with the fixture's. Returns the NESSIE_CUSTOMERS line to paste into .env.local.
 * Never deletes anything.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!allowed(request)) return apiError(404, "not_found", "Not found", false, requestId);
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "invalid_request", "Expected { personas?, dryRun? }", false, requestId);

  const ids = parsed.data.personas ?? PERSONAS.map((p) => p.id);
  const unknown = ids.filter((id) => !PERSONAS.some((p) => p.id === id));
  if (unknown.length) return apiError(400, "invalid_request", `Unknown persona: ${unknown.join(", ")}`, false, requestId);

  const runId = Date.now().toString(36);
  const plans = ids.map((id) => planPersona(id, runId));
  if (parsed.data.dryRun) {
    return Response.json({ requestId, runId, dryRun: true, plans: Object.fromEntries(plans.map((p) => [p.personaId, { counts: planCounts(p), warnings: p.warnings }])) });
  }

  const customers: Record<string, string> = {};
  const results: Record<string, unknown> = {};
  for (const plan of plans) {
    try {
      const r = await seedPersona(plan);
      customers[plan.personaId] = r.customerId;
      results[plan.personaId] = { written: r.written, diff: r.diff, warnings: plan.warnings };
    } catch (e) {
      const message = e instanceof NessieUnavailable || e instanceof NessieBadResponse ? e.message : "Unexpected error";
      results[plan.personaId] = { error: message };
      break; // stop rather than leave several half-seeded customers
    }
  }
  const envLine = `NESSIE_CUSTOMERS=${Object.entries(customers).map(([p, c]) => `${p}:${c}`).join(",")}`;
  return Response.json({ requestId, runId, customers, envLine, results });
}
