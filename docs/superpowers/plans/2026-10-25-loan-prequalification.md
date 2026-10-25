# Loan Pre-qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect your bank and instantly see an explainable, lender-style pre-qualification (rate band, max amount, decision, principal reasons) for financing the next car and refinancing the current loan; every financed option in the comparison then uses that personal rate.

**Architecture:** A logistic regression trained offline on UCI German Credit is exported to JSON and scored in TypeScript. A pure underwriting engine (`src/domain/credit/`) runs policy knock-outs → model → Experian tier → pricing → decision, from a credit profile built out of Nessie **loan** records and the bank history. `compareOptions` underwrites each borrowing option and uses its rate; the card reads `comparison.prequalification`.

**Tech Stack:** Python 3 + scikit-learn 1.8 + pandas (offline only), TypeScript domain code, Next.js 16, vitest, Playwright. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-loan-prequalification-design.md` (read its "Decisions after the builder review" section: it overrides the Decision section).

## Global Constraints

- The model never declines alone: it shifts the tier at most one band and can send to `needs_review`. `not_prequalified` only from a failed knock-out.
- Knock-outs: PTI ≤ 20% of estimated gross income; DTI ≤ 50% including the new payment; LTV ≤ 125%; term ≤ 84 months; ≥ 2 payroll deposits a month in the budget window; credit score ≥ 500.
- Estimated gross income = take-home ÷ 0.78 (evidence row "Estimated gross income", source `derived`).
- DTI debts = housing + other loan payments (excluding the car being replaced or refinanced) + card minimum max(2% of balance, $25) + the new payment.
- Tier APRs (Experian Q3 2025, new / used, bps): super prime 781–850 488/743; prime 661–780 651/965; near prime 601–660 977/1411; subprime 501–600 1334/1900; deep subprime 300–500 1585/2160. Adjustments: +50 bps if term > 60; +75 bps if LTV > 100%. Band = ±75 bps.
- Unknown credit score → near prime tier plus the reason "Credit score not provided".
- Refinance for every loan holder: term = remaining months, fee 25000 cents (synthetic), "worth it" = APR ≥ 100 bps below current and savings over the remaining term > fee.
- Excluded model attributes: A9 personal status and sex, A13 age, A20 foreign worker (plus A4, A7, A10–A12, A14, A15, A17–A19: no honest source).
- Every value shown carries a `SourceKind`; credit scores are `synthetic` (case studies) or `user_reported` (onboarding). UI copy: "Estimate, not an offer or a credit decision."
- Domain code stays pure (no React/Next imports); integer cents; no network at runtime for scoring.

## Review Focus

1. **Zero or missing income** (no payroll deposits): `not_prequalified` with the income reason; PTI/DTI never divide by zero or show NaN. Test in Task 3.
2. **Unknown credit score** (onboarding "I don't know", or a profile saved before the field existed): near-prime pricing and a reason row; re-sending an old profile still validates. Tests in Task 3 and Task 6.
3. **Unknown collateral value** (owned car value unknown, lease with no purchase option): no decision for that option and no crash; LTV knock-out not applied to a value we don't have (reason: "Car value unknown"). Test in Task 3.
4. **Lease holders**: no refinance decision; the buyout is underwritten at used rates. Test in Task 5.
5. **Seeded Nessie loans read back**: a sandbox read with loan records yields the same credit profile as the fixture. Test in Task 2.

---

### Task 1: Train the model and score it in TypeScript

**Files:**
- Create: `scripts/credit/german.data` (downloaded from https://archive.ics.uci.edu/static/public/144/statlog+german+credit+data.zip, committed), `scripts/credit/train.py`, `scripts/credit/README.md` (how to rerun, citation CC BY 4.0)
- Create: `src/fixtures/credit-model.json` (generated)
- Create: `src/domain/credit/model.ts`
- Test: `tests/credit/model.test.ts`

**Interfaces:**
- Produces:
  - `credit-model.json`: `{ dataset, license, excluded: string[], dmPerUsd: number, features: { name: string; kind: "category" | "number"; levels?: string[]; mean?: number; std?: number }[], weights: number[], intercept: number, thresholds: { tierUp: number; tierDown: number; review: number }, metrics: { auc: number; accuracy: number; badRate: number }, checks: { input: GermanInput; pBad: number }[] }`
  - `type GermanInput = { A1: "A11"|"A12"|"A13"|"A14"; A2: number; A3: "A30"|"A31"|"A32"|"A33"|"A34"; A5: number; A6: "A61"|"A62"|"A63"|"A64"|"A65"; A8: 1|2|3|4; A16: 1|2|3|4 }`
  - `scoreGerman(input: GermanInput): { pBad: number; contributions: { feature: keyof GermanInput; value: number }[] }` (contribution = weight × encoded value; positive pushes toward bad).

- [ ] **Step 1: Write `train.py`.** One-hot A1, A3, A6; standardize A2, A5, A8, A16; `LogisticRegression(max_iter=1000)`; 5-fold stratified CV for AUC; fit on all rows. Thresholds from the training predictions: `review` = the cost-optimal cut for the 5:1 matrix (p_bad ≥ 1/6 means expected cost of approving exceeds rejecting), `tierUp` = 20th percentile of p_bad, `tierDown` = 80th percentile. Write 5 `checks` rows (input + sklearn probability). `dmPerUsd` = 1.0 recorded as the documented scale (amounts are converted USD→DM by dividing by it).
- [ ] **Step 2: Run** `python3 scripts/credit/train.py`. Expected: prints AUC between 0.65 and 0.80 and writes the JSON.
- [ ] **Step 3: Write the failing test**

```ts
it("reproduces scikit-learn's probabilities", () => {
  for (const c of model.checks) expect(scoreGerman(c.input).pBad).toBeCloseTo(c.pBad, 6);
});
it("leaves out protected attributes", () => {
  expect(model.excluded).toEqual(expect.arrayContaining(["A9", "A13", "A20"]));
  expect(model.features.map((f) => f.name)).not.toEqual(expect.arrayContaining(["A9", "A13", "A20"]));
});
it("explains the score: contributions sum to the logit", () => { /* sum(contributions)+intercept === logit(pBad) within 1e-9 */ });
```

- [ ] **Step 4: Run** `npx vitest run tests/credit/model.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 5: Implement `src/domain/credit/model.ts`** reading the JSON.
- [ ] **Step 6: Run.** Expected: PASS.
- [ ] **Step 7: Commit** `git commit -m "Train a German Credit model and score it in TypeScript"`

