import "server-only";
import { z } from "zod";
import { known, unknown, type Cents, type Dealer, type DealerSearchResult, type MarketListing, type MarketSearchResult, type Maybe } from "@/contracts";
import { catalogVehicle } from "@/fixtures/catalog";
import saved from "@/fixtures/market-cache.json";

// Public web research through SerpAPI. Everything SerpAPI returns is untrusted text: it is
// stripped to plain text, length-capped, links must be https, and none of it ever reaches the
// AI explanation. Search snippets are advertised prices, never quotes, offers or valuations.

export const DISCLAIMER = "Advertised prices from public listings. Not a quote, offer, or valuation.";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_PRICE = 5_000;
const MAX_PRICE = 90_000;
const MAX_LISTINGS = 6;
const MAX_DEALERS = 5;
// Austin, TX; the demo personas live there.
const LOCATION = "Austin, Texas, United States";
const MAPS_LL = "@30.2672,-97.7431,11z";

export class SerpUnavailable extends Error {
  constructor(readonly code: "not_configured" | "rate_limited" | "provider_error", message: string) {
    super(message);
  }
}

// ---------- Pure normalization (exported for tests) ----------

/** Plain text: no tags, no control characters, collapsed whitespace, capped length. */
export function cleanText(s: unknown, max: number): string {
  const text = String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** An https URL with tracking parameters removed, or null. */
export function safeUrl(link: unknown): string | null {
  try {
    const u = new URL(String(link));
    if (u.protocol !== "https:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^gclid$|^fbclid$/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export const domainOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

// A trailing comma is punctuation ("$28,544, 37.9% …"), not part of the number.
const PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?!\d|,\d)/g;
const MONTHLY_AFTER = /^\s*(\/\s*mo|per\s+month|a\s+month|\/\s*month|monthly)/i;
// Savings, fees and valuations are not what a car is listed for.
const NOT_A_PRICE_BEFORE = /(save|saving|savings|off|below|under|rebate|fees?|shipping|depreciated?|cost[- ]to[- ]own|resale value|trade-in value|residual value|market value)(\s+(up\s+to|of|by|is))?\s*$/i;

/** First plausible vehicle price in the text, skipping monthly payments, savings and valuations. */
export function parsePrice(text: string): Maybe<Cents> {
  for (const m of text.matchAll(PRICE)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 14);
    if (MONTHLY_AFTER.test(after)) continue;
    if (NOT_A_PRICE_BEFORE.test(text.slice(Math.max(0, m.index! - 40), m.index!))) continue;
    const dollars = Number(m[1].replace(/,/g, ""));
    if (dollars >= MIN_PRICE && dollars <= MAX_PRICE) return known(dollars * 100);
  }
  return unknown("no_plausible_price");
}

/** 20th–80th percentile of the known prices, with at least three of them. */
export function advertisedRange(listings: MarketListing[]): MarketSearchResult["advertisedRange"] {
  const prices = listings.flatMap((l) => (l.advertisedPriceCents.known ? [l.advertisedPriceCents.value] : [])).sort((a, b) => a - b);
  if (prices.length < 3) return unknown("too_few_prices");
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round(q * (prices.length - 1))))];
  return known({ lowCents: at(0.2), highCents: at(0.8), count: prices.length });
}

const Organic = z.object({ position: z.number().optional(), title: z.unknown(), link: z.unknown(), snippet: z.unknown().optional() }).passthrough();
const GoogleResponse = z.object({ organic_results: z.array(Organic).optional(), error: z.string().optional() }).passthrough();
const Local = z
  .object({ title: z.unknown(), address: z.unknown().optional(), rating: z.unknown().optional(), website: z.unknown().optional(), phone: z.unknown().optional() })
  .passthrough();
const MapsResponse = z.object({ local_results: z.array(Local).optional(), error: z.string().optional() }).passthrough();

export function normalizeListings(raw: unknown): MarketListing[] {
  const parsed = GoogleResponse.safeParse(raw);
  if (!parsed.success) throw new SerpUnavailable("provider_error", "SerpAPI returned results we could not read");
  const out: MarketListing[] = [];
  for (const r of parsed.data.organic_results ?? []) {
    const url = safeUrl(r.link);
    if (!url) continue;
    const title = cleanText(r.title, 140);
    const snippet = cleanText(r.snippet, 280);
    if (!title) continue;
    const fromTitle = parsePrice(title);
    out.push({ title, url, domain: domainOf(url), snippet, advertisedPriceCents: fromTitle.known ? fromTitle : parsePrice(snippet), position: r.position ?? out.length + 1 });
    if (out.length >= MAX_LISTINGS) break;
  }
  return out;
}

