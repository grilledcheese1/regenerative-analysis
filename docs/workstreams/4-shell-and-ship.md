# Stream 4 — Shell, Settings, quality, deploy and demo

**Owner:** _(name)_ · **Branch:** `ws/shell-and-ship` · **Depends on:** nothing · **Version:** 2, 2026-10-24

**Goal:** Own the Next Move app everyone sees, and get it shipped:
- the Settings screen, polish, phone width and keyboard support
- visible, labeled failure states
- the shell's end-to-end tests
- README, deploy and the 3-minute demo
- the live check of the Claude explanation

The other three streams' components are already mounted in your shell, so you never wait for them and they never edit your files.

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

## 1. What's already done in your area

- **The shell is fully wired.**
  - `NextMoveApp.tsx` uses `useBankingSync` + `BankingSyncBar` (stream 2's files) and `runScenario()`.
  - It mounts `ImportDrive` (stream 1) on Drives, `MarketResearch` / `DealerList` (stream 3) on Compare and Next Move, and `AiExplanation` on Next Move.
  - It handles `onProfile`: monthly miles, city share and usage source.
  - It highlights cited evidence.
  - Header tags reflect banking mode (`fixture`, `Nessie sandbox`, `stale sandbox read`) and driving source (`modeled` or `imported`).

  The other streams' components land in their own files, and nothing here changes when they do.
- **Recommendations API and explanation are done** (`done-C-recommendations-ai.md`). You own them for fixes and prompt tuning.
- **Tooling:** `npm run check` and `npm run test:e2e` exist, `playwright.config.ts` is set up, and `e2e/shell.spec.ts` has 3 passing specs:
  - `/` and `/next-move` stay separate.
  - Maria reaches the next step, with a template explanation and no key.
  - Kai has no feasible option.
- **QA fixes already in:** the Money table alignment, the Home "Projected … miles" wording, and the persona `<select>` now has `id`/`name`.

## 2. Settings screen (a 6th tab, "Settings")

Add `"settings"` to `TABS` in `NextMoveApp.tsx`. Put `SettingsScreen` in `src/components/next-move/settings/SettingsScreen.tsx`, with a CSS module next to it. Sections:

1. **Vehicle and contract.** Read-only values from `persona.vehicle` and `persona.contract`, each with a `SourceChip`:
   - `odometerMiles` and `odometerObservedAt`
   - `estimatedValueCents`, shown as "unknown — {reason}" when unknown
   - Lease: maturity date, allowed miles, excess rate, purchase option, buyout quote
   - Loan: payoff, APR (bps → %), payment, remaining months

   Footer: "Editing vehicle and contract details is planned. The demo uses synthetic contracts."
2. **Connections:**
   - Banking: `mode`, `stale` and `bank.retrievedAt` from the `banking` state the shell already holds, with a **Sync** shortcut calling `banking.sync("sandbox")` (disabled when `!banking.sandboxReady`).
   - "Toyota vehicle records: **planned integration**", disabled, explained as "Requires a verified data format and permission".
   - "Insurer sharing: **planned integration**".
3. **Permissions** (live API, already built):
   - `GET /api/consents` on mount.
   - Toggles for "Use my imported drives for personal analysis" (`driving_analysis`) and "Use banking data for affordability" (`banking_analysis`) → `PUT /api/consents { purpose, granted }`.
   - Show each effective record's version and time.
   - The insurer toggle is disabled; if it is ever sent, the API answers 403 `purpose_not_available` with the message to show.
   - Note: "Turning a permission off stops future use; it doesn't erase what's already here. Use Delete below for that."
4. **Delete my demo data:**
   - A button opens a native `<dialog>` (focus moves in, Esc closes).
   - Confirm → `DELETE /api/me/data` → show "Deleted: {deleted.join(", ")}" or "Nothing stored yet".
   - Then reset client state: call `banking.sync("fixture")`, clear the imported usage (`onProfile(null)`), and bump a `key` on `ImportDrive` so it remounts empty.

## 3. QA and polish

| # | Item | Do |
|---|---|---|
| Q1 | `GET /favicon.ico` 404 on both pages | Add `src/app/icon.svg` (a teal dot, matching `.wordmark .dot`). It is shared with `/`, so tell the Regen Stream 4 owner. Check `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` |
| Q3 | The Drives map uses the team's `TripMapClient` (3D terrain; renders correctly) with a `RouteSvg` fallback, and `RouteMap` when there is no token | Verify in real Chrome and Safari and on a phone. Confirm the fallback appears with a blank token. Fixes inside `src/components/map/**` go to Regen Stream 3 |
| Q5 | Layout at 375 px | No horizontal page scroll. Tabs scroll horizontally (`overflow-x: auto`). The header wraps. Option cards are one column. Tables stay inside `overflow-x: auto` wrappers. Sliders get a full-width row |
| Q6 | Keyboard | Visible `:focus-visible` rings on tabs, buttons and links. Keep tabs as buttons with `aria-current`, or move fully to `role="tablist"` with arrow keys; don't mix the two |
| Q7 | Color independence | Every status already has text. Verify nothing relies on color alone, and add words or ▲/▼ where needed |
| Q8 | Reduced motion | `@media (prefers-reduced-motion: reduce)` stops transitions in the Next Move section |
| Q9 | Lighthouse | Accessibility ≥ 90 on `/next-move` Home and Compare. Fix `.muted` contrast if flagged |

(The coaching panel's `/api/coach` and `Panels.tsx` belong to Regen Coach. Report issues there; don't fix them here.)

## 4. Live AI check (once the Anthropic account has credits)

The key in the team shell is valid, but the account returned "credit balance is too low", so a live explanation has never run.

1. Add credits, or use another key in `.env.local`.
2. Open `/next-move` for Maria, Devon and Kai and wait on Next Move. The badge should read "Explained by Claude · every number checked against the calculation".
3. If it falls back, the server log line `{"at":"explain", …, "fallbackReason", "rejectedDetail"}` says why (for example `unsupported_number:6548`). Tune the **prompt** in `src/server/explain/prompt.ts` (and bump `PROMPT_VERSION` in `src/contracts/explain.ts`), not the validator. Re-run `npm test`; `tests/explain/**` must stay green.
4. Record pass/fail per persona in the demo script's Q&A notes.

The model comes from `ANTHROPIC_MODEL` (`claude-sonnet-5-5` in the committed `.env`), with low effort, a 10 s timeout, refusal fallbacks (`fallbacks: "default"`), a cache and a daily cap (`AI_DAILY_CAP`).

## 5. Failure states: each must be visible and labeled

Walk this matrix before the freeze and save a screenshot of each in `docs/demo/failures/` for the Q&A. **Rows for other streams' features become checkable once those features merge; until then mark them "n/a (not merged)". Never wait on them.**

| Failure | How to trigger | Expected on screen |
|---|---|---|
| Nessie not configured | unset `NESSIE_*` | Sync button disabled with its reason; fixture labeled |
| Nessie down after a good read (stream 2) | wrong `NESSIE_BASE_URL` after a sync | Error plus **Use last sandbox read (time)**; data stays and says so |
| AI not configured | unset `ANTHROPIC_API_KEY` | "Template explanation (AI explanation unavailable: not configured)" |
| AI out of credit or erroring | the current account | "… unavailable: service error" |
| Market unavailable (stream 3) | unset `SERPAPI_API_KEY`, no saved file | "Market search unavailable right now" |
| Map unavailable | blank `NEXT_PUBLIC_MAPBOX_TOKEN` | Static route preview |
| Import rejected (stream 1) | upload a `.gpx` with `<!DOCTYPE`, a 5 MiB file, or a `.zip` | Server message; nothing created |
| No feasible option | Kai | "No option fits these constraints" plus the review-budget step |
| Deleted data | Settings → Delete | App reloads the fixture and keeps working |

## 6. End-to-end: `e2e/shell.spec.ts` (yours alone)

Three specs exist. Add the rest. Use roles and text, not CSS classes. Every spec starts at `/next-move`.

| # | Spec | Steps → assertions |
|---|---|---|
| E2 | Changed input changes the result (Maria) | Money: move "New monthly expense" to $300 → Home "Vehicle budget" `$600` → the Next Move headline or next step differs from the default (match what `tests/compare.test.ts` expects) |
| E3 | Keep preferred (Devon) | Devon → Next Move shows the CTA "Keep the current car" |
| E5 | Sliders recompute | Compare: gas price to $4.50 → the first card's "Total monthly" text changes |
| E6 | Evidence visible | Next Move: "Monthly vehicle budget" with a "DERIVED" chip and the formula text |
| E7 | Persona switch resets | Maria +$300 → Devon → Maria → budget `$900` |
| E8 | Income confirmation | Money: check "Income estimate … looks right" → the notice disappears on every tab |
| E11 | Settings | Insurer toggle disabled; toggle driving analysis off/on and the effective time updates; Delete → dialog → confirm → "Deleted …" or "Nothing stored yet"; app still works |
| E12 | Mobile width | The `mobile` project runs the shell specs; on every tab `document.documentElement.scrollWidth <= window.innerWidth` |
| E13 | No console errors | Collect `page.on("console")` errors across all tabs → none |

## 7. README.md

Sections:

1. **What it is:** one paragraph, covering both pages (`/` Regen Coach, `/next-move` Next Move).
2. **Run it:** `npm install`, `cp .env.example .env.local`, `npm run dev`, `npm run check`, `npx playwright install chromium`, `npm run test:e2e`.
3. **Data modes and honesty notes:**
   - Banking: Nessie sandbox vs Nessie-format fixture vs stale read.
   - Driving: modeled replay vs imported vs synthetic samples.
   - Offers: synthetic. Market listings are advertised, not offers.
   - The AI explanation is checked against the calculation.
4. **Architecture:** `domain/` is pure, `server/` holds helpers and providers, `app/api` holds routes, and `components/next-move` holds the screens and per-stream folders.
5. **Environment variables:** the table in §0.8.
6. **Planned, not built:** Toyota or Insure Connect import, insurer partnership, lender quotes, native recording, durable persistence.
7. **Workstream docs:** link to `docs/workstreams/`.

## 8. Demo script: `docs/demo-script.md`

Three minutes, with the **exact clicks and the line spoken** for each beat. Every beat that uses another stream's feature has a **fallback line**, so rehearsals never wait on a merge.

| Time | Beat | Screen and clicks | Fallback if that feature isn't merged |
|---|---|---|---|
| 0:00–0:20 | Problem | Home (Maria): 2,100 miles over, lease ends in four months | — |
| 0:20–0:50 | Driving and current cost | Drives: import the `maria-commute-am`/`pm` samples (stream 1), then the replay | Replay only: "The regen figures are modeled, not measured" |
| 0:50–1:30 | Nessie affordability | Money: income − spending − savings − buffer = $900; **Sync from Nessie sandbox**; the live $300-bill moment from `docs/demo/nessie-moment.md` (stream 2) | Fixture: move "New monthly expense" to $300 and show the next action change |
| 1:30–2:20 | Compare plus a changed scenario | Compare: three options, economic cost vs cash; move gas or miles; "See listings" (stream 3); then Kai (nothing fits) and Devon (keep) | Skip listings |
| 2:20–2:40 | Next step and evidence | Next Move: the Claude badge, evidence highlights, the official TFS link | Template explanation: "Claude only explains; if it isn't available we show the calculated template" |
| 2:40–3:00 | Sponsor value and roadmap | Settings: planned Toyota and insurer integrations | — |

Also include:

- **Q&A crib:**
  - observed vs modeled vs synthetic
  - why a new hybrid may not pay off (Devon)
  - why GPS can't measure battery recovery
  - what an insurer or Toyota integration would need
  - Nessie is a sandbox, not a bank connection or credit bureau
  - advertised price vs scenario price
  - "Claude only explains: the decision is computed in code, and every number Claude writes is checked against the calculation. If it invents one, we show the template instead."
- **Backups:** a recorded video, screenshots of every beat, and the offline fixture path.
- **Rehearsal log:** two full runs on another device after the freeze.

## 9. Deploy and release

- **Vercel:** the user runs `! npx vercel login` themselves, since it is interactive. Then `npx vercel link`, then a preview deploy.
- **Env vars in Vercel:** every variable in `.env.example` that's available. **Never `NESSIE_SEED_ALLOW`.** Restrict the Mapbox token to the deployed domains.
- **Before the final deploy:**
  - `npm run check` and `npm run test:e2e` are green on `main`.
  - `grep -rE "sk-ant|NESSIE_API_KEY|SERPAPI" .next/static` is empty.
  - `/next-move` works on a phone across all tabs × three personas, and `/` is still Regen Coach.
- **Rollback:** Vercel "Promote previous deployment".
- **Submission text:** names Toyota, Capital One (Best use of Nessie) and SerpAPI, plus Novice if eligible. Roadmap items are worded as planned.

## 10. Dependencies on other streams

**None.** Everything this stream uses exists on `main`: the wired shell, the live consents and data-deletion routes, the explanation component, Playwright, and the full `.env.example`. Other streams' features only add rows to the failure matrix and beats to the demo script, and both have fallbacks.

## 11. Done checklist

- [ ] Settings screen (§2), with E11 passing.
- [ ] Q1, Q3, Q5–Q9.
- [ ] Live AI check (§4) once credits exist; prompt tuned if needed.
- [ ] Failure matrix screenshots (§5).
- [ ] Shell e2e E2–E13 green on both projects.
- [ ] README (§7) and the demo script with fallbacks (§8).
- [ ] Preview deployed early; final deploy and two rehearsals (§9).
