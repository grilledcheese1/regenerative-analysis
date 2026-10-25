# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new account holder walks through an interactive onboarding (car, how they pay, connect banking through Nessie, driving, a simulated Toyota Insurance connection, goals). It produces their own profile, and they land on `/home` with every screen populated from it.

**Architecture:** Onboarding answers are turned into a regular `Persona` plus a Nessie-shaped bank history by pure domain functions, so every existing calculation (budget, comparison, story, drives) works unchanged. "Connect your banking" seeds a fresh Nessie sandbox customer from the user's answers, reusing the curated-persona seeding code, then reads it back. Without a key or when Nessie fails, it uses the same history locally and says so. The profile is stored per account on the server (in memory) and mirrored in the browser. The browser re-sends it when the server has lost it, the pattern `src/server/store.ts` already documents.

**Tech Stack:** Next.js 16, React 19, motion, zod 4, vitest, Playwright. No new dependencies.

**Spec:** Conversation decisions of 2026-10-25: onboarding for anyone who doesn't pick a case study; Nessie connect = create a sandbox customer seeded from their answers (local fallback); Toyota Insurance = simulated connect labeled SIMULATED, with manual entry; drive info optional. Depends on `docs/superpowers/plans/2026-10-25-accounts-and-header.md` (Plan 1) being done.

## Global Constraints

- Everything the user didn't type or import is labeled: bank history `synthetic` (seeded from their answers), insurance policy `SIMULATED`, prices and rates for new cars `synthetic`. Never show "Toyota Insurance" without "(simulated)" next to it. README's "Planned, not built" stays true.
- Money is integer cents in contracts and domain code; the UI takes dollars.
- User persona id is `u_${accountId}`. Only the signed-in account may use its own `u_` id: any route given another account's `u_` id answers 404 `unknown_persona` (same as an unknown id).
- Demo date stays `DEMO_AS_OF` (`2026-10-24`) from `src/fixtures/personas.ts`; the seeded bank history covers the same July–October 2026 window as the fixtures, so `buildBudget` behaves identically.
- Nessie seeding must not block the UI for more than 45 s; show progress. On any Nessie failure, fall back to the local history with the reason shown, and never store a half-seeded customer id.
- Onboarding works at phone width with no horizontal scroll, and every step is keyboard reachable.
- Defaults the user can change, all labeled synthetic: horizon 36 months, gas $3.00/gal, finance 6.49% APR / 60 months, end value 65% of today's value. Candidates: the same two Maria has (`camry_hev_le_2025` 36-month lease and `corolla_hybrid_2025` finance, same numbers as `src/fixtures/personas.ts`). Maintenance $30/mo for cars 3 years old or newer, $60 for 4–8 years, $95 for older ones.

## Review Focus

1. **Spending answers above take-home pay:** the budget goes negative and the app shows "No option fits these constraints". No crash and no NaN anywhere. Test in Task 1.
2. **Unknown car value (user skips it):** `estimatedValueCents` is `unknown("Not provided during onboarding")`, end value falls back to 0 with a missing-input note, and owned or loan comparisons list "Sell and replace" under not considered, as they do today. Test in Task 1.
3. **Lease maturity date in the past, or more than 48 months away:** blocked in the Contract step with "Pick a date between today and 4 years from now". Test in Task 1 (validator) and Task 6 (UI).
4. **Server lost the profile (restart or another instance) while the browser has it:** `/home` re-sends it silently and renders. It never bounces a finished user back to onboarding. Test in Task 3 (route) and Task 7 (e2e by calling the reset hook).
5. **Nessie fails halfway through seeding:** the user sees "Couldn't finish connecting to Nessie: <reason>. Using the same history locally." and the profile records `mode: "fixture"` with no customer id. Test in Task 4.

---

### Task 1: Onboarding answers → persona and bank history (pure)

