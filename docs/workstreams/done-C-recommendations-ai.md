> **Status: done** (commit `b8194ba`, wired into the shell by the parallel scaffold). Kept as the reference for what the recommendations API and explanation do. **Its schedule, ownership table and handoffs are superseded:** see `1-drive-imports.md` … `4-shell-and-ship.md` §0, where stream 4 now owns this code.
>
> **Decisions (2026-10-24):** storage stays in memory; client re-send covers the demo. Streaming is skipped because only fully validated explanations may be shown. **Still open:** the live Claude check (§8). The account had no API credits; the steps are in `4-shell-and-ship.md` §4.

# Workstream C — Server platform, recommendations API and grounded AI explanation

**Owner:** _(name)_ · **Branch:** `ws/c-recommendation-ai` · **Version:** 1, 2026-10-24

**Goal:** Three deliverables.

1. **Shared server primitives everyone depends on:** session, owner-scoped store and HTTP helpers. These come first, by H+0:45.
2. **A server-side, reproducible comparison and recommendation API.** Immutable snapshots, owner-scoped, idempotent, computed by the **same** pure functions the client uses so the figures reconcile everywhere.
3. **A Claude explanation that is grounded and checked.** The domain layer decides; Claude only explains. Every number Claude writes must appear in the evidence we sent, the next action must be unchanged, and there are no invented approvals or discounts. Anything else falls back to the deterministic template, which is labeled.

You also own the domain finance and recommendation code, `src/contracts/index.ts`, consents, and data deletion.

## 0. Shared rules (identical in all four workstream documents)

### 0.1 Where we are (verified 2026-10-24 ~7 pm)

The Next Move vertical slice works end to end with fixture banking:

- **Domain:** `src/domain/finance/{budget,loan,lease,fuel}.ts` and `src/domain/recommendations/{compare,rank,recommend}.ts`. These are pure functions using integer cents.
- **Fixtures:** `src/fixtures/{personas,catalog,banking}.ts`, with the three personas Maria, Devon and Kai.
- **Nessie adapter:** `src/server/providers/nessie.ts` (server-only fetch, sandbox reads) and `nessie-normalize.ts` (zod schemas and normalization).
- **API:** `GET /api/demo/customers` and `POST /api/banking/nessie/sync` (`{ personaId, mode: "fixture" | "sandbox" }`). The older `POST /api/coach` is still used by the Drives coaching panel in `src/components/Panels.tsx`.
- **Routes:** Next Move is its own page at **`/next-move`** (`src/app/next-move/page.tsx`). **`/` stays the team's Regen Coach dashboard** (`src/app/page.tsx` → `src/components/Dashboard.tsx`). Keep them separate: don't link, redirect or restyle `/` from Next Move work.
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
| `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, new `Settings` screen, `src/app/next-move/**`, the Next Move section of `src/app/globals.css` (after `/* ---------- Next Move shell ---------- */`), `src/components/{DrivesView,Panels,RouteMap,RouteSvg,Timeline}.tsx`, `scripts/fetch-demo-routes.mjs` (writes `src/data/routes.json`), `package.json` scripts, `.env.example`, `README.md`, `playwright.config.ts`, `e2e/**`, deployment, demo script | **D** |

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

**In-memory caveat.** Vercel instances don't share memory, so server records are best-effort. The client keeps working state. Any route that needs a missing server record returns `409 { code: "<thing>_not_found_resync" }` and the client re-sends its inputs.

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

`AGENTS.md` on `main` defines four **Regen Coach** streams (1 Physics and Scoring, 2 Data and API, 3 Map and Charts, 4 UI, Theme and Pitch) and their file ownership. Those rules still govern the Regen Coach dashboard at `/`, including `src/app/page.tsx`, `src/app/layout.tsx` and `src/components/Dashboard.tsx`. The Next Move Drives tab reuses its replay components. These Next Move workstreams (A–D) **do not edit** Regen Coach files:

- `src/lib/physics/**`, `src/config/regen.config.ts`, `src/lib/trip/**`
- `src/components/map/**`, `src/components/charts/**`
- `data/**`, `simulated_user_data/**`, `scripts/fetch-routes.mjs`
- the existing routes `src/app/api/{routes,trips,compare}/**`
- the root page and layout `src/app/{page,layout}.tsx`, and `src/components/Dashboard.tsx`

`Panels`, `RouteMap`, `RouteSvg` and `Timeline` are used by both `/` and the Drives tab. Any change to them must keep `/` working; check both pages.

Next Move uses its own paths (`/api/drives`, `/api/options/compare`, …), so nothing collides. If a Next Move feature needs a change there, ask that Regen stream's owner. Stream D coordinates the two sets of owners at each integration window.

---

## 1. Current state of your area

**`src/domain/recommendations/compare.ts`**
- `compareOptions({ persona, budget, catalog, asOf, overrides: { gasCentsPerGallon?, monthlyMiles? } })` → `Comparison`, which includes:
  - `options`
  - `preparation`, the months to the action date
  - `notConsidered`
  - `sensitivity` (±10% ending values)
  - `evidence: EvidenceFact[]`
  - `recommendation`
- Fuel uses `persona.usage.cityShare` today. Evidence ids in use include `vehicle_budget`, `recurring_income`, `available_upfront_cash`, `monthly_miles`, `gas_price`, `current_mpg`, `lease_end_date`, `projected_mileage`, `mileage_overage`, `purchase_option` and `payoff`.

**`src/domain/recommendations/recommend.ts`**
- `recommend(c, persona, budget)` produces a template `Recommendation` with `status`, `selectedOptionId`, `nextAction`, `headline`, `explanation[]`, `evidenceIds`, `missingInputs` and `explanationMode: "template"`.

**`src/domain/recommendations/rank.ts`**
- `rankOptions(options, objective)`.

**Client shell (D's file)**
- `NextMoveApp.tsx` builds the budget like this:
  ```ts
  buildBudget(bank, { ...persona.profile, manualObligations: [...persona.profile.manualObligations, ...(extra ? [{ label: "New monthly expense", monthlyCents: extra }] : [])] }, DEMO_AS_OF)
  ```
  then calls `compareOptions({ persona, budget, catalog: CATALOG, asOf: DEMO_AS_OF, overrides: { gasCentsPerGallon, monthlyMiles } })`.

**`POST /api/coach`**
- The legacy Regen tip, used by `src/components/Panels.tsx`. Leave it alone; it is D's area.

**Claude key**
- `src/lib/env.ts` → `serverEnv().anthropicApiKey` and `anthropicModel`. The default model is `claude-sonnet-5-5`. `@anthropic-ai/sdk@^1.3.0` is installed.

**Before writing any Claude code, load the `claude-api` skill** (or read the SDK README in `node_modules/@anthropic-ai/sdk`). Use it to confirm the current request shape for structured JSON output, or else for forced tool use, plus timeouts and error classes **for the installed SDK version**. Don't rely on memory.

---

## 2. Shared primitives (P0, merge to `vishruth` by H+0:45)

Implement exactly the signatures in §0.6. Notes:

- **`session.ts`:**
  ```ts
  const jar = await cookies();
  let id = jar.get("nm_sid")?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    jar.set("nm_sid", id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7, secure: process.env.NODE_ENV === "production" });
  }
  ```
  Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` first. Setting cookies is allowed in route handlers.
- **`store.ts`:**
  - Use a `globalThis.__nmStores ??= new Map<string, Map<string, Map<string, {v, at}>>>()` (store → owner → id).
  - `list` is sorted by `at` descending.
  - `maxPerOwner` evicts the oldest.
  - The registry powers `deleteOwnerData`.
- **`http.ts`:**
  - `newRequestId()` = `"req_" + crypto.randomUUID().slice(0, 8)`.
  - `apiError` returns `Response.json({ error: {...} }, { status })`.
  - `withIdempotency`:
    - Read the `Idempotency-Key` header. If it is absent, just run.
    - Body hash = sha256 of the raw text.
    - Use the `idempotency` store, keyed by `${route}:${key}` for the owner. It holds `{ bodyHash, status, body }`.
    - Same hash → replay the stored response with header `Idempotent-Replay: true`. Different hash → 409 `idempotency_conflict`.
    - Store only 2xx responses.
- Tests in `tests/server/primitives.test.ts`: two owners isolated; eviction; `deleteOwnerData` clears every registered store; idempotent replay and conflict. Mock `next/headers` `cookies()` with `vi.mock`.

Post in the team channel when this is merged, with the SHA.

## 3. Contract changes (P0, by H+1; you own `index.ts`)

1. **`CompareInputs.overrides`** gains `cityShare?: number` (0..1) and `usageSource?: SourceKind`.
   - In `compareOptions`, use `overrides.cityShare ?? persona.usage.cityShare` for fuel.
   - The `monthly_miles` evidence fact uses `overrides.usageSource ?? persona.usage.source`.
   - Add a `city_share` evidence fact (`display: "62% city"`). Its source is `modeled` when it came from trips, otherwise the persona's.
   - Keep every existing test green. Add one test: a `cityShare` override changes `monthlyRunningCents` in the expected direction for a hybrid (city MPG ≥ highway MPG).
2. **`Recommendation.explanationMode`** becomes `"template" | "ai"`. The domain still always returns `"template"`. Only the server explainer sets `"ai"`, on the stored copy.
3. **New `src/contracts/explain.ts`** (append the export line):

```ts
import type { BankingSyncMode } from "./banking-sync"; // B's file; if not merged yet, inline: "fixture" | "sandbox" | "sandbox_cached"
import type { Comparison, NextAction, Recommendation, SourceKind } from "./index";

export const PROMPT_VERSION = "explain-1";

export interface ScenarioInputs {
  gasCentsPerGallon: number;
  monthlyMiles: number;
  cityShare?: number;
  usageSource?: SourceKind;
  extraMonthlySpendingCents: number;
  incomeConfirmed: boolean;
}
export interface CompareRequest {
  schemaVersion: "1.0";
  personaId: string;
  bankingMode: BankingSyncMode;
  scenario: ScenarioInputs;
}
export interface CompareResponse { requestId: string; comparisonId: string; comparison: Comparison }

export interface Explanation {
  mode: "ai" | "template";
  promptVersion: string;
  model: string | null;
  summary: string;              // ≤ 600 chars
  tradeoffs: string[];          // ≤ 3
  missingInfo: string[];        // ≤ 3
  nextAction: NextAction;       // always equals recommendation.nextAction
  citedEvidenceIds: string[];
  fallbackReason?: "not_configured" | "timeout" | "provider_error" | "daily_cap" | "validation_failed";
  rejectedDetail?: string;      // e.g. "unsupported_number:$412" (developer-facing; UI shows a generic line)
  generatedAt: string;
  cacheHit: boolean;
}
export interface RecommendationRecord {
  requestId: string;
  recommendationId: string;
  comparisonId: string;
  recommendation: Recommendation;
  explanation: Explanation;
}
```

## 4. One scenario function for client and server (P0, by window 1)

Create `src/domain/recommendations/scenario.ts`:

```ts
export function runScenario(persona: Persona, bank: BankingSnapshot, s: ScenarioInputs, asOf = DEMO_AS_OF):
  { budget: BudgetSnapshot; comparison: Comparison }
```

It does exactly what `NextMoveApp` does today. The manual obligation label stays `"New monthly expense"`, and you pass `overrides { gasCentsPerGallon, monthlyMiles, cityShare, usageSource }`. D then replaces the two `useMemo`s with one call to `runScenario`. Write the replacement snippet in your PR. This is the **reconciliation guarantee:** the server and the screens compute the same numbers.

Test: for each persona and the fixture snapshot, `runScenario` deep-equals the old two-step computation.

## 5. Comparison and recommendation routes (P1, by window 2)

### 5.1 `POST /api/options/compare`
Takes a `CompareRequest` (zod; `schemaVersion` must be `"1.0"`, otherwise 400) and is wrapped in `withIdempotency`.

1. `owner = await ownerId()`. The persona must exist → otherwise 400 `fieldErrors.personaId`.
2. **Banking:**
   - `fixture` → `fixtureSnapshot(personaId)` (from `@/server/providers/nessie`).
   - `sandbox` → `ownedStore<BankingSnapshot>("banking_snapshots").get(owner, \`${personaId}:sandbox\`)`.
   - `sandbox_cached` → the same key. B writes it on every successful sandbox sync.
   - Missing → **409 `banking_not_loaded_resync`**, so the client re-syncs and retries. Never substitute the fixture.
3. `{ budget, comparison } = runScenario(...)`.
4. `comparisonId = "cmp_" + sha256(canonicalJson({ req, bank: { customerId, mode, retrievedAt }, MODEL_VERSION })).slice(0, 16)`. `canonicalJson` sorts keys recursively.
5. Store it immutably (`put` only if absent) → 201, or 200 when it already exists: `CompareResponse`.

### 5.2 `POST /api/recommendations`
Takes `{ comparisonId: string, explain?: boolean }`, default `explain: true`.

- Comparison not found for the owner → 409 `comparison_not_found_resync`.
- `explanation = explain ? await explainer.explain(comparison) : templateExplanation(comparison)`.
- `recommendationId = "rec_" + sha256(comparisonId + PROMPT_VERSION + (explanation.model ?? "template")).slice(0, 16)`.
- Store `RecommendationRecord` → 201.
- The `recommendation` in the record is the domain one. If the AI passed validation, set `explanationMode: "ai"` on the stored copy. **Never** change `selectedOptionId`, `nextAction` or `status`.

### 5.3 `GET /api/recommendations/[id]`
`const { id } = await ctx.params`. Owner-scoped → the record, or 404.

## 6. The explainer: `src/server/explain/` (P1, by window 2)

Files: `bundle.ts`, `prompt.ts`, `validate.ts`, `explainer.ts`, `template.ts`.

### 6.1 `bundle.ts` → `buildEvidenceBundle(c: Comparison)`

This is what Claude sees, and **nothing else**:

```ts
{
  horizonMonths, actionDate,
  preparation: c.preparation && { months, cash: usd(cashCents), note },
  decision: { status, selectedOptionId, nextAction, headline },     // fixed, from the domain
  options: c.options.map(o => ({
    optionId, label, feasible, exclusions, missingInputs, tradeoff,
    upfrontCash: usd(o.upfrontCashCents), totalMonthly: usd(o.totalMonthlyCents) + "/mo",
    budgetLeft: usd(o.monthlyRemainingCents), cashOutOverHorizon: usd(o.netCashOutflowCents),
    debtAtHorizon: usd(o.endingDebtCents), equityAtHorizon: usd(o.endingEquityCents),
    economicCost: usd(o.economicCostCents) })),
  evidence: c.evidence.map(e => ({ id, label, display, source })),
  sensitivity: c.sensitivity, notConsidered: c.notConsidered,
  allowedNextAction: c.recommendation.nextAction,
}
```

Use the **same `usd()` formatting the UI uses** (`src/domain/format.ts`). Then the numbers Claude repeats match the screen character for character.

**Excluded:**
- raw transactions and account ids
- coordinates and trip points
- market listing text (it is untrusted; see B's doc)
- persona display names beyond the first name already in the option labels

`evidenceHash = sha256(canonicalJson(bundle))`.

### 6.2 `prompt.ts`

- **System prompt (versioned `PROMPT_VERSION`):** "You explain a vehicle-ownership comparison that has already been calculated. The decision and every number are fixed. Explain why the decision follows, the main tradeoffs, and what information is missing. Rules:
  - use only numbers that appear in the supplied data, written exactly as given
  - do not recommend a different option or action
  - cite evidence ids you rely on
  - say "synthetic" for synthetic inputs
  - never claim an approval, eligibility, quote, booking, discount or guaranteed saving
  - plain English, no more than 90 words in summary"
- **User content:** `JSON.stringify(bundle)`.
- **Output schema** (enforce with structured output or a single forced tool, per the skill):

  ```
  { summary: string, tradeoffs: string[≤3], missingInfo: string[≤3], nextAction: NextAction enum,
    recommendedOptionId: string | null, citedEvidenceIds: string[≥1] }
  ```
- `max_tokens` ≈ 600. Low temperature if the API exposes it for the model. Check the skill; some models restrict sampling params.

### 6.3 `validate.ts` → `validateExplanation(output, bundle): { ok: true } | { ok: false; detail: string }`

Run these in order and stop at the first failure:

1. **Shape:** zod-parse the output → `bad_shape`.
2. **Decision unchanged:** `nextAction === bundle.decision.nextAction` → otherwise `changed_next_action`. `recommendedOptionId === bundle.decision.selectedOptionId` → otherwise `changed_option`.
3. **Citations:** `citedEvidenceIds` ⊆ (evidence ids ∪ option ids) and non-empty → `unknown_evidence:<id>`.
4. **Numbers:**
   - Tokenize all output strings with `/\$?\d[\d,]*(?:\.\d+)?%?/g`.
   - Normalize each token: drop `$` and `,`, strip a trailing `.00`, keep `%`.
   - Build the allowed set by tokenizing **every string value in the bundle** the same way. Recursively walk the JSON.
   - Ignore tokens that are a single digit 0–9. Every other token must be in the allowed set → `unsupported_number:<token>`.
   - This catches invented figures, and also arithmetic Claude did itself ("$6,548 more"). That is fine: the template already includes that runner-up gap in the explanation lines. Make sure it is in the bundle via `c.recommendation.explanation`, and add `templateLines: c.recommendation.explanation` to the bundle.
5. **Prohibited claims:** `/\b(pre-?approved|approved|pre-?qualified|you qualify|guarantee[sd]?|locked[- ]in|booked|appointment (is|has been) (set|made)|discount of)\b/i` → `prohibited_claim`.
6. **Lengths:** summary ≤ 600 chars, each list item ≤ 200 → `too_long`.

### 6.4 `explainer.ts` → `createExplainer({ client?, model?, now?, dailyCap? })`

Inject the client so tests can fake it. Its `explain(c)` method returns an `Explanation`:

- **No key** → `templateExplanation(c, "not_configured")`. This is **not** an HTTP error.
- **Cache:** a module `Map` keyed by `sha256(comparisonId + PROMPT_VERSION + model + evidenceHash)`. A hit returns `{ ...cached, cacheHit: true }`.
- **Daily cap** (`AI_DAILY_CAP`, default 50; the counter resets at UTC midnight) → template `daily_cap`.
- **Call** with a 10 s timeout (SDK option or `AbortSignal.timeout`):
  - timeout → `timeout`
  - SDK or API error → `provider_error`
  - validation failure → `validation_failed` with `rejectedDetail`
- **Log** `requestId`, `comparisonId`, model, duration, `fallbackReason` and `rejectedDetail`. Never the bundle or the output text.
- **Success** → `mode: "ai"`. Cache it.

`template.ts` → `templateExplanation(c, reason?)`:

- `summary` = `headline + " " + explanation[0]`
- `tradeoffs` = `explanation.slice(1, 4)`
- `missingInfo` = `missingInputs` turned into words (`confirmed_buyout_taxes_and_fees` → "Confirmed buyout taxes and fees")
- `nextAction` = the domain's
- `citedEvidenceIds` = `recommendation.evidenceIds`
- `mode: "template"`, `model: null`

### 6.5 `src/components/next-move/explain/AiExplanation.tsx`

Props: `{ request: CompareRequest; recommendation: Recommendation; evidence: EvidenceFact[]; onCite?: (ids: string[]) => void }`. `onCite` is an optional addition to §0.7. D passes it to set `EvidenceList`'s `highlight`.

**Behavior:**
- Render the **template explanation immediately**, built client-side from `recommendation`, so there is no empty state.
- Debounce 800 ms on `request` changes, since sliders move fast. Then `POST /api/options/compare` → `POST /api/recommendations`.
  - On 409 `banking_not_loaded_resync`, show "Re-sync banking to refresh the explanation". Don't loop.
  - On 409 `comparison_not_found_resync`, retry once from compare.
- When a record arrives:
  - **`mode: "ai"`** → show the summary, tradeoffs and missing info, with the badge **"Explained by Claude · every number checked against the calculation"**, and call `onCite(citedEvidenceIds)`.
  - **`mode: "template"`** → keep the template, with the muted line "Template explanation (AI explanation unavailable: {friendly reason})".
- Abort in-flight requests on change (`AbortController`).
- `aria-live="polite"` on the swap.
- Styles in `AiExplanation.module.css`.

**Never show AI text that differs from the domain decision.** The validator guarantees this, and the UI also checks `record.recommendation.nextAction === props.recommendation.nextAction` before swapping.

## 7. Consents and data deletion (P2, by window 2; D builds the Settings UI on these)

**`GET /api/consents`** → `{ requestId, effective: Record<Purpose, { granted: boolean; version; at } | null>, history: ConsentRecord[] }`

**`PUT /api/consents`**
- Body `{ purpose: "driving_analysis" | "banking_analysis" | "insurer_sharing", granted: boolean }`.
- `insurer_sharing` with `granted: true` → **403 `purpose_not_available`** ("Planned integration. No insurer receives data from this demo").
- Records are appended `{ purpose, granted, version: "consent-1", at, source: "settings_screen" }`.
- Revocation stops future use only. Say so in the response `note`.

**`DELETE /api/me/data`** → `deleteOwnerData(owner)` → `{ requestId, state: "complete", deleted: string[] }`.

Put the contract types in `explain.ts` or a small `consent.ts`. You own both; append the export line.

## 8. Tests

`tests/explain/*.test.ts`, `tests/server/*.test.ts`:

| # | Test | Expected |
|---|---|---|
| C1 | Primitives (§2) | isolation, eviction, deletion, idempotency replay and conflict |
| C2 | `runScenario` parity for maria, devon and kai | deep-equal to the current two-step computation |
| C3 | `cityShare` override | fuel moves in the right direction; `city_share` evidence present |
| C4 | Compare route, sandbox mode with nothing stored | 409 `banking_not_loaded_resync` (no fixture substitution) |
| C5 | Compare route called twice, same inputs | same `comparisonId`; second returns 200 |
| C6 | Owner B `GET /api/recommendations/{A's}` | 404 |
| C7 | Fake client returns a different `nextAction` | template, `validation_failed`, `changed_next_action` |
| C8 | Fake client writes "$412" not in the bundle | template, `unsupported_number:412` |
| C9 | Fake client cites `made_up_id` | template, `unknown_evidence:made_up_id` |
| C10 | Fake client says "you are pre-approved" | template, `prohibited_claim` |
| C11 | Fake client returns a valid output | `mode: "ai"`; a second call is a cache hit |
| C12 | Fake client hangs (fake timers) | template `timeout` within 10 s |
| C13 | No API key | template `not_configured`; route still 201 |
| C14 | Cap reached | template `daily_cap` |
| C15 | Bundle has no transactions, coordinates or listing text | assert on keys (deep scan for `transactions`, `lat`, `snippet`) |
| C16 | Consent `insurer_sharing: true` | 403; history unchanged |
| C17 | Existing 29 tests | still green |

**Live check (manual, once the key is set):** with Maria, Devon and Kai, a real Claude call passes validation on each. If validation keeps rejecting real outputs for one reason, adjust the **prompt** (e.g. "repeat numbers exactly as written"), not the validator. Record pass/fail counts in the PR.

## 9. Dependencies

| Need | From | By |
|---|---|---|
| `banking_snapshots` written on sync (`${personaId}:sandbox`, `${personaId}:fixture`) | B | window 2 (you can test with direct `put`) |
| `BankingSyncMode` type | B (`banking-sync.ts`) | H+1; inline the union if late |
| `DrivingProfile` → `scenario.cityShare` / `usageSource` | A | uses your H+1 override change |
| Mount `AiExplanation`; swap `useMemo`s for `runScenario` | D | windows 2–3 |

## 10. Stretch goals (only after §8 is green)

1. **Explanation streaming.** Not built: only fully validated explanations may be shown.

## 11. Handoff checklist

- [x] §2 primitives merged by **H+0:45**, SHA posted.
- [x] §3 contract changes merged by **H+1**, field names posted.
- [x] §4 `runScenario` with the C2 test by **window 1**, and the snippet for D.
- [x] §5–6 routes, explainer and component with C4–C15 by **window 2**.
- [x] §7 consents and deletion by **window 2**.
- [x] Demo line for D: "Claude only explains. The decision is computed in code, and every number Claude writes is checked against the calculation. If it invents one, we show the template instead."
