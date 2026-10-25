# Stream 3 — Market research (SerpAPI)

**Owner:** _(name)_ · **Branch:** `ws/market-research` · **Depends on:** nothing · **Version:** 2, 2026-10-24

**Goal:** Add the SerpAPI track. For each candidate vehicle, show source-linked public listings with retrieval time and an "advertised, not an offer" label. For the "compare confirmed offers" next step, show nearby Toyota dealers. Results are cached, capped, and fall back to labeled saved results. Market data never changes the calculation and never reaches the AI explanation.

## 0. Shared rules (identical in all four workstream documents)

### 0.1 These four streams run fully in parallel

Everything shared already exists on `main`. **No stream waits for, or edits files owned by, another stream:**

- **Contracts:** all types are in `src/contracts/`.
- **Server helpers:** everything under `src/server/` is in place.
- **Dependencies:** every package is installed and pinned.
- **Environment variables:** all are listed in `.env.example`.
- **Test config:** Playwright is set up, and each stream has its own spec file.
- **Mount points:** every new component is already mounted in the Next Move shell as a stub in its owner's folder.

Each stream fills in its own files and merges whenever it is green, in any order. If you find you need to change a file you don't own, treat that as a gap in this split: tell the stream 4 owner, who makes the change on `main`. You should not need to.

| # | Stream | Document | Delivers |
|---|---|---|---|
| 1 | Drive imports | `1-drive-imports.md` | GPX/CSV import, trip preview, driving profile feeding Compare |
| 2 | Nessie banking | `2-nessie-banking.md` | Live sandbox customers, retries, stale-read fallback, the "Best use of Nessie" moment |
| 3 | Market research | `3-market-research.md` | SerpAPI listings and dealers, saved results fallback |
| 4 | Shell and ship | `4-shell-and-ship.md` | Settings, polish, failure states, end-to-end tests, deploy, demo, live AI check |

The recommendations API and grounded Claude explanation (old Workstream C) is **done**. `done-C-recommendations-ai.md` documents it for reference.

### 0.2 Where things are (verified 2026-10-24)

- **Pages:**
  - `/` is the team's Regen Coach dashboard (`src/app/page.tsx` → `src/components/Dashboard.tsx`).
  - Next Move is a separate page at **`/next-move`** (`src/app/next-move/page.tsx` → `src/components/next-move/NextMoveApp.tsx`).
  - Don't link, redirect or restyle `/` from Next Move work.
- **Next Move tabs:** Home, Drives (the Regen replay reused), Money, Compare and Next Move.
  - The three personas Maria, Devon and Kai come from `src/fixtures/`.
  - Banking is a Nessie-format fixture until a sandbox read succeeds.
- **Calculations:** pure functions in `src/domain/`. `runScenario()` produces the budget and comparison for both the screens and the server, so figures reconcile everywhere.
- **Server API already live:**
  - `POST /api/banking/nessie/sync` stores each successful read for the owner.
  - `POST /api/options/compare`
  - `POST /api/recommendations`, `GET /api/recommendations/[id]`
  - `GET` and `PUT /api/consents`
  - `DELETE /api/me/data`
  - `GET /api/demo/customers`
  - Regen Coach's own routes: `/api/{routes,trips,compare,coach}`.
- **Checks:** 81 Vitest tests and 3 Playwright specs pass, and `npm run check` is green. Demo facts the tests enforce, so **don't break them:**
  - Maria: the buyout leads but needs a quote.
  - Maria with +$300/mo of spending gets a different result.
  - Devon keeps his car.
  - Kai has no feasible option.

### 0.3 Next.js 16.4: read before writing routes