### Task 2: Nessie loan records in the bank snapshot

**Files:**
- Create: `src/contracts/credit.ts` (re-export from `src/contracts/index.ts`)
- Modify: `src/contracts/index.ts` (`BankingSnapshot` gains `loans: BankLoan[]`), `src/server/providers/nessie-normalize.ts` (`NessieLoan` schema; bundle gains `loans`; normalize maps them), `src/server/providers/nessie.ts` (`fetchCustomer` also lists `/accounts/{id}/loans`), `src/fixtures/banking.ts` (`BankingSpec.credit?: CreditSpec`; `nessieBundlesFromSpec` puts its loans on checking; curated specs get credit: maria 712, devon 768, kai 618 with loan records matching their contracts), `src/server/providers/nessie-seed.ts` (`planBundles` writes `loans`)
- Test: `tests/credit/loans.test.ts`; existing banking/seed tests updated for the new path

**Interfaces:**
- Produces:
  - `interface BankLoan { loanId: string; accountId: string; type: string; status: string; creditScore: number; monthlyPaymentCents: Cents; amountCents: Cents; description: string }`
  - `interface CreditSpec { score: number | null; loans: { type: "auto" | "auto lease" | "credit file"; status: "approved"; amount: number; monthly_payment: number; description: string }[] }` (dollars, like the rest of the spec). A `null` score is written as `credit_score: 0` and read back as unknown.
  - Seed write body: `{ type, status, credit_score, monthly_payment, amount, description }` on path `loans`.