export function normalizeDealers(raw: unknown): Dealer[] {
  const parsed = MapsResponse.safeParse(raw);
  if (!parsed.success) throw new SerpUnavailable("provider_error", "SerpAPI returned results we could not read");
  return (parsed.data.local_results ?? [])
    .map((r) => {
      const rating = typeof r.rating === "number" && r.rating >= 0 && r.rating <= 5 ? known(r.rating) : unknown("no_rating");
      return {
        name: cleanText(r.title, 100),
        address: cleanText(r.address, 160),
        rating,
        website: safeUrl(r.website),
        phone: r.phone ? cleanText(r.phone, 30) : null,
      };
    })
    .filter((d) => d.name)
    .slice(0, MAX_DEALERS);
}

export const listingQuery = (catalogId: string) => {
  const v = catalogVehicle(catalogId);
  return `${v.modelYear} Toyota ${v.model} for sale`;
};

// ---------- Cache, cap and saved results ----------

type Listings = Omit<MarketSearchResult, "requestId" | "origin">;
type Dealers = Omit<DealerSearchResult, "requestId" | "origin">;
interface Entry<T> {
  value: T;
  at: number;
}

const g = globalThis as typeof globalThis & { __nmMarket?: { cache: Map<string, Entry<unknown>>; usage: { day: string; count: number } } };
const state = (g.__nmMarket ??= { cache: new Map(), usage: { day: "", count: 0 } });

/** For tests only. */
export function resetMarketState() {
  state.cache.clear();
  state.usage = { day: "", count: 0 };
}

const dailyCap = () => Number(process.env.MARKET_DAILY_CAP ?? 20);

function takeQuota(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (state.usage.day !== day) state.usage = { day, count: 0 };
  if (state.usage.count >= dailyCap()) return false;
  state.usage.count++;
  return true;
}

const savedResults = saved as unknown as { listings: Record<string, Listings>; dealers: Dealers | null };

async function serpGet(params: Record<string, string>): Promise<unknown> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new SerpUnavailable("not_configured", "SERPAPI_API_KEY is not set");
  const url = `https://serpapi.com/search.json?${new URLSearchParams({ ...params, api_key: key })}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      if (attempt === 0) continue;
      throw new SerpUnavailable("provider_error", "SerpAPI did not respond");
    }
    if (res.status === 429) throw new SerpUnavailable("rate_limited", "SerpAPI rate limit reached");
    if (res.status >= 500 && attempt === 0) continue;
    if (!res.ok) throw new SerpUnavailable("provider_error", `SerpAPI returned HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // SerpAPI reports "no results" as an error string; that's an empty result, not a failure.
    if (body?.error && !/hasn't returned any results/i.test(body.error)) throw new SerpUnavailable("provider_error", "SerpAPI could not complete the search");
    return body;
  }
  throw new SerpUnavailable("provider_error", "SerpAPI did not respond");
}

export type Served<T> = { value: T; origin: "live" | "cache" | "saved_fixture" };

/** Fresh cache → live (under the cap) → saved results → error. */
async function serve<T>(key: string, live: () => Promise<T>, savedValue: T | null): Promise<Served<T>> {
  const hit = state.cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { value: hit.value, origin: "cache" };
  let failure: SerpUnavailable;
  if (!process.env.SERPAPI_API_KEY) failure = new SerpUnavailable("not_configured", "SERPAPI_API_KEY is not set");
  else if (!takeQuota()) failure = new SerpUnavailable("rate_limited", "Daily market search limit reached");
  else {
    try {
      const value = await live();
      state.cache.set(key, { value, at: Date.now() });
      return { value, origin: "live" };
    } catch (e) {
      failure = e instanceof SerpUnavailable ? e : new SerpUnavailable("provider_error", "Market search failed");
    }
  }
  if (hit) return { value: hit.value, origin: "cache" }; // expired, but better than nothing; still labeled with its time
  if (savedValue) return { value: savedValue, origin: "saved_fixture" };
  throw failure;
}

export function searchListings(catalogId: string): Promise<Served<Listings>> {
  const query = listingQuery(catalogId);
  return serve(
    `listings:${catalogId}`,
    async () => {
      const raw = await serpGet({ engine: "google", q: query, location: LOCATION, gl: "us", hl: "en", num: "10" });
      const listings = normalizeListings(raw);
      return { catalogId, query, provider: "serpapi_google" as const, retrievedAt: new Date().toISOString(), listings, advertisedRange: advertisedRange(listings), disclaimer: DISCLAIMER };
    },
    savedResults.listings[catalogId] ?? null,
  );
}

export function searchDealers(): Promise<Served<Dealers>> {
  return serve(
    "dealers:austin",
    async () => {
      const raw = await serpGet({ engine: "google_maps", q: "Toyota dealer", ll: MAPS_LL, type: "search" });
      return { provider: "serpapi_google_maps" as const, retrievedAt: new Date().toISOString(), dealers: normalizeDealers(raw) };
    },
    savedResults.dealers,
  );
}
