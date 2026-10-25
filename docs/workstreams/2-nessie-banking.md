# Stream 2 — Live Nessie banking

**Owner:** _(name)_ · **Branch:** `ws/nessie-banking` · **Depends on:** nothing · **Version:** 2, 2026-10-24

**Goal:** Make the Capital One track undeniable. Three team-controlled Nessie sandbox customers are seeded from our fixtures, and the app reads them live. When a read fails, the user gets an explicit, labeled choice: the last good sandbox read (marked stale) or the fixture. Nessie-derived income and spending drive the vehicle budget and so the recommendation. This is already true for fixtures, and must be **demonstrably true for live sandbox data.**

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
| `DealerList` (3) | `src/components/next-move/market/DealerList.tsx` | `{ near: string }` | Next Move card, when `nextAction === "compare_confirmed_offers"` | Nothing else |
| `AiExplanation` (4, done) | `src/components/next-move/explain/AiExplanation.tsx` | `{ request, recommendation, evidence, onCite }` | Next Move card | Highlights cited evidence |

Today the stubs render nothing, or reproduce current behavior in the banking hook's case. **Replace the body; keep the file path, the default or named export and the props.**

### 0.8 Environment variables (all already in `.env.example`)

| Variable | Stream |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 4 (map) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (the committed `.env` sets `claude-sonnet-5-5`), `AI_DAILY_CAP` | 4 |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS`, `NESSIE_SEED_ALLOW` (dev only; never in Vercel) | 2 |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` | 3 |
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

## 1. Current state of your area (read these files first)

**`src/server/providers/nessie-normalize.ts`**
- Zod schemas for Nessie accounts, deposits, withdrawals, purchases, transfers and bills. **Amounts are dollars** and are converted to cents in normalization. Statuses are `pending | cancelled | completed | recurring | executed`, falling back to `pending`.
- `normalizeNessie(customerId, mode, bundles)` produces a `BankingSnapshot` with:
  - categories
  - internal-transfer detection through `counterpartAccountId`
  - bill-vs-purchase duplicate handling
  - refunds

  `src/domain/finance/budget.ts` → `buildBudget()` then applies the rules, and `tests/budget.test.ts` covers them. Both are stream 4's files: read them, don't edit them. Normalization is yours.

**`src/server/providers/nessie.ts`** (`server-only`)
- `get()` has an 8 s timeout and throws `NessieUnavailable(message, retryable)`.
- `sandboxCustomerId(personaId)` reads `NESSIE_CUSTOMERS="maria:<id>,devon:<id>,kai:<id>"`.
- `fetchSandbox(personaId)` reads accounts, then each account's five collections.
- `fixtureSnapshot(personaId)` normalizes `nessieFixture()` from `src/fixtures/banking.ts`.

**`src/app/api/banking/nessie/sync/route.ts`**
- Accepts `POST { personaId, mode }` with `mode: "fixture" | "sandbox"`.
  - Fixture → 200.
  - Sandbox → 200, or 503 `provider_not_configured`, or 502 `provider_error` / `provider_bad_response`. It never falls back silently.
- It **already stores** every successful read for the owner under `${personaId}:fixture` / `${personaId}:sandbox` (`bankingSnapshots` from `@/server/records`). It already returns `stale: false`.
- The server comparison route (`POST /api/options/compare`, finished) reads `${personaId}:sandbox` for both `sandbox` and `sandbox_cached` mode. **Keep writing exactly that key.**

**`src/app/api/demo/customers/route.ts`**
- Returns a `sandboxAvailable` flag per persona.

**`src/fixtures/banking.ts`**
- Per-persona `SPECS`: checking, savings and card balances, plus monthly income, bills, purchases, card purchases and a savings transfer. These are expanded July → Oct 22 2026 into Nessie-shaped records. The fixture **intentionally** includes an internal transfer, a card and its payment, a refund, a pending purchase, a cancelled item, and a bill that is also recorded as a purchase.

**`src/components/next-move/banking/useBankingSync.ts` and `BankingSyncBar.tsx`** (yours, already mounted)
- These were extracted from the shell with **today's behavior exactly**:
  - the initial fixture load on persona change
  - the `latestPersona` race guard
  - a failed read keeps the earlier data and says so
  - the bar shows "Banking loaded (fixture)" with **Use fixture** and **Sync from Nessie sandbox** (disabled with a reason when not configured)
- The shell calls `useBankingSync(personaId)`, renders `<BankingSyncBar {...state} />` and reads `mode` / `stale` for the header tag. You change only these two files (§3).

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

The contract already exists in `src/contracts/banking-sync.ts` (frozen; re-exported from `@/contracts`): `BankingSyncMode`, `BankingSyncResult`, `BankingSyncError` and `BankingSyncState`, which is the hook's return type.

Update `POST /api/banking/nessie/sync`:

- The body `mode` becomes `"fixture" | "sandbox" | "sandbox_cached"`.
- A **successful** read is already stored (`bankingSnapshots.put(owner, `${personaId}:${mode}`, snapshot)`). Keep that.
- On a **failed** sandbox read: same status codes as today, plus `cachedSandboxAvailable` if a cached read exists for this owner and persona.
- `mode: "sandbox_cached"` returns the stored snapshot with `stale: true, staleSince`, or 404 `no_cached_sandbox_read`.
- Never serve the cached read automatically after a failure: return the error plus the offer, and let the user choose.

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

## 3. Banking hook and bar (already mounted; finish them)

`src/components/next-move/banking/useBankingSync.ts`:

```ts
export function useBankingSync(personaId: string): {
  bank: BankingSnapshot | null; mode: BankingSyncMode | null; stale: boolean; staleSince?: string;
  loading: boolean; error: (BankingSyncError["error"] & { cachedSandboxAvailable?: { retrievedAt: string } }) | null;
  sandboxReady: boolean;           // from GET /api/demo/customers
  sync: (mode: BankingSyncMode) => Promise<void>;
}
```

The signature is fixed by `BankingSyncState`, and the shell already consumes it. Today the hook reproduces the old behavior. Your changes:
- On an error body carrying `cachedSandboxAvailable`, keep it on `error` (the hook already copies it through).
- `sync("sandbox_cached")` loads the stored read and sets `stale: true` and `staleSince`.
- A successful sandbox or fixture read clears `stale`.

`BankingSyncBar.tsx` takes the hook's return value and renders:

- A status line, one of: "Banking: Nessie sandbox · retrieved 7:41 PM", or "Banking: Nessie-format fixture", or "**Stale** Nessie sandbox read from 7:12 PM".
- Buttons: **Use fixture** and **Sync from Nessie sandbox** (disabled with a reason when not configured).
- On error, an inline message plus, when available, **Use last sandbox read (7:12 PM)**.

Never auto-switch modes on error.

The shell header already reads `stale` ("Banking · stale sandbox read") and `mode` ("Banking · Nessie sandbox"). Nothing to hand off.

**Demo acceptance (with the sandbox up):** Maria on **Sync from Nessie sandbox** → the header tag says "Banking · Nessie sandbox". The budget equals the fixture's or differs by the documented diff. Then add a $300 recurring bill through the Nessie API (curl, live during the demo or pre-recorded) → re-sync → the budget drops by $300 and the next action changes. That is the "Best use of Nessie" moment. Write it as a short script (exact curl and clicks) in `docs/demo/nessie-moment.md`, a file only you create. Stream 4 links it from the demo script.

## 4. Dependencies on other streams

**None.** Everything this stream uses already exists on `main`:
- `src/contracts/banking-sync.ts`
- `ownerId`, `ownedStore`, `bankingSnapshots`, `apiError`, `newRequestId` and `fieldErrors` from `src/server/`
- the mounted hook and bar
- the `NESSIE_*` variables in `.env.example`
- the cookie mock in `tests/server/cookies.ts`

The only external dependency is a Nessie API key from the Capital One table. Without one, the labeled fixture path is the demo, and it already works.

## 5. End-to-end: `e2e/nessie-banking.spec.ts` (Playwright, yours alone)

Deterministic by default: use `page.route("**/api/banking/nessie/sync", …)` to simulate sandbox responses. Put real-sandbox checks behind `test.skip(!process.env.E2E_LIVE)`.

| # | Spec | Steps → assertions |
|---|---|---|
| N1 | Fixture by default | `/next-move` → "Banking loaded (fixture)"; header "Banking · fixture" |
| N2 | Not configured | With no `NESSIE_*`: **Sync from Nessie sandbox** is disabled and its title explains why |
| N3 | Failure keeps data | Mock `/api/demo/customers` to mark maria `sandboxAvailable: true`, and the sync route to return 502 → error text plus "Still showing the earlier fixture data"; the budget is unchanged |
| N4 | Stale offer | Mock a 502 with `cachedSandboxAvailable` → **Use last sandbox read (time)** appears → click it (mock a `stale: true` response) → header "Banking · stale sandbox read" |
| N5 | Live (E2E_LIVE=1) | Real sync for maria → header "Banking · Nessie sandbox"; Money "Vehicle budget" shows the seeded value |

## 6. Done checklist

- [ ] §2.1 probe result posted in the team channel (works / degraded / down).
- [ ] Hardening, stale cache, `sandbox_cached` mode and tests B1–B7, B10–B11.
- [ ] Seed route with B8–B9, and the `NESSIE_CUSTOMERS` line shared privately if the sandbox is up.
- [ ] `GET /api/banking/summary` (P2).
- [ ] Hook and bar finished; N1–N4 pass (N5 when live).
- [ ] `docs/demo/nessie-moment.md` written.
