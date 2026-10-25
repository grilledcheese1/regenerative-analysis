import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Saved results come from a JSON file; replace it so tests don't depend on what was captured.
const saved = vi.hoisted(() => ({ listings: {} as Record<string, unknown>, dealers: null as unknown }));
vi.mock("@/fixtures/market-cache.json", () => ({ default: saved }));

const { advertisedRange, cleanText, normalizeDealers, normalizeListings, parsePrice, resetMarketState, safeUrl } = await import("@/server/providers/serpapi");
const searchRoute = await import("@/app/api/market/search/route");
const dealersRoute = await import("@/app/api/market/dealers/route");

const organic = (over: Record<string, unknown> = {}) => ({ position: 1, title: "2025 Toyota Corolla Hybrid LE", link: "https://www.dealer.com/car/1", snippet: "Vehicle Price $24,900", ...over });
const googleBody = (n = 4) => ({ organic_results: Array.from({ length: n }, (_, i) => organic({ position: i + 1, link: `https://www.d${i}.com/x`, snippet: `Price $${24_000 + i * 1000}` })) });

let fetches = 0;
function mockSerp(body: unknown, status = 200) {
  fetches = 0;
  vi.stubGlobal("fetch", async (input: string) => {
    fetches++;
    expect(new URL(input).searchParams.get("api_key")).toBe("serp-test-key");
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
}
const search = (catalogId = "corolla_hybrid_2025") => searchRoute.GET(new Request(`http://localhost/api/market/search?catalogId=${catalogId}`));

beforeEach(() => {
  resetMarketState();
  saved.listings = {};
  saved.dealers = null;
  process.env.SERPAPI_API_KEY = "serp-test-key";
  delete process.env.MARKET_DAILY_CAP;
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalization", () => {
  it("M1 strips tags and drops non-https links", () => {
    const out = normalizeListings({
      organic_results: [
        organic({ title: "<b>2025</b> Corolla <script>x</script>", snippet: "Great\u0007 deal" }),
        organic({ link: "javascript:alert(1)" }),
        organic({ link: "http://insecure.com/x" }),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("2025 Corolla x");
    expect(out[0].snippet).toBe("Great deal");
    expect(out[0].domain).toBe("dealer.com");
  });

  it("M2 ignores monthly payments and takes the vehicle price", () => {
    expect(parsePrice("Lease for $389/mo or buy for $27,450")).toEqual({ known: true, value: 2_745_000 });
    expect(parsePrice("$299 per month, MSRP $31,000")).toEqual({ known: true, value: 3_100_000 });
  });

  it("skips savings, costs-to-own and valuations; reads a price before a comma (real captured snippets)", () => {
    expect(parsePrice("Save up to $10645 on one of 4523 used 2025 Toyota Camries")).toEqual({ known: false, reason: "no_plausible_price" });
    expect(parsePrice("A 2025 Toyota Camry LE has a 5-year cost-to-own of $45,268. After 5 years it will depreciate $13,842 and have a residual value of $15,953."))
      .toEqual({ known: false, reason: "no_plausible_price" });
    expect(parsePrice("With 9,906 listed and an average price of $28,544, 37.9% are good deals")).toEqual({ known: true, value: 2_854_400 });
    expect(parsePrice("has depreciated $215 and has a current resale value of $21,100 and trade-in value of $18,300")).toEqual({ known: false, reason: "no_plausible_price" });
    expect(parsePrice("2025 Toyota Corolla Hybrid Starting at $23,825.00")).toEqual({ known: true, value: 2_382_500 });
  });

  it("M3 an implausible price is unknown", () => {
    expect(parsePrice("has depreciated $1,200 this year")).toEqual({ known: false, reason: "no_plausible_price" });
    expect(parsePrice("$250,000 supercar")).toEqual({ known: false, reason: "no_plausible_price" });
  });

  it("M4 fewer than three prices gives no range; three or more give the 20th–80th percentile", () => {
    expect(advertisedRange(normalizeListings(googleBody(2)))).toEqual({ known: false, reason: "too_few_prices" });
    expect(advertisedRange(normalizeListings(googleBody(6)))).toEqual({ known: true, value: { lowCents: 2_500_000, highCents: 2_800_000, count: 6 } });
  });

  it("caps text length and strips tracking parameters from links", () => {
    expect(cleanText("x".repeat(500), 140)).toHaveLength(140);
    expect(safeUrl("https://dealer.com/?utm_source=gbp&id=7")).toBe("https://dealer.com/?id=7");
  });

  it("dealers keep only safe fields", () => {
    const [d] = normalizeDealers({ local_results: [{ title: "Round Rock Toyota", address: "2307 N I-35", rating: 4.6, website: "https://roundrocktoyota.com/?utm_source=google", phone: "(512) 488-4877" }] });
    expect(d).toEqual({ name: "Round Rock Toyota", address: "2307 N I-35", rating: { known: true, value: 4.6 }, website: "https://roundrocktoyota.com/", phone: "(512) 488-4877" });
  });
});

describe("GET /api/market/search", () => {
  it("serves live results, then the cache without a second fetch (M9)", async () => {
    mockSerp(googleBody(4));
    const first = await (await search()).json();
    expect(first).toMatchObject({ origin: "live", provider: "serpapi_google", query: "2025 Toyota Corolla Hybrid for sale" });
    expect(first.disclaimer).toMatch(/Not a quote, offer, or valuation/);
    const second = await (await search()).json();
    expect(second.origin).toBe("cache");
    expect(fetches).toBe(1);
  });

  it("M5 with no key, serves saved results labeled as such", async () => {
    delete process.env.SERPAPI_API_KEY;
    saved.listings = { corolla_hybrid_2025: { catalogId: "corolla_hybrid_2025", query: "q", provider: "serpapi_google", retrievedAt: "2026-10-24T20:00:00.000Z", listings: [], advertisedRange: { known: false, reason: "too_few_prices" }, disclaimer: "d" } };
    const res = await search();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ origin: "saved_fixture", retrievedAt: "2026-10-24T20:00:00.000Z" });
  });

  it("M6 with no key and nothing saved, it is 503 market_unavailable (never invented)", async () => {
    delete process.env.SERPAPI_API_KEY;
    const res = await search();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("market_unavailable");
  });

  it("M7 past the daily cap it serves the cache, and is 429 without one", async () => {
    process.env.MARKET_DAILY_CAP = "1";
    mockSerp(googleBody(4));
    await search("corolla_hybrid_2025");
    expect((await (await search("corolla_hybrid_2025")).json()).origin).toBe("cache");
    const capped = await search("camry_hev_le_2025");
    expect(capped.status).toBe(429);
    expect(fetches).toBe(1);
  });

  it("M8 an unknown catalogId is a 400", async () => {
    expect((await search("ferrari")).status).toBe(400);
  });

  it("a SerpAPI failure falls back to saved results, else 503", async () => {
    mockSerp({ error: "Invalid API key" }, 401);
    expect((await search()).status).toBe(503);
    saved.listings = { corolla_hybrid_2025: { catalogId: "corolla_hybrid_2025", query: "q", provider: "serpapi_google", retrievedAt: "2026-10-24T20:00:00.000Z", listings: [], advertisedRange: { known: false, reason: "too_few_prices" }, disclaimer: "d" } };
    resetMarketState();
    expect((await (await search()).json()).origin).toBe("saved_fixture");
  });

  it("never puts the key in a response or log", async () => {
    mockSerp({ error: "Invalid API key" }, 401);
    const text = await (await search()).text();
    expect(text + JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("serp-test-key");
  });
});

describe("GET /api/market/dealers", () => {
  it("returns dealers live, and 503 when unavailable with nothing saved", async () => {
    mockSerp({ local_results: [{ title: "Group 1 Toyota North Austin", address: "8400 Research Blvd", rating: 4.2 }] });
    const res = await dealersRoute.GET();
    expect(await res.json()).toMatchObject({ origin: "live", dealers: [{ name: "Group 1 Toyota North Austin" }] });
    resetMarketState();
    delete process.env.SERPAPI_API_KEY;
    expect((await dealersRoute.GET()).status).toBe(503);
  });
});
