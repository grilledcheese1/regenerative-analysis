# Workstream B — Live Nessie banking and market research

**Owner:** _(name)_ · **Branch:** `ws/b-banking-market` · **Version:** 1, 2026-10-24

**Goal:** Make the Capital One track undeniable and add the SerpAPI track.

1. **Nessie sandbox for real.** Three team-controlled sandbox customers are seeded from our fixtures. The app reads them live. When that fails, the user gets an explicit, labeled choice: the last good sandbox read (marked stale) or the fixture. Nessie-derived income and spending drive the vehicle budget and so the recommendation. This is already true for fixtures, and must be **demonstrably true for live sandbox data.**
2. **Market research.** For each candidate vehicle, show source-linked web listings with retrieval time, plus an "advertised, not an offer" label. Add nearby Toyota dealers for the "compare confirmed offers" next step. Results are cached, capped, and have a saved-results fallback.

## 0. Shared rules (identical in all four workstream documents)

### 0.1 Where we are (verified 2026-10-24 ~7 pm)

The Next Move vertical slice works end to end with fixture banking:

- **Domain:** `src/domain/finance/{budget,loan,lease,fuel}.ts` and `src/domain/recommendations/{compare,rank,recommend}.ts`. These are pure functions using integer cents.
- **Fixtures:** `src/fixtures/{personas,catalog,banking}.ts`, with the three personas Maria, Devon and Kai.
- **Nessie adapter:** `src/server/providers/nessie.ts` (server-only fetch, sandbox reads) and `nessie-normalize.ts` (zod schemas and normalization).
- **API:** `GET /api/demo/customers` and `POST /api/banking/nessie/sync` (`{ personaId, mode: "fixture" | "sandbox" }`). The older `POST /api/coach` is still used by the Drives coaching panel in `src/components/Panels.tsx`.
- **UI:** `src/components/next-move/NextMoveApp.tsx` is the shell (persona picker, tabs, sync bar, scenario state). `screens.tsx` holds Home, Money, Compare and Next Move. `Evidence.tsx` provides `EvidenceList` and `SourceChip`. `src/components/DrivesView.tsx` is the Regen replay on the cached Austin routes in `src/data/routes.json`.
- **Checks:** 29 Vitest tests pass across `tests/{finance,budget,compare,braking}.test.ts`. `tsc`, `eslint` and `next build` are clean.
- **Demo scenarios already true:** Maria's buyout leads but needs a quote, and adding $300/mo of spending changes her result. Devon keeps the car. Kai has no feasible option. `tests/compare.test.ts` enforces all of these, so **do not break them.**

### 0.2 Step 0 — baseline (done)

The work above is committed on `vishruth` and merged into `main`, together with the team's Regen Coach work (physics, data pipeline, `TripMap`, generated trips). Branch from the latest `main`: `git switch main && git pull && git switch -c ws/<stream>`.

### 0.3 Next.js 16.4: read before writing routes