- [ ] **Step 1: Write the failing tests:** Maria's fixture snapshot has one loan with `creditScore` 712 and `type` "auto lease"; Devon's has one "credit file" record with amount 0; `planCounts(planPersona("kai","t")).loans` is 1; a fake-Nessie round trip (pattern from `tests/onboarding/connect-bank.test.ts`) returns the same `loans` as the fixture (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run tests/credit/loans.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Existing `BankingSnapshot` producers that don't have loans set `loans: []`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS (update seed count expectations to include `loans`).
- [ ] **Step 5: Commit** `git commit -m "Read and seed Nessie loan records with credit scores"`

### Task 3: Credit profile and the underwriting engine

**Files:**
- Create: `src/domain/credit/config.ts`, `src/domain/credit/profile.ts`, `src/domain/credit/underwrite.ts`
- Test: `tests/credit/underwrite.test.ts`

**Interfaces:**
- Consumes: Task 1 `scoreGerman`, Task 2 `BankLoan`, `BudgetSnapshot`.
- Produces (types in `src/contracts/credit.ts`):
  - `interface CreditProfile { score: Maybe<number>; scoreSource: SourceKind; loans: BankLoan[]; onTimeCarPayments: number; lateCarPayments: number; payrollDepositsPerMonth: number; takeHomeMonthlyCents: Cents; grossMonthlyCents: Cents; housingMonthlyCents: Cents; otherDebtMonthlyCents: Cents; cardMinimumCents: Cents; checkingCents: Cents; savingsCents: Cents }`
  - `creditProfile(bank: BankingSnapshot, budget: BudgetSnapshot, scoreSource: SourceKind): CreditProfile` (score from the first loan record with `creditScore > 0`; late = vehicle_payment bills with status other than completed, or months in the window without one).
  - `interface LoanApplication { purpose: "finance" | "buyout" | "refinance"; vehicleCondition: "new" | "used"; amountCents: Cents; termMonths: number; collateralValueCents: Cents | null; replacesPaymentCents: Cents; currentAprBps?: number }`
  - `type CreditTier = "super_prime" | "prime" | "near_prime" | "subprime" | "deep_subprime"`
  - `interface CreditReason { code: string; text: string; evidence: { label: string; display: string; source: SourceKind } }`
  - `interface LoanDecision { status: "prequalified" | "needs_review" | "not_prequalified"; tier: CreditTier; scoreTier: CreditTier; aprBps: number; aprBandBps: [number, number]; paymentCents: Cents; maxAmountCents: Cents; pBad: number; ptiPct: number; dtiPct: number; ltvPct: number | null; reasons: CreditReason[]; worthIt?: boolean }`
  - `underwrite(app: LoanApplication, p: CreditProfile): LoanDecision`

- [ ] **Step 1: Write the failing tests** (build profiles inline)

```ts
it("pre-qualifies a prime borrower at the prime new-car rate", () => {
  const d = underwrite({ purpose: "finance", vehicleCondition: "new", amountCents: 2500000, termMonths: 60, collateralValueCents: 2800000, replacesPaymentCents: 0 }, prime);
  expect(d.status).toBe("prequalified");
  expect(d.scoreTier).toBe("prime");
  expect(d.aprBandBps[0]).toBeLessThan(d.aprBps);
});
it("adds 50 bps past 60 months and 75 bps above 100% LTV", () => { /* same borrower, 72 months, collateral 2,000,000 → aprBps === base + 125 when the tier is unchanged */ });
it("declines on payment-to-income with that as the first reason", () => { /* income 3000/mo take-home → reasons[0].code === "pti", text contains "limit 20%" */ });
it("declines below a 500 score", () => { /* status not_prequalified, reasons[0].code === "score" */ });
it("never declines on the model alone", () => { /* rules pass, pBad forced high via weak savings/checking → status needs_review */ });
it("has no income: declines without NaN", () => { /* takeHome 0 → not_prequalified, Number.isFinite(ptiPct) */ });            // Review Focus 1
it("treats an unknown score as near prime with a reason", () => { /* score unknown → scoreTier near_prime, reasons include code "score_unknown" */ }); // Review Focus 2
it("skips LTV when the car value is unknown", () => { /* collateral null → ltvPct null, reasons include "collateral_unknown", no ltv knock-out */ });          // Review Focus 3
it("computes the max amount from the 20% PTI limit", () => { /* payment of maxAmountCents at aprBps over term ≈ 20% × gross − within $1 */ });
it("marks a refinance worth it only when it beats the current rate after fees", () => { /* currentAprBps 1190 vs prime → worthIt true; currentAprBps 600 → false */ });
it("orders reasons: failed rules first, then the model's strongest negatives, at most 4", () => {});
```

- [ ] **Step 2: Run** `npx vitest run tests/credit/underwrite.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files; every number from Global Constraints lives in `config.ts`. Map to `GermanInput` in `underwrite.ts`: A1 from checking (`< 0` A11, `< $200×dmPerUsd⁻¹` A12, else A13; no checking account A14), A2 = term, A3 (late > 0 → A33; loans and none late → A32; no loans → A30), A5 = amount in DM, A6 by savings bands (<$100 A61, <$500 A62, <$1,000 A63, ≥ A64), A8 by PTI (≤5% 1, ≤10% 2, ≤15% 3, else 4), A16 = min(4, loans + 1). Record those edges in `config.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Underwrite loans: knock-outs, model, Experian tiers, pricing, reasons"`

### Task 4: Seeded credit profiles for the generated people

**Files:**
- Modify: `scripts/build-people.ts` (seeded `credit` per person, consistent with their contract: loan → "auto" record with payoff and payment; lease → "auto lease"; owned → "credit file" amount 0; score from a seeded distribution over all five tiers)
- Regenerate: `src/fixtures/people.generated.json` (`node scripts/build-people.ts`)
- Test: `tests/people.test.ts` (extend)

- [ ] **Step 1: Write the failing test:** every one of the 29 people has a credit score (curated from Task 2); the generated scores cover at least 4 of the 5 tiers; running the builder twice yields identical JSON (determinism check already exists; extend it to `credit`).
- [ ] **Step 2: Run** `npx vitest run tests/people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement and regenerate.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Give every case study a seeded credit profile"`

### Task 5: Personal rates in the comparison

**Files:**
- Modify: `src/contracts/index.ts` (`OptionResult.credit?: LoanDecision`; `Comparison.prequalification: { finance: LoanDecision | null; refinance: LoanDecision | null }`), `src/domain/recommendations/compare.ts`, `src/domain/recommendations/scenario.ts` (build `creditProfile` and pass it), `src/domain/recommendations/recommend.ts`
- Test: `tests/credit/compare.test.ts`; update `tests/compare.test.ts`, `tests/scenario.test.ts`, `tests/server/routes.test.ts`, `e2e/*.spec.ts` expectations that change

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `CompareInputs.credit?: CreditProfile`. When present:
  - finance / sell-and-finance / return-and-finance options: `underwrite({ purpose: "finance", vehicleCondition: "new", amountCents: principal, termMonths: scenario.financeTermMonths, collateralValueCents: candidate.priceCents, replacesPaymentCents: current contract payment or 0 })`; the loan uses `decision.aprBps`.
  - buyout: `purpose "buyout"`, `"used"`, amount = purchase price, collateral = current value (Review Focus 4).
  - refinance: every loan holder; replaces `scenario.refinance`; Global Constraints terms.
  - `not_prequalified` → option `feasible: false`, exclusion = `Not pre-qualified: ${reasons[0].text}`. `needs_review` → feasible, tradeoff prefixed "Needs review: ".
  - `prequalification.finance` = decision of the best-ranked option among finance/buyout kinds (by `rankOptions`, falling back to the first such option); `.refinance` = the refinance decision or null.
  - Evidence rows: `credit_score` (score or "Not provided", its source), `estimated_gross_income`, and for the leader `pti` / `dti`.
  - `recommend`: top option with `credit.status === "needs_review"` → status `needs_information`, nextAction `compare_confirmed_offers`, adds a line with its first reason.

- [ ] **Step 1: Write the failing tests:** Kai (loan, score 618) gets a refinance option priced from near prime, not `scenario.refinance`'s 8.40%; Maria's buyout decision uses the used column; a lease persona has `prequalification.refinance === null`; a persona below 500 has its finance options excluded with "Not pre-qualified: …"; without `credit`, `compareOptions` behaves exactly as before (existing tests pass untouched by this switch).
- [ ] **Step 2: Run** `npx vitest run tests/credit/compare.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then update changed expectations in existing unit and e2e tests and `docs/demo-script.md` to the new results (the spec allows case-study outcomes to change).
- [ ] **Step 4: Run** `npx vitest run && npx playwright test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Use each person's pre-qualified rate in the comparison"`

### Task 6: Credit score in onboarding and the Nessie connection

**Files:**
- Modify: `src/contracts/onboarding.ts` (`OnboardingAnswers.credit?: { score: number | null }`; optional so older saved profiles still parse), `src/server/onboarding/schema.ts`, `src/domain/onboarding/validate.ts` (300–850 or null), `src/domain/onboarding/banking.ts` (`credit` spec from the answers and the contract), `src/components/onboarding/steps/Bank.tsx` (field "About what's your credit score?" with an "I don't know" checkbox, above the money fields), `src/components/onboarding/Onboarding.tsx` (default `credit: { score: null }`)
- Test: `tests/onboarding/build.test.ts`, `tests/onboarding/connect-bank.test.ts` (extend)

- [ ] **Step 1: Write the failing tests:** answers with score 742 and a loan produce a spec whose credit has score 742 and an "auto" loan with the payoff; validation rejects 900 with "Enter a score between 300 and 850"; the fake-Nessie connect writes one `loans` record and reads `creditScore` 742 back; a profile body without `credit` still PUTs 200 (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run tests/onboarding`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Ask for a credit score in onboarding and store it on a Nessie loan record"`

### Task 7: The pre-qualification card

**Files:**
- Create: `src/components/next-move/credit/PrequalCard.tsx` (+ CSS in `src/app/globals.css` under `.prequal*`)
- Modify: `src/components/onboarding/steps/Bank.tsx` (after a finished connection, run `runScenario` on the user's persona and the returned snapshot, and show the card), `src/components/next-move/screens.tsx` (card on the Cost tab; a small decision badge on each option card in Compare), `src/components/story/Stand.tsx` (card in "Where you stand")

**Interfaces:**
- Consumes: `Comparison.prequalification`, `OptionResult.credit`.
- Produces: `<PrequalCard prequal={Comparison["prequalification"]} compact?: boolean />` with two columns, "Finance your next car" and "Refinance your loan" (hidden when null). Each column shows: the status chip (Pre-qualified / Needs review / Not pre-qualified), the APR band "6.9–8.4% APR", "Up to $28,000" or "Payment up to $X/mo", the tier with its source line "Experian Q3 2025 average for prime", up to 4 reasons each with its evidence value and source chip, and a "Worth it" or "Doesn't beat your rate" line for refinance. Footer: "Estimate, not an offer or a credit decision. Model: logistic regression on UCI German Credit (AUC {metrics.auc}); sex, age, marital status and nationality are not used."

- [ ] **Step 1: Implement** and check `npm run typecheck && npx eslint src`. Expected: PASS.
- [ ] **Step 2: Headless walk** of a keyless production build at 1280 and 390 (as in the onboarding plan): onboarding with score 760 shows "Pre-qualified" on the Bank step right after connecting; Kai's Cost tab shows his card; no horizontal overflow.
- [ ] **Step 3: Commit** `git commit -m "Show the pre-qualification card on Bank, Cost, Compare and the story"`

### Task 8: End-to-end coverage and docs

**Files:**
- Create: `e2e/prequal.spec.ts`
- Modify: `README.md` (Data modes: credit scores are user reported or synthetic; the model and its excluded attributes; Experian source), `docs/demo-script.md` (the demo beat)

- [ ] **Step 1: Write the tests:** onboarding with score 760 → Bank step card shows "Pre-qualified" and an APR band before Continue; onboarding with score 480 → "Not pre-qualified" with "Credit score" as a reason; Kai's Cost tab shows "Refinance your loan"; a lease case study shows no refinance column; mobile project has no horizontal overflow on the Bank step with the card.
- [ ] **Step 2: Run** `npx playwright test`. Expected: all pass (live skips only).
- [ ] **Step 3: Run** `npm run typecheck && npx eslint src e2e tests && npm test && npm run build`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "E2E coverage and docs for pre-qualification"`
