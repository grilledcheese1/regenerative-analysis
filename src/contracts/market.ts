// Market research contracts (owned by the market research stream; frozen shape).
import type { Cents, Maybe } from "./index";

export interface MarketListing {
  title: string; // plain text, ≤ 140 chars
  url: string; // https only
  domain: string; // from URL, lowercased, no "www."
  snippet: string; // plain text, ≤ 280 chars
  advertisedPriceCents: Maybe<Cents>; // parsed from title/snippet; "advertised", never an offer
  position: number;
}

export interface MarketSearchResult {
  requestId: string;
  catalogId: string;
  query: string;
  provider: "serpapi_google";
  retrievedAt: string; // when SerpAPI was called (not when we served it)
  origin: "live" | "cache" | "saved_fixture";
  listings: MarketListing[];
  advertisedRange: Maybe<{ lowCents: Cents; highCents: Cents; count: number }>;
  disclaimer: string; // "Advertised prices from public listings. Not a quote, offer, or valuation."
}

export interface Dealer {
  name: string;
  address: string;
  rating: Maybe<number>;
  website: string | null;
  phone: string | null;
}

export interface DealerSearchResult {
  requestId: string;
  provider: "serpapi_google_maps";
  retrievedAt: string;
  origin: "live" | "cache" | "saved_fixture";
  dealers: Dealer[];
}
