import type { DealerSearchResult } from "@/contracts";
import { apiError, newRequestId } from "@/server/http";
import { searchDealers, SerpUnavailable } from "@/server/providers/serpapi";

/** GET /api/market/dealers: nearby Toyota dealers (Austin, TX) for the "compare confirmed offers" step. */
export async function GET() {
  const requestId = newRequestId();
  const started = Date.now();
  try {
    const { value, origin } = await searchDealers();
    log({ requestId, origin, ms: Date.now() - started });
    return Response.json({ requestId, origin, ...value } satisfies DealerSearchResult, { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    const code = e instanceof SerpUnavailable ? e.code : "provider_error";
    log({ requestId, origin: "none", code, ms: Date.now() - started });
    return code === "rate_limited"
      ? apiError(429, "rate_limited", "Dealer search limit reached; try again later", true, requestId)
      : apiError(503, "market_unavailable", "Dealer search unavailable right now", code !== "not_configured", requestId);
  }
}

const log = (line: Record<string, unknown>) => console.info(JSON.stringify({ at: "market_dealers", ...line }));