The `AGENTS.md` warning is real. Before writing a route, read:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`

Facts that differ from older Next.js:

- Dynamic `params` is a **Promise**: `export async function GET(req: Request, ctx: RouteContext<"/api/drives/[id]">) { const { id } = await ctx.params }`.
- `cookies()` is **async**: `const jar = await cookies()`.
- `middleware.ts` is deprecated and renamed `proxy.ts`. We don't need either.

### 0.4 Conventions (from the Calculation and Data Specification)

- Money is integer cents (`Cents`), rates are basis points, distance is meters and speed is m/s internally. Timestamps are ISO-8601 UTC. Format only at the edge (`src/domain/format.ts` → `usd()`).
- An unknown value is `Maybe<T>` / `unknown(reason)` from `src/contracts/index.ts`, **never 0**.
- Every displayed number carries a `SourceKind` (`observed | user_reported | derived | modeled | synthetic`) and appears with `SourceChip`.
- Error body is always `{ error: { code, message, retryable, fieldErrors?, requestId } }`. Status codes:
  - 400 invalid input
  - 404 not found or not yours
  - 409 conflict
  - 413 too large
  - 422 supported but unusable
  - 429 rate limited
  - 502 provider error
  - 503 provider not configured or unavailable
- **Never relabel a failed live call as fixture/success.** Offer the fallback explicitly and label it.
- Pure domain code (`src/domain/**`) imports nothing from React, Next or `src/server`. Server code that holds secrets starts with `import "server-only"`.
- New CSS goes in a **CSS module next to your component** (`Foo.module.css`), using the existing tokens (`var(--border)`, `var(--text-2)`, `var(--font-mono)`, …). `src/app/globals.css` is owned by Stream D.

### 0.5 File ownership (edit only your own files; ask the owner for anything else)

| Area | Owner |
|---|---|
| `src/domain/driving/**`, `src/contracts/driving.ts`, `src/app/api/imports/**`, `src/app/api/drives/**`, `src/server/imports/**`, `src/components/next-move/import/**`, `public/samples/**`, `scripts/make-sample-drives.mjs`, `tests/driving/**` | **A** |
| `src/server/providers/nessie*.ts`, `src/fixtures/banking.ts`, `src/app/api/banking/**`, `src/app/api/dev/**`, `src/server/providers/serpapi.ts`, `src/app/api/market/**`, `src/contracts/{banking-sync,market}.ts`, `src/fixtures/market-cache.json`, `src/components/next-move/banking/**`, `src/components/next-move/market/**`, `tests/banking/**`, `tests/market/**` | **B** |
| `src/server/{session,store,http}.ts`, `src/server/explain/**`, `src/app/api/options/**`, `src/app/api/recommendations/**`, `src/app/api/consents/**`, `src/app/api/me/**`, `src/contracts/index.ts` (existing types), `src/contracts/explain.ts`, `src/domain/recommendations/**`, `src/domain/finance/**`, `src/components/next-move/explain/**`, `tests/{finance,budget,compare}.test.ts`, `tests/server/**`, `tests/explain/**` | **C** |
| `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, new `Settings` screen, `src/app/**` pages/layout/icon, `src/app/globals.css`, `src/components/{DrivesView,Panels,RouteMap,RouteSvg,Timeline}.tsx`, `package.json` scripts, `.env.example`, `README.md`, `playwright.config.ts`, `e2e/**`, deployment, demo script | **D** |

Shared append-only exceptions:

- **`src/contracts/index.ts`:** each stream may append **one** line, `export * from "./<file>";`. All other edits go through C.
- **`package.json` / `package-lock.json`:** add dependencies with `npm install --save-exact <pkg>@<version>`. On merge conflicts in the lockfile, take either side and re-run `npm install`.

### 0.6 Shared server primitives: C delivers by H+0:45, signatures frozen now

Code against these immediately. C merges them to `vishruth` as a tiny PR; everyone rebases.

```ts
// src/server/session.ts
import "server-only";
/** Demo owner id from httpOnly cookie "nm_sid" (crypto.randomUUID(), SameSite=Lax, Path=/, 7 days).
 *  Creates the cookie if missing. Only call from route handlers. */
export async function ownerId(): Promise<string>;

// src/server/store.ts
import "server-only";
export interface OwnedStore<T> {
  get(owner: string, id: string): T | undefined;      // undefined for other owners: callers return 404
  put(owner: string, id: string, value: T): void;
  list(owner: string): T[];                            // newest first
  remove(owner: string, id: string): boolean;
}
/** In-memory, kept on globalThis so dev HMR doesn't wipe it. Registers the store for deleteOwnerData. */
export function ownedStore<T>(name: string, opts?: { maxPerOwner?: number }): OwnedStore<T>;
export function deleteOwnerData(owner: string): { stores: string[] };

// src/server/http.ts
export function newRequestId(): string;
export function apiError(status: number, code: string, message: string, retryable: boolean,
  requestId: string, fieldErrors?: Record<string, string>): Response;
/** Idempotency-Key handling: same key + same body hash → replay the stored response;
 *  same key + different body → 409 "idempotency_conflict". */
export async function withIdempotency(req: Request, owner: string, route: string,
  run: (body: unknown) => Promise<Response>): Promise<Response>;
