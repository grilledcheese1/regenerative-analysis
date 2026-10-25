# Workstream D — Shell, integration, quality, deployment and demo

**Owner:** _(name)_ · **Branch:** `ws/d-shell-ship` · **Version:** 1, 2026-10-24

**Goal:** Own the app everyone sees.

- Start the team: baseline commit, env registry, early deploy.
- Integrate A, B and C's components into the shell at fixed windows.
- Add the Settings screen.
- Make every failure state visible and labeled.
- Make it work at phone width and by keyboard.
- Write the end-to-end tests.
- Ship to Vercel.
- Write and rehearse the 3-minute demo.

You are also the merge owner for `vishruth`.

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
| `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, new `Settings` screen, `src/app/**` pages/layout/icon, `src/app/globals.css`, `src/components/{DrivesView,Panels,RouteMap,RouteSvg,Timeline}.tsx`, `scripts/fetch-demo-routes.mjs` (writes `src/data/routes.json`), `package.json` scripts, `.env.example`, `README.md`, `playwright.config.ts`, `e2e/**`, deployment, demo script | **D** |

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

## 1. H+0 kickoff tasks (do these before anything else, ~30 min)

1. **Baseline commit: done.** Next Move and the team's Regen Coach work were merged on `main`. The QA fixes from tonight (Money table alignment, Home "Projected … miles" wording) are included. Run `npm run check` once on `main` to confirm your setup.
2. **`.env.example`:** replace it with the full registry from §0.8, a comment per variable and no values. Keep `.env` (non-secret defaults) as is.
3. **Scripts in `package.json`:** add `"test:e2e": "playwright test"` and `"check": "npm run lint && npm run typecheck && npm test && npm run build"`.
4. **First deploy (Vercel):**
   - The user runs `! npx vercel login` themselves. It is interactive.
   - Then `npx vercel link` and `npx vercel --prod=false`.
   - Set env vars in the Vercel project: `NEXT_PUBLIC_MAPBOX_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and later `NESSIE_*` (never `NESSIE_SEED_ALLOW`), `SERPAPI_API_KEY`, the caps and `IMPORT_MAX_BYTES`.
   - In the Mapbox dashboard, add the preview and production domains to the token's URL restrictions.
   - Post the preview URL. Redeploy after each integration window.
5. **Placeholders** for every mount point in §0.7, so integration later is a one-line swap. Each is a small component with the same props that renders the current behavior.

## 2. Integration windows (H+3, H+6, H+8)

For each window:

1. Pull each stream's branch.
2. Check the stream ran `npm run check` on a rebased branch.
3. Merge in this order: **C (primitives and contracts) → B → A → C (API and UI)**.
4. Run `npm run check` and `npm run test:e2e`.
5. Click through all six tabs × three personas.
6. Deploy, and post what landed and what's next.

If a branch breaks `check`, don't merge it. Send it back with the failing output.

### 2.1 Swaps you will make in `NextMoveApp.tsx` / `screens.tsx`

| From | Swap | Source of the snippet |
|---|---|---|
| B | `const banking = useBankingSync(personaId)` replaces `sync`, `mode`, `bank`, `syncError`, `loading`, `sandboxIds` and the demo-customers effect. `<BankingSyncBar {...banking} />` replaces the inline `.sync-bar` markup. The header tag reads the hook's `mode`/`stale` ("Banking · Nessie sandbox", "Banking · fixture" or "Banking · stale sandbox read") | B's PR description |
| C | Replace the `budget` + `comparison` `useMemo`s with one `useMemo(() => bank ? runScenario(persona, bank, scenario) : null, …)`, where `scenario: ScenarioInputs = { gasCentsPerGallon: gasCents, monthlyMiles, cityShare, usageSource, extraMonthlySpendingCents, incomeConfirmed }` | C's PR |
| A | New shell state `cityShare: number \| null` and `usageSource: SourceKind \| null`, reset in `selectPersona`. Mount `<ImportDrive personaId vehicleLabel onProfile>` at the top of the Drives tab, above `DrivesView`. Wire `onProfile` exactly as in A's doc §6 | A's doc §6 |
| B | In `CompareScreen` option cards where `o.catalogId && (o.kind === "lease_new" \|\| o.kind === "purchase_new")`: `<details><summary>See listings</summary><MarketResearch catalogId={o.catalogId} label={o.label} /></details>` | B's doc §3.5 |
| B | In `NextMoveScreen`, when `recommendation.nextAction === "compare_confirmed_offers"`: `<DealerList near="Austin, TX" />` under the next-step card | B's doc §3.5 |
| C | In `NextMoveScreen`, replace the template footer with `<AiExplanation request={compareRequest} recommendation={comparison.recommendation} evidence={comparison.evidence} onCite={setHighlight} />`, and pass `highlight` to `EvidenceList`. The shell builds `compareRequest` from `personaId`, `banking.mode` and `scenario` | C's doc §6.5 |

Persona switching must reset **all** scenario state: extra spending, income confirmation, gas, miles, `cityShare`, `usageSource` and highlight. Today `selectPersona` does most of this. Extend it.

## 3. Settings screen (the 6th tab, "Settings")

Add `"settings"` to `TABS` and put `SettingsScreen` in `screens.tsx` or a new `settings.tsx` that you own. Its sections:

1. **Vehicle and contract.** Read-only values from `persona.vehicle` and `persona.contract`, each with a `SourceChip`:
   - `odometerMiles` and `odometerObservedAt`
   - `estimatedValueCents`, shown as "unknown — reason" when unknown
   - Lease: maturity date, allowed miles, excess rate, purchase option, buyout quote
   - Loan: payoff, APR (bps → %), payment, remaining months

   Footer: "Editing vehicle and contract details is planned. The demo uses synthetic contracts."
2. **Connections:**
   - Banking: the current mode and retrieved time from `useBankingSync`, with a **Sync** shortcut.
   - "Toyota vehicle records: **planned integration**", disabled, with the explanation "Requires a verified data format and permission".
   - "Insurer sharing: **planned integration**".
3. **Permissions:**
   - Toggles for "Use my imported drives for personal analysis" and "Use banking data for affordability", driven by `GET/PUT /api/consents` (C).
   - The insurer-sharing toggle is disabled and shows the 403 message.
   - Show the effective version and time.
   - Note: "Turning a permission off stops future use; it doesn't erase what's already here. Use Delete below for that."
4. **Delete my demo data:** a button with a confirm dialog (native `<dialog>`, focus trapped, Esc closes) → `DELETE /api/me/data` → on success, clear the client state (`setBank(null)`, re-sync the fixture, clear imported trips through A's component by remounting it with a `key` bump), then show "Deleted: imports, trips, banking_snapshots, …".

## 4. QA fixes and polish (known issues, verified tonight)

| # | Issue | Fix |
|---|---|---|
| Q1 | `GET /favicon.ico` 404 | Add `src/app/icon.svg` (a teal dot, matching `.wordmark .dot`). Check the Next 16 metadata docs: `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` |
| Q2 | Console issue "A form field element should have an id or name attribute" | Add `id="persona"` and `name="persona"` to the persona `<select>`; audit the other inputs (sliders, checkbox) |
| Q3 | The Drives map now uses the team's `TripMapClient` (3D terrain; it renders correctly, verified after the merge) with a `RouteSvg` fallback, and `RouteMap` when there is no token | Verify in real Chrome and Safari and on a phone. Confirm the fallback appears when the map errors (`map.on("error")`) or the token is blank, as the plan requires ("a static route preview if map tiles fail"). Coordinate any `src/components/map/**` change with Regen Stream 3 |
| Q4 | `/api/coach` returns 500 with no explanation when there is no key, and has no timeout | In `Panels.tsx`, show "Coaching tip unavailable (no AI key configured)". In the route, add an 8 s timeout and return `503 { error: { code: "provider_not_configured", … } }` |
| Q5 | Full-page layout at 375 px | No horizontal page scroll. Tabs scroll horizontally (`overflow-x: auto`, `scroll-snap`). The header wraps (wordmark / select / tags). Option cards are 1 column. Tables stay inside `overflow-x: auto` wrappers. Sliders get a full-width row |
| Q6 | Keyboard | Visible `:focus-visible` rings on tabs, buttons and links. Tabs use `role="tablist"`/`tab`/`tabpanel` with arrow-key movement, or keep buttons with `aria-current`, but don't mix the two. `Esc` closes dialogs |
| Q7 | Color independence | Every status already has text (chips, "LEADING", "NEEDS INFORMATION"). Verify that nothing relies on color alone, such as the red and green numbers in the regen table. Add ▲/▼ or words where needed |
| Q8 | Reduced motion | `@media (prefers-reduced-motion: reduce)` disables the replay auto-animation and transitions |
| Q9 | Lighthouse | Accessibility ≥ 90 on Home and Compare. Fix contrast on `.muted` text if flagged |

## 5. Failure states: each must be visible and labeled (engineering guide step 12)

Walk this matrix after windows 2 and 3. Record a screenshot of each in `docs/demo/failures/` for the Q&A.

| Failure | How to trigger | Expected on screen |
|---|---|---|
| Nessie not configured | unset `NESSIE_*` | Sync button disabled with its reason; fixture labeled |
| Nessie down after a good read | block the host / wrong `NESSIE_BASE_URL` | Error plus **Use last sandbox read (time)**; data stays the old data and says so |
| AI not configured or timing out | unset `ANTHROPIC_API_KEY` | Template explanation with "AI explanation unavailable: not configured" |
| AI output rejected | C exposes `?forceBadAi=1` in dev only, if they add it; otherwise rely on C's unit tests | Template plus a generic note |
| Market unavailable | unset `SERPAPI_API_KEY`, no saved fixture | "Market search unavailable right now" |
| Market saved results | unset the key, saved fixture present | "Saved search from {date}" badge |
| Map unavailable | blank `NEXT_PUBLIC_MAPBOX_TOKEN` | Static `RouteSvg` preview plus "Map tiles unavailable" |
| Import rejected | upload a `.gpx` with `<!DOCTYPE`, a 5 MiB file, or a `.zip` | Server message; nothing created |
| Sparse import | `sparse-no-time.gpx` sample | "Route and mileage only" and no events |
| No feasible option | Kai | "No option fits these constraints" plus the review-budget step |

## 6. End-to-end tests (Playwright)

**Setup:**
- `npm install --save-exact -D @playwright/test@<current>` then `npx playwright install chromium`.
- `playwright.config.ts`:
  - `webServer: { command: "npm run build && npm run start -- -p 3100", url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 180_000 }`
  - `use: { baseURL: "http://localhost:3100" }`
  - projects `chromium` and `mobile` (`devices["Pixel 7"]`)
- Tests run with **no provider keys** by default, using fixture, template and saved results, so they are deterministic. Put live-provider checks in `e2e/live.spec.ts`, skipped unless `E2E_LIVE=1`.
- Exclude `e2e/` from Vitest (`vitest.config.ts` `exclude`) and from `tsc` if needed.

**Use roles and text, not CSS classes:** `page.getByRole("button", { name: "Next Move" })` and `getByLabel("Demo customer")`.

| # | Spec | Steps → assertions |
|---|---|---|
| E1 | Main journey (Maria) | Load `/` → "Banking loaded (fixture)" → Money: the "Vehicle budget" row reads `$900` → check "Income estimate … looks right" → the notice disappears → Compare: 3 option cards, first is "LEADING" → Next Move: heading "Leading option: Buy out the 2024 Camry Hybrid LE", status "NEEDS INFORMATION", the link "Open Toyota Financial Services lease-end options" has `target=_blank` and an `https://www.toyotafinancial.com/` href |
| E2 | Changed input changes the result (Maria) | Money: move "New monthly expense" to $300 → Home "Vehicle budget" `$600` → Next Move headline or next step differs from E1's (assert against the value `tests/compare.test.ts` expects) |
| E3 | Keep preferred (Devon) | Select Devon → Next Move: keep recommended (`keep_current_plan`), with the CTA "Keep the current car" |
| E4 | No feasible option (Kai) | Select Kai → Next Move heading "No option fits these constraints", step "Review the budget" |
| E5 | Sliders recompute | Compare: set Gas price to $4.50 → the first card's "Total monthly" text changes |
| E6 | Evidence visible | Next Move: the evidence list contains "Monthly vehicle budget" with a "DERIVED" chip and the formula text |
| E7 | Persona switch resets | Maria with +$300 → switch to Devon → back to Maria → budget `$900` |
| E8 | Import preview, cancel, confirm (after A lands) | Drives: "Try a sample drive" → `maria-commute-am.gpx` → preview shows "Route, mileage, speed" → Cancel → gone → again → check "I was driving" → Confirm → appears in the trip list |
| E9 | Imported usage changes Compare (after A and C) | E8 with both Maria samples, weekly form 10 trips → Use for comparison → Compare monthly miles label shows the new value; `monthly_miles` evidence formula mentions trips |
| E10 | Unsafe upload | Upload `e2e/fixtures/xxe.gpx` through the file input → the error message, no preview |
| E11 | Settings | Insurer toggle disabled; Delete my demo data → dialog → confirm → "Deleted" message, and the app still works (fixture reloads) |
| E12 | Mobile width | `mobile` project: E1 passes, and `document.documentElement.scrollWidth <= window.innerWidth` on every tab |
| E13 | Missing env messaging | No Mapbox token: Drives shows the static preview and the "Map tiles unavailable" text; no uncaught console errors (`page.on("console")` collects errors and asserts none) |

## 7. README.md rewrite

Sections:

1. **What it is:** one paragraph.
2. **Run it:** `npm install`, `cp .env.example .env.local`, `npm run dev`, then `npm run check` and `npm run test:e2e`.
3. **Data modes and honesty notes:**
   - Banking: Nessie sandbox vs Nessie-format fixture.
   - Driving: modeled replay vs imported vs synthetic samples.
   - Offers: synthetic. Market listings are advertised, not offers.
   - The AI explanation is checked against the calculation.
4. **Architecture:** `domain/` is pure, `server/providers` are adapters, `app/api` are routes, `components/next-move` are screens.
5. **Environment variables:** the table from §0.8.
6. **What is planned, not built:** Toyota or Insure Connect import, insurer partnership, lender quotes, native recording, Supabase persistence (unless C lands it).
7. **Tests:** what the 29+ unit tests and the e2e specs cover.
8. **Workstream docs:** link to `docs/workstreams/`.

## 8. Demo script: `docs/demo-script.md` (draft by window 2, final after freeze)

Three minutes. Write the **exact clicks and the line spoken** for each beat:

| Time | Beat | Screen and clicks | Key line |
|---|---|---|---|
| 0:00–0:20 | Problem | Home (Maria) | "Maria's lease ends in four months and she's on track to go 2,100 miles over. The real question is what to do next, not how she drives." |
| 0:20–0:50 | Driving and current cost | Drives: import `maria-commute-am`/`pm` samples (A), then the Regen replay; back to Home | "We show only what the file supports. This is a synthetic sample from a real Austin route. The regen figures are modeled, not measured." |
| 0:50–1:30 | Nessie affordability | Money: point at income − spending − savings − buffer = $900, and the excluded transfers. **Sync from Nessie sandbox.** If B's §5 live moment is ready: add a $300 bill in Nessie → re-sync → the budget drops → the next action changes | "Nessie data materially changes the budget, and through it the recommendation." |
| 1:30–2:20 | Compare plus a changed scenario | Compare: three options, economic cost vs cash. Move gas or miles. "See listings" (SerpAPI). Then Kai: no option fits. Devon: keep | "Same driving, every option. Keeping can win. Sometimes nothing fits, and we say so." |
| 2:20–2:40 | Next step and evidence | Next Move: Claude explanation badge, evidence chips, the official TFS link | "Claude only explains. The decision is computed, and every number is checked." |
| 2:40–3:00 | Sponsor value and roadmap | Settings: planned Toyota and insurer integrations | "A future Toyota Insure Connect partnership could enrich this with authorized vehicle data. That's roadmap, not built." |

Then add these sections:

- **Q&A crib** (one or two sentences each, with the honest answers from the product plan):
  - observed vs modeled vs synthetic
  - why a new hybrid may not pay off (Devon)
  - why GPS can't measure battery recovery
  - what an insurer or Toyota integration would need
  - what Nessie is and isn't (sandbox, not a bank connection or credit bureau)
  - why the advertised listing price differs from the scenario price
- **Backups:**
  - a recorded run-through video, saved to the team drive and linked here
  - screenshots of every beat
  - the fixture mode works offline except the map, which falls back to SVG
  - know which persona to switch to if a provider fails mid-demo
- **Rehearsal log:** two full runs on **another device** after the freeze, with the time taken and the problems found.

## 9. Release checklist (before the final deploy)

- [ ] `npm run check` and `npm run test:e2e` green on `vishruth` HEAD.
- [ ] The Vercel env has every needed variable. `NESSIE_SEED_ALLOW` is **absent**. The Mapbox token is URL-restricted.
- [ ] The production URL loads on a phone. All six tabs × three personas click through.
- [ ] §5 failure matrix verified on the deployed URL (as far as env allows).
- [ ] No secrets in the client bundle: `grep -r "sk-ant\|NESSIE_API_KEY\|SERPAPI" .next/static` is empty.
- [ ] The rollback path is known: Vercel "Promote previous deployment".
- [ ] Track submission text mentions Toyota, Capital One (Best use of Nessie) and SerpAPI, plus Novice if eligible. The roadmap items are worded as planned.

## 10. Handoff checklist

- [ ] H+0: baseline SHA posted, `.env.example` and scripts merged, preview URL posted.
- [ ] Placeholders for all §0.7 mount points by H+1.
- [ ] Window 1: Settings screen (§3), Q1–Q4, E1–E7.
- [ ] Window 2: all swaps (§2.1) for what has landed; Q5–Q9; E8–E13 as dependencies land; README; demo script draft.
- [ ] Window 3: failure matrix (§5), final deploy, then two rehearsals after the freeze.
