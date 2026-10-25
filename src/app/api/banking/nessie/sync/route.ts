import { NextResponse } from "next/server";
import { z } from "zod";
import { persona } from "@/fixtures/personas";
import { fetchSandbox, fixtureSnapshot, NessieUnavailable, sandboxCustomerId } from "@/server/providers/nessie";

const Body = z.object({ personaId: z.string(), mode: z.enum(["fixture", "sandbox"]) });

const error = (status: number, code: string, message: string, retryable: boolean, requestId: string) =>
  NextResponse.json({ error: { code, message, retryable, requestId } }, { status });

/**
 * Read-only banking sync for a synthetic persona. A failed sandbox read returns an error;
 * it never comes back relabeled as fixture data. The client offers fixtures explicitly.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "invalid_request", "Expected { personaId, mode }", false, requestId);
  const { personaId, mode } = parsed.data;
  if (!persona(personaId)) return error(404, "unknown_persona", "No such demo customer", false, requestId);

  if (mode === "fixture") {
    return NextResponse.json({ requestId, snapshot: fixtureSnapshot(personaId) });
  }
  try {
    return NextResponse.json({ requestId, snapshot: await fetchSandbox(personaId) });
  } catch (e) {
    if (e instanceof NessieUnavailable) {
      const configured = Boolean(process.env.NESSIE_API_KEY && sandboxCustomerId(personaId));
      return error(configured ? 502 : 503, configured ? "provider_error" : "provider_not_configured", e.message, e.retryable, requestId);
    }
    return error(502, "provider_bad_response", "Nessie returned records we could not read", false, requestId);
  }
}