```

Registered store names:

- **A:** `imports`, `trips`
- **B:** `banking_snapshots`. B's market cache is global, not per owner, and lives in a module-level `Map`.
- **C:** `comparisons`, `recommendations`, `explanations`, `consents`, `idempotency`

**In-memory caveat.** Vercel instances don't share memory, so server records are best-effort. The client keeps working state. Any route that needs a missing server record returns `409 { code: "<thing>_not_found_resync" }` and the client re-sends its inputs. Supabase persistence is a C stretch goal behind the same `OwnedStore` interface.

### 0.7 Integration mount points (D wires these into the shell)

| Component (owner) | Path | Props | Mounted by D in |
|---|---|---|---|
| `ImportDrive` (A) | `src/components/next-move/import/ImportDrive.tsx` | `{ personaId: string; vehicleLabel: string; onProfile: (p: DrivingProfile \| null) => void }` | Drives tab, above `DrivesView` |
| `BankingSyncBar` (B) | `src/components/next-move/banking/BankingSyncBar.tsx` and hook `useBankingSync.ts` | hook: `useBankingSync(personaId) → { bank, mode, stale, loading, error, sync(mode) }`; bar: the hook's return value | Replaces the inline `.sync-bar` in `NextMoveApp` |
| `MarketResearch` (B) | `src/components/next-move/market/MarketResearch.tsx` | `{ catalogId: string; label: string }` | Compare: a "See listings" disclosure per new-vehicle option |
| `DealerList` (B) | `src/components/next-move/market/DealerList.tsx` | `{ near: "Austin, TX" }` | Next Move, when `nextAction === "compare_confirmed_offers"` |
| `AiExplanation` (C) | `src/components/next-move/explain/AiExplanation.tsx` | `{ request: CompareRequest; recommendation: Recommendation; evidence: EvidenceFact[] }` | Next Move: replaces the "Explanation generated by a deterministic template" footer |

Until a component lands, D mounts a placeholder with the same props.

### 0.8 Environment registry (D adds all of these to `.env.example` at H+0)

| Variable | Used by | Default / note |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | D (map) | exists |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | C | model default `claude-sonnet-5-5` in `src/lib/env.ts` |
| `AI_DAILY_CAP` | C | `50` |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS` | B | `http://api.nessieisreal.com`; `maria:<id>,devon:<id>,kai:<id>` |
| `NESSIE_SEED_ALLOW` | B | `1` only on a dev machine; never set in Vercel |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` | B | `100` |
| `IMPORT_MAX_BYTES` | A | `4194304` (4 MiB) |

### 0.9 Schedule (H+0 = kickoff; scale to the real deadline)

| When | Milestone |
|---|---|
| H+0 | D commits the baseline; everyone branches; D deploys the baseline preview |
| H+0:45 | C merges the shared primitives (§0.6); everyone rebases |
| H+1 | C merges the `CompareInputs.overrides` extension (`cityShare`, `usageSource`), which A needs |
| H+3 | **Integration window 1:** each stream merges whatever is green behind its component |
| H+6 | **Integration window 2:** features complete |
| H+8 | **Integration window 3:** fixes only |
| H+9 | **Freeze.** Then e2e, deploy, and two full rehearsals on another device |

Merge = rebase on `vishruth`, `npm run lint && npm run typecheck && npm test && npm run build` green, then D merges. Shared field names are frozen after H+1. Changing one needs a fixture update and a message to all owners.

### 0.10 Definition of done (every stream)

- Lint, typecheck, unit tests and build are green, and your own tests cover your acceptance list.
- No new browser console errors.
- The four demo scenarios in §0.1 still hold.
- Every new number has a source label, and unknowns are shown as unknown.
- Failures are explicit and labeled.
- Nothing claims a Toyota or insurer integration, approval, quote or booking that doesn't exist.

### 0.11 Relationship to the team `AGENTS.md` (Regen Coach Streams 1–4)

`AGENTS.md` on `main` defines four **Regen Coach** streams (1 Physics and Scoring, 2 Data and API, 3 Map and Charts, 4 UI, Theme and Pitch) and their file ownership. Those rules still govern the Regen replay that now lives on the Drives tab. These Next Move workstreams (A–D) **do not edit** Regen Coach files:

- `src/lib/physics/**`, `src/config/regen.config.ts`, `src/lib/trip/**`
- `src/components/map/**`, `src/components/charts/**`
- `data/**`, `simulated_user_data/**`, `scripts/fetch-routes.mjs`
- the existing routes `src/app/api/{routes,trips,compare}/**`

Next Move uses its own paths (`/api/drives`, `/api/options/compare`, …), so nothing collides. If a Next Move feature needs a change there, ask that Regen stream's owner. Stream D coordinates the two sets of owners at each integration window.

---

## 1. Current state of your area (read these files first)

**`src/server/providers/nessie-normalize.ts`**
- Zod schemas for Nessie accounts, deposits, withdrawals, purchases, transfers and bills. **Amounts are dollars** and are converted to cents in normalization. Statuses are `pending | cancelled | completed | recurring | executed`, falling back to `pending`.
- `normalizeNessie(customerId, mode, bundles)` produces a `BankingSnapshot` with:
  - categories
  - internal-transfer detection through `counterpartAccountId`
  - bill-vs-purchase duplicate handling
  - refunds

  `src/domain/finance/budget.ts` → `buildBudget()` then applies the rules, and `tests/budget.test.ts` covers them.

**`src/server/providers/nessie.ts`** (`server-only`)
- `get()` has an 8 s timeout and throws `NessieUnavailable(message, retryable)`.
- `sandboxCustomerId(personaId)` reads `NESSIE_CUSTOMERS="maria:<id>,devon:<id>,kai:<id>"`.
- `fetchSandbox(personaId)` reads accounts, then each account's five collections.
- `fixtureSnapshot(personaId)` normalizes `nessieFixture()` from `src/fixtures/banking.ts`.

**`src/app/api/banking/nessie/sync/route.ts`**
- Accepts `POST { personaId, mode }`. Fixture → 200. Sandbox → 200, or 503 `provider_not_configured`, or 502 `provider_error` / `provider_bad_response`. It never falls back silently.

**`src/app/api/demo/customers/route.ts`**
- Returns a `sandboxAvailable` flag per persona.

**`src/fixtures/banking.ts`**
- Per-persona `SPECS`: checking, savings and card balances, plus monthly income, bills, purchases, card purchases and a savings transfer. These are expanded July → Oct 22 2026 into Nessie-shaped records. The fixture **intentionally** includes an internal transfer, a card and its payment, a refund, a pending purchase, a cancelled item, and a bill that is also recorded as a purchase.

**`NextMoveApp.tsx`** (D's file)
- The inline `sync()` callback, `.sync-bar` markup and `syncError` state. You will replace these with a hook and component that D mounts (§5).

**Known risk from the earlier environment probe:** the Nessie production host answered, but sandbox endpoints were degraded. **Time-box live Nessie to 90 minutes before deciding the demo path** (§2.1).

---

## 2. Live Nessie

### 2.1 Probe first (≤ 15 min)

Get a key at `prod.nessieisreal.com` (Capital One HackTX table). With it in `.env.local`:

```bash
curl -s "http://api.nessieisreal.com/customers?key=$NESSIE_API_KEY" | head -c 300
curl -s "http://api.nessieisreal.com/accounts?key=$NESSIE_API_KEY" | head -c 300
```

Record in your PR description which host works (`api.nessieisreal.com` vs another listed in the docs), the latency, and whether POSTs succeed. If the sandbox is down, the demo path is "Nessie-format fixture, labeled", which the UI already says. Still ship the seed route, and keep the retry and stale work, so it lights up the moment the sandbox recovers.

### 2.2 Seed route (dev only): `src/app/api/dev/seed-nessie/route.ts`

We seed from a route handler rather than a script so it can import the TypeScript fixtures directly. No `tsx` dependency is needed.

**Guard (all must hold, or 404):**
- `process.env.NODE_ENV !== "production"`
- `process.env.NESSIE_SEED_ALLOW === "1"`
- the request comes from `localhost` (check the `host` header)

**`POST /api/dev/seed-nessie` with `{ personas?: string[], dryRun?: boolean }`:**

1. For each persona, build the plan from `nessieFixture(personaId)`. That is the **same bundles** the fixture snapshot uses, so live and fixture budgets should match.
2. Create the customer: `POST /customers`
   ```
   { first_name: "<Persona>", last_name: "NextMoveDemo-<runId>",
     address: { street_number: "1", street_name: "Speedway", city: "Austin", state: "TX", zip: "78705" } }
   ```
   `runId` is `Date.now().toString(36)`, so seeded data is identifiable.
3. Create each account: `POST /customers/{id}/accounts`
   ```
   { type, nickname, rewards: 0, balance: <dollars> }
   ```
   The `type` strings are exactly `"Checking" | "Savings" | "Credit Card"`. Keep a map from fixture account id to Nessie `_id`.
4. Merchants: Nessie purchases need `merchant_id`. Create one merchant per distinct purchase description (`POST /merchants`, `{ name, category: ["demo"], address, geocode: { lat: 30.2849, lng: -97.7341 } }`), or reuse one "Demo merchant" and keep the real description in `description`. **Check the normalizer reads `description`, not the merchant name.**
5. Records, per account, in this order:
   - **deposits:** `POST /accounts/{id}/deposits`, `{ medium: "balance", transaction_date, status, amount, description }`
   - **withdrawals:** `POST /accounts/{id}/withdrawals`, same fields as deposits
   - **purchases:** `POST /accounts/{id}/purchases`, `{ merchant_id, medium: "balance", purchase_date, amount, status, description }`
   - **bills:** `POST /accounts/{id}/bills`, `{ status, payee, nickname, payment_date, recurring_date?, payment_amount }`
   - **transfers:** `POST /accounts/{id}/transfers`, `{ medium: "balance", payee_id: <mapped Nessie account id>, amount, transaction_date, status, description }`

   **Verify every field name against `prod.nessieisreal.com/docs` before running.** The zod schemas in `nessie-normalize.ts` are what we read back, so make the read side and write side agree.
6. Run POSTs sequentially per account, with at most 4 concurrent accounts. Log one line per persona with counts, never the key.
7. **Read back and diff.** Call `fetchSandbox(personaId)`, then `buildBudget()` on both snapshots (`src/domain/finance/budget.ts`, using `persona(id).profile` and `DEMO_AS_OF` from `src/fixtures/personas.ts`). Compare `recurringIncomeCents`, `otherMonthlySpendingCents`, `vehicleBudgetCents` and `availableUpfrontCashCents`.
8. Respond with:
   ```
   { runId, customers: { maria: "<id>", ... }, envLine: "NESSIE_CUSTOMERS=maria:<id>,devon:<id>,kai:<id>",
     diffs: { maria: { vehicleBudgetCents: { fixture, sandbox } , ... } } }
   ```
   Paste `envLine` into `.env.local` and the Vercel env.

**Expected Nessie quirks** (handle them; don't fight them):

- **Balances drift.** Nessie applies deposits, withdrawals and transfers to the stored balance, so the final balance ≠ the fixture's. Fix: for each account, compute the fixture's net effect of completed records, and create the account with `balance = fixtureEndBalance − netEffect`. If Nessie doesn't apply some types, the diff will show it. Adjust per type and re-seed, deleting the previous customers first (`DELETE /customers/{id}` if available; otherwise leave them, since `runId` separates them and only the mapped ids are read).
- **Status rewrites.** Nessie may process `pending` → `executed`/`completed` or reject dates in the future. If it rewrites statuses or dates, **document each case in the PR** and add a normalization rule only if it is principled. For example, `executed` already maps like `completed`. Do not change budget rules to force a match. A small, explained diff is acceptable and honest.
- **Never** call the bulk `DELETE /data?type=…`. It wipes every record under the key, which may be shared with teammates.

`dryRun: true` returns the plan (counts per endpoint) without calling Nessie. Test it.

### 2.3 Hardening `nessie.ts`

- **Retry** in `get()`: up to 2 retries on network error, timeout or HTTP ≥ 500, with backoff of 250 ms then 750 ms plus ±20% jitter. Never retry 4xx. Retry only GETs.
- **Concurrency:** today `fetchSandbox` fires 5 × accounts requests at once. Limit it to 4 in flight with a tiny inline semaphore. No new dependency.
- **Total budget:** abort the whole sync after 20 s → `NessieUnavailable("Nessie took too long", true)`.
- **Schema drift:** catch `ZodError` separately → 502 `provider_bad_response`. Log the **path** of the first issue only, never values.
- **Never** include the key in errors or logs. The URL contains `?key=`, so make sure no thrown error message includes the URL.

### 2.4 Stale cache and explicit fallback

New contract file `src/contracts/banking-sync.ts`. Append `export * from "./banking-sync";` to `index.ts`.

```ts
import type { BankingSnapshot, DataMode } from "./index";
export interface BankingSyncResult {
  requestId: string;
  snapshot: BankingSnapshot;
  stale: boolean;              // true only when serving a cached sandbox read on purpose
  staleSince?: string;         // snapshot.retrievedAt of the cached read
}
export interface BankingSyncError {
  error: { code: string; message: string; retryable: boolean; requestId: string };
  cachedSandboxAvailable?: { retrievedAt: string }; // offer, don't serve
}
export type BankingSyncMode = DataMode | "sandbox_cached";
```

Update `POST /api/banking/nessie/sync`:

- The body `mode` becomes `"fixture" | "sandbox" | "sandbox_cached"`.
- On a **successful** sandbox read, store it with `ownedStore<BankingSnapshot>("banking_snapshots").put(owner, \`${personaId}:sandbox\`, snapshot)`.
- On a **failed** sandbox read: same status codes as today, plus `cachedSandboxAvailable` if a cached read exists for this owner and persona.
- `mode: "sandbox_cached"` returns the stored snapshot with `stale: true, staleSince`, or 404 `no_cached_sandbox_read`.
- Also store fixture loads under `${personaId}:fixture`. C's compare route reads `banking_snapshots` (§6).

### 2.5 `GET /api/banking/summary?personaId=&mode=`
This is the spec's "normalized budget inputs" endpoint, priority P2. It reads the stored snapshot for the owner and runs `buildBudget(snapshot, persona.profile, DEMO_AS_OF)`. It returns `{ requestId, mode, retrievedAt, window, budget }`, or 409 `banking_not_loaded_resync`.

### 2.6 Tests: `tests/banking/*.test.ts`

| # | Test | Expected |
|---|---|---|
| B1 | `get()` with fetch mocked to return 503, 503, then 200 | 3 calls, success |
| B2 | `get()` mocked to 404 | 1 call, `NessieUnavailable(retryable=false)` |
| B3 | Timeout (mock a fetch that never resolves; use fake timers) | `NessieUnavailable("Nessie did not respond", true)` |
| B4 | Malformed body (`amount: "12"`) | route → 502 `provider_bad_response`; logged message has no values |
| B5 | Sync sandbox fails after an earlier success | 502 with `cachedSandboxAvailable.retrievedAt`; `mode: "sandbox_cached"` → `stale: true` |
| B6 | `sandbox_cached` with nothing cached | 404 `no_cached_sandbox_read` |
| B7 | Owner B asks for `sandbox_cached` after owner A synced | 404 (tenant isolation) |
| B8 | Seed `dryRun` for maria | counts equal fixture record counts per type |
| B9 | Seed guard with `NODE_ENV=production` or no `NESSIE_SEED_ALLOW` | 404 |
| B10 | Error messages never contain `key=` | assert over B1–B5 outputs |
| B11 | **Nessie changes the result:** maria fixture snapshot with one extra $300 recurring bill injected | `vehicleBudgetCents` drops by $300, and `compareOptions` changes the recommendation, as `tests/compare.test.ts` expects for a manual obligation |

---

## 3. Market research (SerpAPI)

### 3.1 Contract: `src/contracts/market.ts` (append the export line to `index.ts`)

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

### 3.2 Provider: `src/server/providers/serpapi.ts` (`server-only`)

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
- **Never pass listing text to Claude.** Tell C; the evidence bundle must not include it.

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

### 3.3 Saved results fallback: `src/fixtures/market-cache.json`

Once SerpAPI works, call the live route once per candidate `catalogId` in `CATALOG` and once for dealers, and save the **normalized** results (not raw SerpAPI JSON) with their real `retrievedAt`. Commit them.

When live is unavailable (no key, error or cap), the route serves these with `origin: "saved_fixture"`, and the UI says "Saved search from {date}". **Never** fabricate listings if this file is missing. Return 503 `market_unavailable`, and the UI says "Market search unavailable right now."

### 3.4 Routes

- `GET /api/market/search?catalogId=<id>` → `MarketSearchResult`. An unknown `catalogId` → 400.
- `GET /api/market/dealers` → `DealerSearchResult`.
- Both add `Cache-Control: private, max-age=300`. No owner scoping is needed, since nothing personal is in them, but still log only `requestId`, `catalogId`, `origin` and duration.

### 3.5 UI: `src/components/next-move/market/`

**`MarketResearch.tsx`** (`{ catalogId, label }`), mounted by D in each new-vehicle option card on Compare as a `<details>` titled "See listings":
- The heading "Public listings for {label}" with tag **External · advertised**.
- The range line: "Advertised $24,900–$29,400 across 6 listings", or "Not enough prices to show a range".
- Up to 6 rows: title (a link with `target="_blank" rel="noopener noreferrer"`), domain, advertised price or "no price shown", and a snippet in muted text.
- Footer: "Results via SerpAPI (Google), retrieved {local time}. Advertised prices are not offers. The comparison above uses its own scenario price, {usd(priceCents)}." Ask D to pass `priceCents` as an optional prop if wanted.

**`DealerList.tsx`** (`{ near }`), mounted on Next Move when `nextAction === "compare_confirmed_offers"`:
- "Toyota dealers near Austin": name, address, rating and website links.
- "Contact a dealer for a written quote. This app doesn't request one for you."

**States:** loading skeleton, `saved_fixture` badge, unavailable message. No layout shift: reserve the height.

### 3.6 Tests: `tests/market/*.test.ts`

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

## 4. Dependencies

| Need | From | By | If late |
|---|---|---|---|
| `ownerId`, `ownedStore`, `apiError`, `newRequestId` | C | H+0:45 | code to the signatures; `vi.mock("@/server/session")` in tests |
| Mount `BankingSyncBar`, `MarketResearch`, `DealerList` | D | windows 1–2 | D keeps the inline bar until then |
| C's compare route reads `banking_snapshots` keys `${personaId}:${mode}` | C | window 2 | agree the key format **now** (it is fixed here) |
| Nessie API key and HackTX sandbox status | Capital One table | H+0 | fixture path, labeled |

## 5. Banking hook and bar (replaces inline code in `NextMoveApp`)

`src/components/next-move/banking/useBankingSync.ts`:

```ts
export function useBankingSync(personaId: string): {
  bank: BankingSnapshot | null; mode: BankingSyncMode | null; stale: boolean; staleSince?: string;
  loading: boolean; error: (BankingSyncError["error"] & { cachedSandboxAvailable?: { retrievedAt: string } }) | null;
  sandboxReady: boolean;           // from GET /api/demo/customers
  sync: (mode: BankingSyncMode) => Promise<void>;
}
```

- Keep today's behavior exactly:
  - The initial fixture load on persona change.
  - The `latestPersona` race guard.
  - A failed read **keeps the earlier data** and says so.
- Add the stale path.

`BankingSyncBar.tsx` takes the hook's return value and renders:

- A status line, one of: "Banking: Nessie sandbox · retrieved 7:41 PM", or "Banking: Nessie-format fixture", or "**Stale** Nessie sandbox read from 7:12 PM".
- Buttons: **Use fixture** and **Sync from Nessie sandbox** (disabled with a reason when not configured).
- On error, an inline message plus, when available, **Use last sandbox read (7:12 PM)**.

Never auto-switch modes on error.

D then changes `NextMoveApp` to `const banking = useBankingSync(personaId)` and replaces the header tag "Banking · …" with the hook's `mode`/`stale`. Provide that diff in your PR description so D can paste it.

**Demo acceptance (with the sandbox up):** Maria on **Sync from Nessie sandbox** → the Money screen tag says "Nessie sandbox". The budget equals the fixture's or differs by the documented diff. Then add a $300 recurring bill through the Nessie API (curl, live during the demo or pre-recorded) → re-sync → the budget drops by $300 and the next action changes. That is the "Best use of Nessie" moment. Script it for D.

## 6. Handoff checklist

- [ ] §2.1 probe result posted in the team channel within 15 minutes (works / degraded / down).
- [ ] `banking-sync.ts` and `market.ts` contracts merged by H+1.
- [ ] Hardening, stale cache and tests B1–B7, B10–B11 by **window 1**.
- [ ] Seed route and the `NESSIE_CUSTOMERS` line shared (privately; it isn't a secret, but the key is) by **window 1** if the sandbox is up.
- [ ] Market routes, saved fixture and UI with M1–M9 by **window 2**.
- [ ] The diff for `NextMoveApp` integration handed to D.
- [ ] Demo script lines for D: the Nessie moment (§5), plus "Advertised listings via SerpAPI, retrieved at …; not offers."
