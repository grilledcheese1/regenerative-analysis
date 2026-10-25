import type { MarketSearchResult } from "@/contracts";
import { CATALOG } from "@/fixtures/catalog";
import { apiError, newRequestId } from "@/server/http";
import { searchListings, SerpUnavailable } from "@/server/providers/serpapi";

/** GET /api/market/search?catalogId=<id>: public listings for one catalog vehicle. Research only. */
export async function GET(request: Request) {
  const requestId = newRequestId();
  const catalogId = new URL(request.url).searchParams.get("catalogId") ?? "";
  if (!CATALOG.some((v) => v.catalogId === catalogId)) {
    return apiError(400, "invalid_request", "Unknown catalogId", false, requestId, { catalogId: "Not in the vehicle catalog" });
  }
  const started = Date.now();
  try {
    const { value, origin } = await searchListings(catalogId);
    log({ requestId, catalogId, origin, ms: Date.now() - started });
    return Response.json({ requestId, origin, ...value } satisfies MarketSearchResult, { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    const code = e instanceof SerpUnavailable ? e.code : "provider_error";
    log({ requestId, catalogId, origin: "none", code, ms: Date.now() - started });
    return code === "rate_limited"
      ? apiError(429, "rate_limited", "Market search limit reached; try again later", true, requestId)
      : apiError(503, "market_unavailable", "Market search unavailable right now", code !== "not_configured", requestId);
  }
}

const log = (line: Record<string, unknown>) => console.info(JSON.stringify({ at: "market_search", ...line }));
