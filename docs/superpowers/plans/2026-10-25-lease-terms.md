# Lease Terms, Reliability and a Mid-lease Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lease options offer 12/24/36/48-month terms compared by average monthly cost over each term's own length, the app picks the best one (with NHTSA reliability as a tie-breaker and a warranty note), and a new case study shows a mid-lease switch that wins.

**Architecture:** Pure lease-term math in `src/domain/finance/lease-terms.ts`, NHTSA counts as a committed fixture read by `src/domain/reliability.ts`, and `compareOptions` expanding each lease candidate into term results, choosing the cheapest feasible term, and ranking every option by average monthly economic cost. A mid-lease branch runs only when the lease contract carries `earlyPayoffCents` and `tradeInValueCents`.

**Tech Stack:** TypeScript domain code, Next.js 16, vitest, Playwright, Node script for NHTSA (public API, no key).

**Spec:** `docs/superpowers/specs/2026-10-25-lease-terms-and-switching-design.md` (read "Calls made after the builder review" and "Update before building": they override earlier sections).

## Global Constraints

- Terms offered: 12, 24, 36, 48 months. Average monthly cost = (due at signing + payment × term + disposition fee + projected mileage overage + running costs × term − equity applied) ÷ term.
- Candidate lease mileage allowance: 12,000 mi/year, 15¢ per excess mile (synthetic). Projected miles = monthly miles × term.
- Money factor by credit tier (added to the offer's base): super prime −0.00015, prime 0, near prime +0.00050, subprime +0.00110, deep subprime +0.00180. APR equivalent shown = MF × 2400.
- Reliability tie-break: when a feasible runner-up is within 2,500 cents/mo of the leader on the ranked monthly figure and has fewer NHTSA complaints (recalls as second key), it ranks first; the explanation names the counts.
- Warranty note when an option's period > 36 months, or its projected miles over the period > 36,000: "Repairs after 3 years or 36,000 miles aren't covered by Toyota's basic warranty."
- Ranking key: `lowest_monthly` → `totalMonthlyCents`; otherwise `avgMonthlyCostCents` (leases: over their term; everything else: `economicCostCents ÷ horizonMonths`).
- Picking a different term on screen is a display what-if; ranking and the recommendation use the app's pick (cheapest feasible term; if none feasible, cheapest).
- Month-to-month extension at lease end is shown as information (current payment, up to 6 months), never ranked.
- Mid-lease branch only when the lease contract has both `earlyPayoffCents` and `tradeInValueCents`. Equity = trade-in − early payoff; positive equity reduces the new due at signing (excess is cash back); negative equity is paid in cash, never rolled in.
- Devon's and Kai's outcomes must not change; Maria's may (update her tests and `docs/demo-script.md`).
- All prices, residuals, money factors, payoff and trade-in values are synthetic and labeled so; NHTSA counts are `observed` with their retrieval date; no runtime NHTSA calls.

## Review Focus

1. **A term that isn't affordable at any length** (every term fails budget or upfront cash): the car still shows, represented by its cheapest term, excluded with the reason; no crash. Test in Task 3.
2. **Unknown monthly miles or zero miles**: overage 0, no NaN in averages. Test in Task 2.
3. **Negative trade-in equity mid-lease**: the shortfall shows as upfront cash and the switch is excluded if cash can't cover it. Test in Task 4.
4. **Catalog car with no NHTSA record** (fetch failed or new model): reliability shows "No NHTSA data", tie-break skipped for that pair. Test in Task 1.
5. **Generated case studies with lease candidates** (single-term legacy fields): still work, converted to a one-term table. Test in Task 3.

---

### Task 1: NHTSA reliability fixture

**Files:**
- Create: `scripts/fetch-reliability.mjs`, `src/fixtures/reliability.json` (generated), `src/domain/reliability.ts`
- Test: `tests/lease/reliability.test.ts`

**Interfaces:**
- Produces: `interface ReliabilityInfo { catalogId: string; recalls: number | null; complaints: number | null; retrievedAt: string; source: "observed" }`; `reliabilityFor(catalogId: string): ReliabilityInfo` (unknown catalog or failed fetch → `recalls: null, complaints: null`); `moreReliable(a: ReliabilityInfo, b: ReliabilityInfo): -1 | 0 | 1` (fewer complaints wins, then fewer recalls; any null → 0).
- Script: for each `CATALOG` car, GET `https://api.nhtsa.gov/recalls/recallsByVehicle?make=toyota&model=<model>&modelYear=<year>` (`Count`) and `https://api.nhtsa.gov/complaints/complaintsByVehicle?...` (`count`). Model names: Camry, Corolla, RAV4 (strip "Hybrid", "LE", "AWD").

- [ ] **Step 1:** Write tests: every catalog car has an entry with `retrievedAt`; `reliabilityFor("nope").complaints` is null; `moreReliable` orders by complaints then recalls and returns 0 when a value is null.
- [ ] **Step 2:** Run `npx vitest run tests/lease/reliability.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write and run the script (`node scripts/fetch-reliability.mjs`), implement `src/domain/reliability.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `git commit -m "Add NHTSA recall and complaint counts for the catalog cars"`

### Task 2: Lease term math

**Files:**
- Create: `src/domain/finance/lease-terms.ts`
- Modify: `src/domain/credit/config.ts` (`LEASE_MF_TIER_ADJ: Record<CreditTier, number>`), `src/contracts/index.ts` (types below)
- Test: `tests/lease/terms.test.ts`

**Interfaces:**
- Produces (contracts):
  - `interface LeaseTermOffer { termMonths: 12 | 24 | 36 | 48; moneyFactor: number; residualCents: Cents; dueAtSigningCents: Cents }`
  - `interface LeaseTermResult { termMonths: number; moneyFactor: number; aprEquivalentPct: number; paymentCents: Cents; dueAtSigningCents: Cents; mileageOverageCents: Cents; avgMonthlyCostCents: Cents; totalMonthlyCents: Cents; feasible: boolean; exclusion: string | null; pastWarranty: boolean }`
  - `CandidateTerms.leaseTerms?: LeaseTermOffer[]` (new); legacy `leaseTermMonths/moneyFactor/residualCents` still accepted.
- Produces (domain): `leaseOffers(c: CandidateTerms): LeaseTermOffer[]` (legacy → one offer); `leaseTermResult(input: { capCostCents: Cents; offer: LeaseTermOffer; mfAdjust: number; monthlyRunningCents: Cents; monthlyMiles: number; dispositionFeeCents: Cents; equityAppliedCents: Cents; extraUpfrontCents: Cents; budgetCents: Cents; availableUpfrontCents: Cents }): LeaseTermResult`; `pickTerm(results: LeaseTermResult[]): LeaseTermResult` (cheapest feasible by `avgMonthlyCostCents`, else cheapest).

- [ ] **Step 1:** Write tests: a 36-month offer's payment equals `leasePayment(cap, residual, 36, mf)`; average includes due-at-signing ÷ term (a $1,800 due at signing adds $50/mo at 36 months); 1,000 mi/mo over 24 months with 24,000 allowed → overage 0, 1,500 mi/mo → 12,000 excess × 15¢ = $1,800 → +$75/mo; MF tier adjust raises the payment; 48-month term → `pastWarranty` true; zero miles → overage 0 and finite averages (Review Focus 2); `pickTerm` prefers a feasible pricier term over an infeasible cheaper one; legacy candidate → one offer.
- [ ] **Step 2:** Run `npx vitest run tests/lease/terms.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `git commit -m "Lease term math: average monthly cost over each term's own length"`

### Task 3: Terms, average-monthly ranking and reliability in the comparison

**Files:**
- Modify: `src/contracts/index.ts` (`OptionResult` gains `avgMonthlyCostCents: Cents`, `lease?: { chosenTermMonths: number; terms: LeaseTermResult[] }`, `reliability?: ReliabilityInfo`, `warranty?: string`), `src/domain/recommendations/compare.ts`, `src/domain/recommendations/rank.ts`, `src/fixtures/personas.ts` (Maria's lease candidate gets a four-term table: base MF 0.00200 at 36 mo; 12 mo MF 0.00165 residual 82% due $1,500; 24 mo MF 0.00185 residual 68% due $1,500; 36 mo MF 0.00200 residual 60% due $1,500; 48 mo MF 0.00215 residual 50% due $1,500 — synthetic)
- Test: `tests/lease/compare-terms.test.ts`; update `tests/compare.test.ts`, `tests/scenario.test.ts` and e2e expectations that change for Maria only

**Interfaces:**
- Consumes: Tasks 1–2; existing `CreditProfile`/`underwrite` (lease decision: `purpose` add `"lease"`, amount = cap cost − due at signing, collateral = cap cost; vehicle "new").
- Produces: `rankOptions(options, objective): OptionResult[]` now sorts by the Global Constraints key and applies the reliability tie-break; `rankWithTieBreak(options, objective): { ranked: OptionResult[]; tieBreak: { winner: string; loser: string } | null }` (rank.ts) for the recommendation. `Comparison.prequalification` unchanged.

- [ ] **Step 1:** Write tests: Maria's lease option has 4 terms and `chosenTermMonths` is the cheapest feasible; its `avgMonthlyCostCents` matches that term; non-lease options have `avgMonthlyCostCents === Math.round(economicCostCents / 36)`; Devon's and Kai's recommendation headlines and leaders are unchanged; a candidate whose every term exceeds the budget still appears, excluded (Review Focus 1); a generated person with a legacy lease candidate gets one term (Review Focus 5); reliability is attached to every option with a `catalogId`; a 48-month pick carries the warranty note; tie-break: two options within $25/mo, the one with fewer complaints ranks first.
- [ ] **Step 2:** Run `npx vitest run tests/lease`. Expected: FAIL.
- [ ] **Step 3:** Implement; update changed expectations (Maria) in existing unit tests.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit `git commit -m "Compare lease terms by average monthly cost, with reliability as a tie-break"`

### Task 4: Mid-lease switch and the fourth case study

**Files:**
- Modify: `src/contracts/index.ts` (lease contract gains `earlyPayoffCents?: Cents; tradeInValueCents?: Cents`; `OptionResult.kind` gains `"switch_now"`; `OptionResult.switchMath?: { earlyPayoffCents: Cents; tradeInValueCents: Cents; equityCents: Cents; dueAtSigningAfterEquityCents: Cents; cashBackCents: Cents; continueAvgMonthlyCents: Cents; savingsPerMonthCents: Cents }`), `src/domain/recommendations/compare.ts`, `src/fixtures/personas.ts` (Jordan), `src/fixtures/banking.ts` (Jordan's spec and credit 735 with an "auto lease" record)
- Test: `tests/lease/switch.test.ts`

**Interfaces:**
- Mid-lease options: "Continue the lease to {maturity}" (kind `keep`; remaining payments + running to maturity + disposition + projected overage, averaged over the remaining months) and, per candidate, "Switch now: lease {car}" / "Switch now: finance {car}" (kind `switch_now`, equity per Global Constraints). `actionDate` = `DEMO_AS_OF`; `preparation` null.
- Jordan (synthetic): 2025 RAV4 Hybrid AWD, leased 2025-04-24 for 36 months, payment $612, MF 0.00310, 36,000 mi allowed, 15¢/mi, disposition $350, early payoff $27,400, trade-in $29,900, 1,050 mi/mo; candidates: Corolla Hybrid 2025 lease with a four-term table (cap $25,500) and RAV4 Hybrid 2025 finance. Tune the numbers so the switch wins by at least $40/mo average after every fee.

- [ ] **Step 1:** Write tests: Jordan's leader is a `switch_now` lease; `switchMath.equityCents === 250000`; `savingsPerMonthCents >= 4000`; every switch-math number appears in `evidence` with source `synthetic`; Maria (no payoff fields) gets no `switch_now` option; a negative-equity variant (trade-in below payoff) shows the shortfall in `upfrontCashCents` and is excluded when it exceeds available cash (Review Focus 3); Jordan is in `PERSONAS` so it seeds to Nessie.
- [ ] **Step 2:** Run `npx vitest run tests/lease/switch.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and tune Jordan.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS (update people/seed counts for a fourth curated persona).
- [ ] **Step 5:** Commit `git commit -m "Mid-lease switch and the Jordan case study"`

### Task 5: Recommendation copy

**Files:**
- Modify: `src/domain/recommendations/recommend.ts`
- Test: `tests/lease/recommend.test.ts`

- [ ] **Step 1:** Write tests: when the leader is a lease, a line names its term and average, and the cheapest alternative term's extra cost ("24 months: $X/mo on average; 12 months would cost $Y more a month"); when the tie-break decided, a line names both cars' complaint counts; a warranty note line when the leader has `warranty`; for Jordan, a line with the monthly savings vs continuing.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit `git commit -m "Explain the term, reliability and switch in the recommendation"`

### Task 6: Screens

**Files:**
- Create: `src/components/next-move/lease/TermPicker.tsx` (row of term buttons; selected term's average, payment, due at signing, APR equivalent; "Best" marker on the app's pick; local state only), `src/components/next-move/lease/ReliabilityBadge.tsx` ("NHTSA: N recalls · M complaints (model year)" with Observed chip and date, or "No NHTSA data"), `src/components/next-move/lease/SwitchMath.tsx` (line items from `switchMath`)
- Modify: `src/components/next-move/screens.tsx` (Compare option card uses all three; average monthly cost tile), `src/components/story/Options.tsx` (compact TermPicker for lease options and SwitchMath for the leader when `switch_now`), CSS in `src/app/globals.css`

- [ ] **Step 1:** Implement; `npm run typecheck && npx eslint src`. Expected: PASS.
- [ ] **Step 2:** Headless walk (keyless build) at 1280 and 390: Maria's Compare shows four terms with the best marked, clicking a term updates that card only, reliability badges show, Jordan's Compare and story show the switch math; no horizontal overflow.
- [ ] **Step 3:** Commit `git commit -m "Term picker, reliability badge and switch math on Compare and the story"`

### Task 7: E2E and docs

**Files:**
- Create: `e2e/lease-terms.spec.ts`
- Modify: `README.md`, `docs/demo-script.md` (Jordan beat; Maria's result if it changed)

- [ ] **Step 1:** Tests: Maria's Compare lease card shows 12/24/36/48 buttons and a "Best" marker; clicking another term changes that card's average but not the Next Step headline; Jordan's Next Step headline starts "Switch now"; the switch math shows equity "$2,500"; reliability badge text matches /NHTSA: \d+ recalls? · \d+ complaints?/; mobile has no horizontal overflow on Compare.
- [ ] **Step 2:** Run `npx playwright test`. Expected: all pass (live skips only).
- [ ] **Step 3:** Run `npm run typecheck && npx eslint src e2e tests && npm test && npm run build`. Expected: PASS.
- [ ] **Step 4:** Commit `git commit -m "E2E coverage and docs for lease terms"`