The `AGENTS.md` warning is real. Read these first:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`

Dynamic `params` is a **Promise**. Type it as `{ params }: { params: Promise<{ id: string }> }`, then `const { id } = await params` (see `src/app/api/recommendations/[id]/route.ts`). `cookies()` is async. `middleware.ts` is now `proxy.ts`, and nobody needs it.

### 0.4 Conventions

- **Units:** money is integer cents, rates are basis points, and distance and speed are meters and m/s internally. Timestamps are ISO-8601 UTC. Format only at the edge, with `usd()` from `src/domain/format.ts`.
- **Unknown values:** use `Maybe<T>` / `unknown(reason)`, **never 0**.
- **Sources:** every displayed number carries a `SourceKind` (`observed | user_reported | derived | modeled | synthetic`).
- **Errors:** return `apiError()` from `src/server/http.ts`, with the shape `{ error: { code, message, retryable, fieldErrors?, requestId } }`.
  - 400 invalid input
  - 404 not found or not yours
  - 409 conflict or resync
  - 413 too large
  - 422 supported but unusable
  - 429 rate limited
  - 502 provider error
  - 503 not configured or unavailable
- **Never relabel a failed live call as fixture or success.** Offer the fallback explicitly and label it.
- **Code boundaries:** `src/domain/**` imports nothing from React, Next or `src/server`. Server modules that hold secrets start with `import "server-only"`; Vitest stubs it, so they stay testable.
- **Styles:** new CSS goes in a **CSS module next to your component**, using the tokens in `src/app/globals.css` (`--border`, `--text-2`, `--muted`, `--accent`, `--accent-text`, `--panel`, `--font-mono`, …).
- **Dependencies:** don't add any; everything needed is installed. If you truly need one, ask stream 4. A second lockfile change is the one way parallel branches collide.

### 0.5 File ownership (exclusive)

| Owner | Files |
|---|---|
| **1 Drive imports** | `src/domain/driving/**`, `src/server/imports/**`, `src/app/api/imports/**`, `src/app/api/drives/**`, `src/components/next-move/import/**`, `public/samples/**`, `scripts/make-sample-drives.mjs`, `tests/driving/**`, `e2e/drive-imports.spec.ts` |
| **2 Nessie banking** | `src/server/providers/nessie.ts`, `src/server/providers/nessie-normalize.ts`, `src/fixtures/banking.ts`, `src/app/api/banking/**`, `src/app/api/dev/**`, `src/app/api/demo/**`, `src/components/next-move/banking/**`, `tests/banking/**`, `e2e/nessie-banking.spec.ts` |
| **3 Market research** | `src/server/providers/serpapi.ts`, `src/app/api/market/**`, `src/fixtures/market-cache.json`, `src/components/next-move/market/**`, `tests/market/**`, `e2e/market-research.spec.ts` |
| **4 Shell and ship** | `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, `src/components/next-move/settings/**`, `src/components/next-move/explain/**`, `src/app/next-move/**`, `src/app/icon.*`, the Next Move section of `src/app/globals.css` (after `/* ---------- Next Move shell ---------- */`), `src/components/DrivesView.tsx`, `scripts/fetch-demo-routes.mjs`, `playwright.config.ts`, `e2e/shell.spec.ts`, `README.md`, `.env.example`, `package.json`/lockfile, deployment, `docs/demo-script.md`. Also the finished recommendations code, for fixes and prompt tuning: `src/server/{session,store,http,hash,records}.ts`, `src/server/explain/**`, `src/app/api/{options,recommendations,consents,me}/**`, `src/domain/**`, `src/contracts/{index,explain}.ts`, `tests/{finance,budget,compare,scenario,braking}.test.ts`, `tests/server/**`, `tests/explain/**` |

**Contract files.** `src/contracts/driving.ts` belongs to stream 1, `banking-sync.ts` to stream 2 and `market.ts` to stream 3. Their shapes are **frozen** because the shell already consumes them. You may add optional fields; don't rename or remove any. `src/contracts/index.ts` already re-exports all of them, so nobody edits it.

### 0.6 Server helpers you can use today

Owned by stream 4; don't edit them:

```ts
import { ownerId } from "@/server/session";            // async; demo owner from the httpOnly "nm_sid" cookie (route handlers only)
import { ownedStore, deleteOwnerData } from "@/server/store";
//   ownedStore<T>(name, { maxPerOwner? }) → { get(owner,id), put(owner,id,v), list(owner) /* newest first */, remove(owner,id) }
//   Stores live on globalThis (in memory). DELETE /api/me/data clears every store automatically.
import { apiError, newRequestId, withIdempotency } from "@/server/http";
//   withIdempotency(req, owner, routeName, async (parsedJsonBody) => Response): replays on same key+body, 409 on a different body
import { sha256Hex, canonicalJson } from "@/server/hash";
import { bankingSnapshots, fieldErrors } from "@/server/records"; // fieldErrors(zodIssues) → { "a.b": "message" }
```

**Store names are reserved per stream:**

- **Stream 1:** `imports`, `trips`
- **Stream 2:** `banking_snapshots`, already exported as `bankingSnapshots` and keyed `${personaId}:fixture` / `${personaId}:sandbox`
- **Stream 3:** keeps its cache in a module-level `Map`; the data is public, so it needs no owner store
- **Stream 4:** `comparisons`, `recommendations`, `consents`, `idempotency`

**Tests.** Mock the cookie with `tests/server/cookies.ts`: `vi.mock("next/headers", () => ({ cookies: cookiesMock }))`, then `asOwner("a" | "b")` to switch users. `tests/server/routes.test.ts` shows the pattern.

**In memory only.** Vercel instances don't share memory, so server records are best-effort. A route that needs a missing record returns `409 { code: "<thing>_not_found_resync" }`, and the client re-sends.

### 0.7 Mount points: already wired, you only fill in your own file

| Component (owner) | File | Props (frozen) | Already mounted in | What the shell does with it |
|---|---|---|---|---|
| `ImportDrive` (1) | `src/components/next-move/import/ImportDrive.tsx` | `{ personaId, vehicleLabel, onProfile(p: DrivingProfile \| null) }` | Drives tab, above the replay; remounts per persona | `onProfile(p)` sets Compare's monthly miles (if `p.monthlyMiles.known`), city share (if known) and usage source; the header tag becomes "Driving · imported". `onProfile(null)` reverts to the persona estimate |
| `useBankingSync` and `BankingSyncBar` (2) | `src/components/next-move/banking/` | hook `useBankingSync(personaId): BankingSyncState`; bar takes `BankingSyncState` | The shell calls the hook; the bar sits under the tabs | The shell reads `bank`, `mode` and `stale` (header tag "Banking · fixture / Nessie sandbox / stale sandbox read") and sends `mode` to the explanation API |
| `MarketResearch` (3) | `src/components/next-move/market/MarketResearch.tsx` | `{ catalogId, label }` | Inside every Compare option card whose `kind` is `lease_new` or `purchase_new` | Nothing else; the component owns its whole UI, including any disclosure |
| `DealerList` (3) | `src/components/next-move/market/DealerList.tsx` | `{ near: string }` | Next Move card, when `nextAction` is `compare_confirmed_offers` or `request_buyout_quote` (no persona reaches the first, so dealers also serve Maria's buyout quote) | Nothing else |
| `AiExplanation` (4, done) | `src/components/next-move/explain/AiExplanation.tsx` | `{ request, recommendation, evidence, onCite }` | Next Move card | Highlights cited evidence |

Today the stubs render nothing, or reproduce current behavior in the banking hook's case. **Replace the body; keep the file path, the default or named export and the props.**

### 0.8 Environment variables (all already in `.env.example`)

| Variable | Stream |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 4 (map) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (the committed `.env` sets `claude-sonnet-5-5`), `AI_DAILY_CAP` | 4 |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS`, `NESSIE_SEED_ALLOW` (dev only; never in Vercel) | 2 |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` (default 20; the free plan allows 250 searches a month) | 3 |
| `IMPORT_MAX_BYTES` | 1 |

### 0.9 Merging: any time, any order

1. `git switch main && git pull && git switch -c ws/<stream>`
2. Work only in your files.
3. Before merging: `git rebase main`, `npm run check` (lint, typecheck, unit tests, build), and `npx playwright test e2e/<your>.spec.ts e2e/shell.spec.ts`. You need `npx playwright install chromium` once per machine.
4. Merge to `main` when green. Since no two streams share a file, rebases don't conflict.

### 0.10 Definition of done (every stream)

- `npm run check` is green.
- Your unit tests cover your acceptance list, and your `e2e/<stream>.spec.ts` passes alongside `e2e/shell.spec.ts`.
- No new browser console errors on `/next-move`, and `/` is unchanged.
- The demo facts in §0.2 still hold.
- Every new number has a source label, and unknowns show as unknown.
- Failures are explicit and labeled.
- Nothing claims a Toyota or insurer integration, approval, quote or booking that doesn't exist.

### 0.11 Relationship to the team `AGENTS.md` (Regen Coach Streams 1–4)

`AGENTS.md` on `main` defines four **Regen Coach** streams (1 Physics and Scoring, 2 Data and API, 3 Map and Charts, 4 UI, Theme and Pitch). Those rules govern the dashboard at `/`. These Next Move streams **do not edit** Regen Coach files:

- `src/lib/physics/**`, `src/config/regen.config.ts`, `src/lib/trip/**`, `src/lib/model/**`
- `src/components/map/**`, `src/components/charts/**`
- `src/components/{Dashboard,Panels,RouteMap,RouteSvg,Timeline}.tsx`
- `data/**`, `simulated_user_data/**`, `scripts/fetch-routes.mjs`
- `src/app/api/{routes,trips,compare,coach}/**`
- `src/app/{page,layout}.tsx`
- the Regen section of `src/app/globals.css` (everything before the Next Move marker)

If Next Move needs a change there, ask that Regen stream's owner.

---

## 1. Market research (SerpAPI)


### 1.1 Contract: already in `src/contracts/market.ts` (frozen)

Committed and re-exported from `@/contracts`. Copied here for reference; the file is the source of truth.

```ts
import type { Cents, Maybe } from "./index";
export interface MarketListing {
  title: string;               // plain text, ≤ 140 chars
  url: string;                 // https only
  domain: string;              // from URL, lowercased, no "www."
  snippet: string;             // plain text, ≤ 280 chars
  advertisedPriceCents: Maybe<Cents>; // parsed from title/snippet; "advertised", never an offer
  position: number;
}
export interface MarketSearchResult {
  requestId: string;
  catalogId: string;
  query: string;
  provider: "serpapi_google";
  retrievedAt: string;         // when SerpAPI was called (not when we served it)
  origin: "live" | "cache" | "saved_fixture";
  listings: MarketListing[];
  advertisedRange: Maybe<{ lowCents: Cents; highCents: Cents; count: number }>;
  disclaimer: string;          // "Advertised prices from public listings. Not a quote, offer, or valuation."
}
export interface Dealer { name: string; address: string; rating: Maybe<number>; website: string | null; phone: string | null }
export interface DealerSearchResult {
  requestId: string; provider: "serpapi_google_maps"; retrievedAt: string;
  origin: "live" | "cache" | "saved_fixture"; dealers: Dealer[];
}
```

### 1.2 Provider: `src/server/providers/serpapi.ts` (`server-only`)

**Listings** (`google` engine):
- Request `GET https://serpapi.com/search.json` with:
  - `engine=google`
  - `q="<modelYear> Toyota <model> <trim> for sale"`, e.g. `2025 Toyota Corolla Hybrid LE for sale`
  - `location=Austin, Texas, United States`, `gl=us`, `hl=en`, `num=10`
  - `api_key`
- Read `organic_results[]`: `position`, `title`, `link`, `snippet`.
- The query comes **only** from `CATALOG` (`src/fixtures/catalog.ts`), by `catalogId`. Users never supply free text, which avoids query injection and keeps the cost predictable.

**Dealers** (`google_maps` engine):
- `engine=google_maps`, `q=Toyota dealer`, `ll=@30.2672,-97.7431,11z`, `type=search`.
- Read `local_results[]`: `title`, `address`, `rating`, `website`, `phone`. Keep at most 5.

**Treat everything returned as untrusted:**
- Strip HTML tags and control characters, collapse whitespace, and truncate (title 140, snippet 280).
- Keep a URL only if `new URL(link).protocol === "https:"`. Drop others.
- Never render returned HTML. Text nodes only; React does this by default, so don't use `dangerouslySetInnerHTML`.
- **Never pass listing text to Claude.** The explanation bundle (`src/server/explain/bundle.ts`) already excludes it, and a test enforces that. Don't add any route that feeds listings to it.

**Price parsing:**
- Regex `/\$\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?!\s?\/\s?mo)/` on title then snippet. Skip prices followed by `/mo` or "per month".
- Accept 5,000–90,000 USD. Outside that → unknown `"no_plausible_price"`.
- `advertisedRange` uses the 20th–80th percentile when there are ≥ 3 prices; otherwise unknown `"too_few_prices"`.

**Timeout and errors:**
- 8 s timeout, 1 retry on 5xx.
- No key → `SerpUnavailable("not_configured")`.
- HTTP 429 from SerpAPI → `SerpUnavailable("rate_limited", retryable)`.

**Cache and caps:**
- Module-level `Map` keyed by `listings:<catalogId>` / `dealers:austin`, with a 24 h TTL. It is not per owner; the data is public.
- A daily counter (`MARKET_DAILY_CAP`, default 100) resets at UTC midnight. Above the cap → serve the cache or saved fixture; otherwise 429.

### 1.3 Saved results fallback: `src/fixtures/market-cache.json`

Once SerpAPI works, call the live route once per candidate `catalogId` in `CATALOG` and once for dealers, and save the **normalized** results (not raw SerpAPI JSON) with their real `retrievedAt`. Commit them.

When live is unavailable (no key, error or cap), the route serves these with `origin: "saved_fixture"`, and the UI says "Saved search from {date}". **Never** fabricate listings if this file is missing. Return 503 `market_unavailable`, and the UI says "Market search unavailable right now."

### 1.4 Routes

- `GET /api/market/search?catalogId=<id>` → `MarketSearchResult`. An unknown `catalogId` → 400.
- `GET /api/market/dealers` → `DealerSearchResult`.
- Both add `Cache-Control: private, max-age=300`. No owner scoping is needed, since nothing personal is in them, but still log only `requestId`, `catalogId`, `origin` and duration.

### 1.5 UI: `src/components/next-move/market/`

**`MarketResearch.tsx`** (`{ catalogId, label }`) is **already mounted** inside each new-vehicle option card on Compare. It renders nothing today. Your component owns its whole UI: render a `<details>` titled "See listings", closed by default, so cards stay compact. Inside:
- The heading "Public listings for {label}" with tag **External · advertised**.
- The range line: "Advertised $24,900–$29,400 across 6 listings", or "Not enough prices to show a range".
- Up to 6 rows: title (a link with `target="_blank" rel="noopener noreferrer"`), domain, advertised price or "no price shown", and a snippet in muted text.
- Footer: "Results via SerpAPI (Google), retrieved {local time}. Advertised prices are not offers. The comparison above uses its own synthetic scenario price."

**`DealerList.tsx`** (`{ near }`) is **already mounted** on Next Move when `nextAction === "compare_confirmed_offers"`. To see it, use a persona or scenario whose next action is that. Write a test that renders it directly, rather than depending on persona data:
- "Toyota dealers near Austin": name, address, rating and website links.
- "Contact a dealer for a written quote. This app doesn't request one for you."

**States:** loading skeleton, `saved_fixture` badge, unavailable message. No layout shift: reserve the height.

### 1.6 Tests: `tests/market/*.test.ts`

| # | Test | Expected |
|---|---|---|
| M1 | Organic result with `<b>` tags and `javascript:` link | tags stripped; listing dropped (non-https) |
| M2 | Snippet "$389/mo lease" and "$27,450" | price = 2,745,000 cents; the /mo is ignored |
| M3 | "$1,200" only | unknown `no_plausible_price` |
| M4 | Fewer than 3 prices | range unknown `too_few_prices` |
| M5 | No key, saved fixture present | 200 `origin: "saved_fixture"` |
| M6 | No key, no saved entry for that catalogId | 503 `market_unavailable` |
| M7 | Cap reached | serves the cache; with no cache → 429 |
| M8 | Unknown catalogId | 400 |
| M9 | Cache hit within the TTL | no second fetch |

---


## 2. Dependencies on other streams

**None.** Everything this stream uses already exists on `main`:
- `src/contracts/market.ts`
- `apiError` and `newRequestId` from `src/server/http.ts`
- the mounted `MarketResearch` and `DealerList` stubs
- `CATALOG` in `src/fixtures/catalog.ts`
- `SERPAPI_API_KEY` and `MARKET_DAILY_CAP` in `.env.example`

Without a SerpAPI key, build against recorded responses (M1–M9 use fixtures). Capture `src/fixtures/market-cache.json` once a key is available.

## 3. End-to-end: `e2e/market-research.spec.ts` (Playwright, yours alone)

Use `page.route("**/api/market/**", …)` for deterministic responses. Put live checks behind `test.skip(!process.env.E2E_LIVE)`.

| # | Spec | Steps → assertions |
|---|---|---|
| R1 | Listings in a card | `/next-move` → Compare → the "See listings" disclosure in a new-vehicle card → mocked listings show title links (`target=_blank`, `rel` includes `noopener`), the domain and "advertised" labels |
| R2 | Saved results badge | Mock `origin: "saved_fixture"` → "Saved search from {date}" |
| R3 | Unavailable | Mock 503 `market_unavailable` → "Market search unavailable right now"; the rest of the card is unaffected |
| R4 | No layout shift | The card height before and after the listings load differs by less than the reserved skeleton height (the disclosure is closed by default) |

## 4. Done checklist

- [x] Provider, cache, cap and routes, with tests M1–M9.
- [x] `src/fixtures/market-cache.json` captured with real `retrievedAt` (once a key is available).
- [x] `MarketResearch` and `DealerList` implemented in place of the stubs; R1–R4 pass.
- [x] Demo line handed to stream 4: "Advertised listings via SerpAPI, retrieved at …; these are not offers, and the comparison uses its own scenario price."