**Files:**
- Create: `src/contracts/onboarding.ts` (re-export from `src/contracts/index.ts`)
- Create: `src/domain/onboarding/persona.ts`, `src/domain/onboarding/banking.ts`, `src/domain/onboarding/insurance.ts`, `src/domain/onboarding/validate.ts`
- Modify: `src/fixtures/banking.ts`: export `type BankingSpec` (today's `Spec`) and `nessieBundlesFromSpec(id: string, spec: BankingSpec): NessieAccountBundle[]`. `nessieFixture(personaId)` becomes a lookup plus a call to it, with unchanged output (existing tests prove that).
- Test: `tests/onboarding/build.test.ts`

**Interfaces:**
- Produces:

```ts
// src/contracts/onboarding.ts
export interface OnboardingAnswers {
  name: string;
  car: { catalogId: string; odometerMiles: number; estimatedValueCents: Cents | null };
  contract:
    | { type: "owned" }
    | { type: "loan"; payoffCents: Cents; aprBps: number; paymentCents: Cents; remainingMonths: number }
    | { type: "lease"; maturityDate: string; paymentCents: Cents; totalAllowedMiles: number; excessCentsPerMile: number;
        purchaseOptionCents: Cents | null; dispositionFeeCents: Cents | null };
  money: { takeHomeMonthlyCents: Cents; housingCents: Cents; utilitiesCents: Cents; groceriesCents: Cents;
           diningShoppingCents: Cents; subscriptionsCents: Cents; checkingCents: Cents; savingsCents: Cents; cardBalanceCents: Cents };
  driving: { monthlyMiles: number; cityShare: number; source: "user_reported" | "observed" };
  insurance: { monthlyCents: Cents; source: "synthetic" | "user_reported"; policy: SimulatedPolicy | null };
  goals: { monthlySavingsGoalCents: Cents; monthlyBufferCents: Cents; protectedCashReserveCents: Cents;
           objective: Profile["objective"] };
}
export interface SimulatedPolicy { provider: "Toyota Insurance (simulated)"; policyNumber: string; coverage: string; monthlyCents: Cents }
export interface UserBanking { mode: "fixture" | "sandbox"; nessieCustomerId: string | null; connectedAt: string; note: string | null }
export interface UserProfile { accountId: string; personaId: string; answers: OnboardingAnswers; banking: UserBanking; updatedAt: string }
```

  - `buildUserPersona(accountId: string, a: OnboardingAnswers, asOf = DEMO_AS_OF): Persona`: id `u_${accountId}`; `summary` like `"Felix · 2021 RAV4 AWD, lease ending Mar 2027"` / `"…, loan, 21 payments left"` / `"…, paid off"`; `usage.routeId` = `"downtown"` if `cityShare >= 0.65`, `"hills"` if `<= 0.35`, else `"mixed"`; `vehicle.valuationSource` `"user_reported"`; scenario defaults from Global Constraints; `actionDate` = lease maturity or `"2026-11-01"`.
  - `bankingSpecFromAnswers(a: OnboardingAnswers, persona: Persona): BankingSpec`: two equal payroll deposits (`takeHome/2`, rounded to whole dollars because Nessie truncates); bills `"Housing rent"` day 1, `"Austin Energy electric"` day 12 (utilities), `"Auto lease payment"` / `"Auto loan payment"` day 24 when there's a contract payment, `"Auto insurance premium"` day 5; checking purchases `"Grocery market"` split on days 6 and 20, plus `"Gas station"` = fuel from `monthlyFuel(...)` on day 10; card purchases `"Dining and shopping"` day 9 and `"Subscriptions"` day 3; `savingsTransfer` = savings goal in dollars. The descriptions must hit the categorizer's rules in `src/server/providers/nessie-normalize.ts` (`auto lease|loan`, `gas station`, `auto insurance`).
  - `simulatedToyotaPolicy(catalogId: string, modelYear: number, odometerMiles: number): SimulatedPolicy`: deterministic. Base $130/mo, +$25 for RAV4 models, −$10 for hybrids, +$15 when the car is 2 years old or newer, −$15 when it's 10 or more years old. `policyNumber` = `"SIM-" + 6 digits` from a stable hash of the inputs; coverage `"Full coverage · $500 deductible"`.
  - `validateAnswers(a: Partial<OnboardingAnswers>, asOf = DEMO_AS_OF): Record<string, string>` (field path → message; empty when valid), covering Review Focus 3, negative amounts, `cityShare` in 0..1, `monthlyMiles` 0..10,000, and APR 0..30%.

- [ ] **Step 1: Write the failing tests**

```ts
const base: OnboardingAnswers = { /* Felix: 2021 RAV4 AWD, loan $14,000 payoff, 7.9% APR, $455/mo, 30 months;
  take-home $4,800, housing $1,500, utilities $120, groceries $450, dining/shopping $350, subscriptions $40,
  checking $3,200, savings $6,000, card $250; 900 mi/mo, 60% city; insurance $165 user_reported;
  goals $300 savings, $150 buffer, $3,000 reserve, minimize_cost */ };

it("builds a persona the comparison engine accepts", () => {
  const p = buildUserPersona("acct_0123456789abcdef", base);
  expect(p.id).toBe("u_acct_0123456789abcdef");
  expect(p.summary).toBe("Felix · 2021 RAV4 AWD, loan, 30 payments left");
  expect(p.usage.routeId).toBe("mixed");
  const bank = normalizeNessie("fixture_u", "fixture", nessieBundlesFromSpec(p.id, bankingSpecFromAnswers(base, p)));
  const { budget, comparison } = runScenario(p, bank, { gasCentsPerGallon: 300, monthlyMiles: 900, extraMonthlySpendingCents: 0, incomeConfirmed: true });
  expect(budget.recurringIncomeCents).toBe(480000);
  expect(comparison.options.length).toBeGreaterThan(0);
});
it("goes negative, not NaN, when spending exceeds income", () => { /* housingCents 600000 → vehicleBudgetCents < 0, recommendation.status "no_feasible_option" */ });
it("handles an unknown car value", () => { /* estimatedValueCents null → vehicle.estimatedValueCents.known false; comparison.notConsidered has "Sell and replace" for an owned car */ });
it("builds lease and owned summaries", () => { /* "…, lease ending Mar 2027" and "…, paid off" */ });
it("prices the simulated policy deterministically", () => {
  const a = simulatedToyotaPolicy("rav4_awd_2021", 2021, 61200);
  expect(a).toEqual(simulatedToyotaPolicy("rav4_awd_2021", 2021, 61200));
  expect(a.provider).toBe("Toyota Insurance (simulated)");
  expect(a.monthlyCents).toBe(15500);
});
it("rejects a lease maturity in the past", () => {
  expect(validateAnswers({ contract: { ...lease, maturityDate: "2026-01-01" } })["contract.maturityDate"]).toBe("Pick a date between today and 4 years from now");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/onboarding/build.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the four domain files and the `banking.ts` refactor (pure; no React/Next imports in `src/domain`).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS, including the existing banking and compare tests.
- [ ] **Step 5: Commit** `git commit -m "Build a persona and bank history from onboarding answers"`

### Task 2: Resolve user personas on the server

**Files:**
- Create: `src/server/profiles.ts`
- Modify: `src/server/providers/nessie.ts`: `fixtureSnapshot(personaId, spec?: BankingSpec)`; `fetchSandbox(personaId, customerIdOverride?: string)`.
- Modify: `src/app/api/options/compare/route.ts`, `src/app/api/banking/nessie/sync/route.ts`, `src/app/api/banking/summary/route.ts`, `src/app/api/imports/route.ts`, `src/app/api/demo/customers/route.ts`: replace `persona(id)` with `await personaForRequest(id)`. For a user, fixture banking comes from the stored spec and sandbox from `profile.banking.nessieCustomerId`. `/api/demo/customers` appends `{ id: "u_…", summary, sandboxAvailable }` for the signed-in user who has a profile.
- Test: `tests/onboarding/profiles.test.ts`

**Interfaces:**
- Consumes: Plan 1 `currentAccount()`; Task 1.
- Produces:
  - `userProfiles`: `ownedStore<StoredProfile>("user_profiles")` keyed by `accountId` (owner) with id `"profile"`, where `StoredProfile = { profile: UserProfile; persona: Persona; spec: BankingSpec }`.
  - `saveProfile(accountId: string, answers: OnboardingAnswers, banking: UserBanking): StoredProfile` (builds the persona and spec).
  - `personaForRequest(id: string): Promise<{ persona: Persona; stored: StoredProfile | null } | null>`: curated or generated personas first; `u_` ids only when they equal `u_${(await currentAccount())?.accountId}` and a stored profile exists.

- [ ] **Step 1: Write the failing tests** (route tests with the Plan 1 cookie jar): signed in as account A with a saved profile, `POST /api/options/compare` with `personaId: "u_<A>"` → 201 and a comparison whose `personaId` is `"u_<A>"`; the same request signed in as B → 400 `invalid_request` "Unknown persona"; banking sync `fixture` for `u_<A>` returns a snapshot whose `customerId` is `"fixture_u_<A>"`; `/api/demo/customers` lists `u_<A>` only for A.
- [ ] **Step 2: Run** `npx vitest run tests/onboarding/profiles.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS (Maria/Devon/Kai route tests unchanged).
- [ ] **Step 5: Commit** `git commit -m "Let the signed-in user's own persona flow through every route"`

### Task 3: Profile API and the browser mirror

**Files:**
- Create: `src/app/api/me/profile/route.ts`
- Create: `src/components/onboarding/useMyProfile.ts`
- Modify: `src/app/api/me/data/route.ts`: deleting demo data also removes the signed-in account's profile (the account itself stays).
- Test: `tests/onboarding/profile-route.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `GET /api/me/profile` → `200 { profile: UserProfile }`, `404 no_profile`, `401 signed_out`.
  - `PUT /api/me/profile` body `{ answers: OnboardingAnswers; banking: UserBanking }` → `200 { profile }`; `400` with `fieldErrors` from `validateAnswers`; `401 signed_out`.
  - `useMyProfile(): { status: "signed_out" | "loading" | "none" | "ready"; profile: UserProfile | null; persona: Persona | null; save(answers, banking): Promise<UserProfile> }`. It mirrors to `localStorage["regentic.profile." + accountId]` and, on a `404` with a local copy, PUTs it back before reporting `ready` (Review Focus 4). It builds `persona` client-side with `buildUserPersona` so screens don't wait for the server.

- [ ] **Step 1: Write the failing tests:** PUT then GET round-trips; GET signed out → 401; PUT with `monthlyMiles: -5` → 400 `fieldErrors["driving.monthlyMiles"]`; after `userProfiles.remove(A,"profile")` GET → 404, and a PUT of the same body restores it.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the route and hook.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Profile API with a browser copy that restores a lost server record"`

### Task 4: Connect banking through Nessie

**Files:**
- Modify: `src/server/providers/nessie-seed.ts`: extract `planBundles(bundles: NessieAccountBundle[], customer: { first_name: string; last_name: string }, runId: string): PersonaPlan` from `planPersona` (which now calls it), and make `seedPersona(plan)` work for any plan without looking the persona up again (pass the profile it needs).
- Create: `src/app/api/onboarding/connect-bank/route.ts`
- Test: `tests/onboarding/connect-bank.test.ts` (mock `fetch` like `tests/banking/seed.test.ts`)

**Interfaces:**
- Consumes: Tasks 1–3, Plan 1 `currentAccount()`.
- Produces: `POST /api/onboarding/connect-bank` body `{ answers: OnboardingAnswers }` (signed in) →
  `200 { banking: UserBanking; snapshot: BankingSnapshot; budget: BudgetSnapshot; steps: { label: string; count: number }[] }`.
  - With `NESSIE_API_KEY`: plan from `nessieBundlesFromSpec`, seed a customer named `{ first_name: name, last_name: "Regentic-" + runId }`, read it back with `fetchCustomer`, and return `mode: "sandbox"` with the id. `steps` lists accounts/deposits/bills/purchases/transfers written.
  - Without a key: `mode: "fixture"`, `note: "Nessie isn't configured on this server, so the same history was created locally."`
  - Nessie error at any point: `mode: "fixture"`, `nessieCustomerId: null`, `note: "Couldn't finish connecting to Nessie: <message>. Using the same history locally."` (Review Focus 5). The 45 s budget comes from an `AbortSignal.timeout(45_000)`.
  - It does not save the profile; the client saves it with Task 3 after the user continues.

- [ ] **Step 1: Write the failing tests:** no key → fixture with the note and a budget whose `recurringIncomeCents` equals take-home; mocked happy path → `sandbox` plus the id from the mocked `/customers` POST, with the `steps` counts; mocked failure on the 5th write → fixture, `nessieCustomerId: null`, note starting `"Couldn't finish connecting to Nessie"`; signed out → 401.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS, including `tests/banking/seed.test.ts`.
- [ ] **Step 5: Commit** `git commit -m "Seed a Nessie sandbox customer from onboarding answers"`

### Task 5: Screens accept the user's persona

**Files:**
- Modify: `src/components/story/NextMoveEntry.tsx`, `src/components/story/DetailsEntry.tsx`: with an account → `useMyProfile()`; `none` → `router.replace("/onboarding")`; `ready` → render with `persona` (an open case study still wins, per Plan 1).
- Modify: `src/components/story/Story.tsx`: prop `persona: Persona` instead of `personaId` (callers look curated ones up with `persona(id)`).
- Modify: `src/components/next-move/NextMoveApp.tsx`: props `{ people: Persona[]; initialPersonaId?: string }`. Account mode passes `[myPersona]` and hides the select (Plan 1 rule); case-study mode passes `PEOPLE`.
- Modify: `src/components/next-move/settings/SettingsScreen.tsx`: for a user persona, show "Edit my answers" linking to `/onboarding?edit=1`, and the banking connection (`Nessie sandbox · customer <id>` or the fixture note).

- [ ] **Step 1: Implement**; run `npm run typecheck && npx eslint src && npx vitest run`. Expected: PASS.
- [ ] **Step 2: Run** `npx playwright test e2e/shell.spec.ts`. Expected: PASS (case studies unchanged).
- [ ] **Step 3: Commit** `git commit -m "Render the signed-in user's own profile on the story and tabs"`

### Task 6: The onboarding wizard

**Files:**
- Replace: `src/app/onboarding/page.tsx` (Plan 1 placeholder) → renders `<Onboarding />`; signed out → redirect `/`.
- Create: `src/components/onboarding/Onboarding.tsx` (step state, progress rail, Back/Continue, draft saved to `sessionStorage["regentic.onboarding.draft"]`, `?edit=1` prefilled from the saved profile)
- Create: `src/components/onboarding/steps/{Welcome,Car,Contract,Bank,Driving,Insurance,Goals,Review}.tsx`
- Create: `src/components/onboarding/onboarding.module.css`

Step behavior (the interactive parts that matter):
- **Welcome:** "Hi {name}. Six short steps and your plan is ready." Shows what each step fills.
- **Car:** six catalog cards (name, year, mpg from `CATALOG`), odometer, "What's it worth?" (optional, with "I'm not sure").
- **Contract:** three big choices (Paid off / Loan / Lease) and only that branch's fields; `validateAnswers` messages inline.
- **Bank:** sliders/inputs for take-home pay and each spending line, plus balances. A live panel recomputes `buildBudget` on the locally built history **as they type** ("Your car budget: $612/mo"). Then a **"Connect with Nessie"** button calls Task 4 and shows a progress list ("Creating customer… Opening 3 accounts… Adding 4 months of deposits, bills and purchases… Reading it back…") animated from the returned `steps`, ending with the accounts and balances it found, the mode tag (`Nessie sandbox` or `Local copy`) and any `note`. Continuing requires a finished connect.
- **Driving:** monthly miles and city share sliders, and an optional "Import a drive", which renders the existing `ImportDrive` with `personaId` = the draft's `u_` id (the profile is saved after the Bank step, so `/api/imports` accepts it). An imported profile overwrites the sliders and sets `source: "observed"`.
- **Insurance:** "Connect Toyota Insurance (simulated)" → 1.2 s connecting state → policy card from `simulatedToyotaPolicy` with a SIMULATED badge and "Use this"; or "I'll enter it myself" (`source: "user_reported"`).
- **Goals:** savings goal, buffer, cash reserve, plus three objective cards ("Keep cash, then lowest cost" / "Lowest total cost" / "Lowest monthly payment").
- **Review:** each section summarized with Edit links; **Finish** → `save()` → `router.push("/home")`.

- [ ] **Step 1: Implement** the wizard and steps; run `npm run typecheck && npx eslint src`. Expected: PASS.
- [ ] **Step 2: Manual check** with `npm run dev` at 1280px and 390px: every step fits, the budget panel updates on input, the connect animation finishes, and Finish lands on `/home` showing the user's car on Home and their numbers on Cost.
- [ ] **Step 3: Commit** `git commit -m "Interactive onboarding: car, contract, Nessie banking, driving, insurance, goals"`

### Task 7: End-to-end coverage and docs

**Files:**
- Create: `e2e/onboarding.spec.ts`
- Modify: `README.md` (routes: `/onboarding`; env: `AUTH_SECRET`; data modes: user bank history is seeded from their answers; Toyota Insurance is simulated), `.env.example` if Plan 1 didn't add `AUTH_SECRET`.

- [ ] **Step 1: Write the tests**
  - `"new user finishes onboarding and sees their own numbers"`: sign up as Felix → `/onboarding` → choose RAV4 AWD, Loan (payoff 14000, APR 7.9, payment 455, 30 months) → Bank: take-home 4800, housing 1500, … → live panel shows `"Your car budget"` → Connect → `"Local copy"` tag (no key in e2e) and the note → Driving: 900 mi → Insurance: connect simulated → `"Toyota Insurance (simulated)"` and the `SIMULATED` badge → Goals → Finish → `/home`: header `"Felix ▾"`, no `Demo customer` select, Home shows `"2021 RAV4 AWD"`, Cost tab shows `"$4,800"` recurring income.
  - `"validation blocks a past lease end date"`: Lease with maturity `2026-01-01` → message shown, Continue disabled.
  - `"reload keeps the profile"`: after finishing, reload `/home` → same numbers, not `/onboarding`.
  - `"a signed-in user without a profile is sent to onboarding"`: sign up, open `/home` → URL `/onboarding`.
  - Mobile project: no horizontal overflow on every onboarding step.
- [ ] **Step 2: Run** `npx playwright test`. Expected: all pass (live-Nessie skips only).
- [ ] **Step 3: Run** `npm run typecheck && npx eslint src e2e tests && npm test && npm run build`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "E2E coverage and docs for onboarding"`
