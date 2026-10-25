# Loan pre-qualification: automated, explainable underwriting

Status: draft for approval · 2026-10-25

## Why

The Toyota track asks for "a faster, explainable credit-risk workflow using responsible AI" (suggested data: UCI
German Credit or Home Credit, plus synthetic auto-loan data). Regentic already reads a person's bank history through
Nessie, which is most of what a lender looks at. The demo moment: **connect your bank and instantly see a
pre-qualified rate and the reasons behind it.** Today every finance option uses one made-up 6.49% APR; after this,
each person's options use their own estimated rate.

## How lenders do it (what we imitate)

Research summary (sources at the end):

1. **Credit tier from the score.** Experian's tiers and Q3 2025 average APRs (new / used): super prime 781–850
   4.88% / 7.43%; prime 661–780 6.51% / 9.65%; near prime 601–660 9.77% / 14.11%; subprime 501–600 13.34% / 19.00%;
   deep subprime 300–500 15.85% / 21.60%.
2. **Policy knock-outs:** debt-to-income (DTI) cap about 45–50%; payment-to-income (PTI) about 15–20% (industry
   average ~12.6%); a maximum loan-to-value (LTV); maximum term up to 84 months; verifiable income.
3. **Automated decisioning:** clear in-policy files are decided instantly (approve / decline); borderline files are
   referred to a person.
4. **Risk-based pricing:** tier base rate, adjusted by deal structure (term, LTV, new vs used); risk models refine
   placement within a tier because static score cutoffs miss variation inside a band.
5. **Adverse action:** under ECOA / Regulation B a declined applicant must get the specific principal reasons, even
   when an AI model is used (CFPB circulars 2022-03 and 2023-03). Pre-qualification is a soft check that doesn't
   affect the score.

## Goals

1. **Pre-qualification for two loans**, each with its own decision:
   - *Finance the next car*: amount, term and vehicle come from the comparison's finance candidates.
   - *Refinance the current loan*: amount = payoff, collateral = current car. Only for people with a loan.
2. **A pipeline that mirrors a lender's:** application → soft-check inputs → policy knock-outs → risk model → tier
   and pricing → decision (pre-qualified / needs review / not pre-qualified) → principal reasons.
3. **A model trained on UCI German Credit** (logistic regression), used to estimate the chance the loan goes bad and
   to move the person at most one tier up or down. Its per-feature contributions become the reasons.
4. **Inputs from Nessie:** the credit score and existing loans come from Nessie **loan** records
   (`/accounts/{id}/loans`: `type`, `status`, `credit_score`, `monthly_payment`, `amount`, `description`, all
   amounts integers; verified against the live API). Income, debts, cash and on-time car-payment history come from the
   bank records Regentic already reads.
5. **Credit score source:**
   - New users enter an approximate score in onboarding (Bank step). Connect-bank writes it on a Nessie loan record
     with their existing car loan (or a zero-balance record when there is no loan) and reads it back.
   - Case studies (curated and generated) get a credit score and loan records generated with a fixed seed per person,
     so the demo is stable. Curated personas' loan records are also seeded to Nessie by the existing seed route.
6. **The demo moment:** on the onboarding Bank step, as soon as the connection finishes, a card shows both results
   (rate band, max amount or payment, decision, top reasons). The same card lives on the Cost tab and in the story's
   "Where you stand" section.
7. **Re-determined recommendations:** the comparison uses the person's own rates. Finance options and the buyout use
   the pre-qualified finance APR; the refinance option uses the pre-qualified refinance APR (replacing the synthetic
   `scenario.refinance` terms when a decision exists). An option the person isn't pre-qualified for is excluded with
   the principal reason as its exclusion text. The AI explanation can cite the decision and reasons; it never
   decides.

## Non-goals

- Real credit pulls, real lender offers, real approval. Everything is labeled "estimate, not an offer or a credit
  decision".
- Home Credit data (needs a Kaggle login and is ~2.5 GB). Mentioned in the pitch as the next data source.
- Lease money-factor tiers (the lease-terms design is separate; see Constraints).
- State rate caps, dealer reserve, taxes and fees.

## Anti-goals

- **Using protected characteristics.** The model must not use German Credit's personal status/sex, age or foreign
  worker attributes, nor proxies we add later. The doc and UI say which attributes were left out and why.
- **Unexplained declines.** Every "not pre-qualified" and "needs review" shows its specific principal reasons, each
  tied to the evidence (a value and its source), never a generic "credit criteria not met".
- **Claude deciding.** Code decides; the explainer only rephrases, as today.
- **Breaking existing flows silently.** Changed outcomes for case studies are expected (see Constraints) but must be
  explainable from the evidence.

## Decided design

### Model

- Training is offline in Python (`scikit-learn` 1.8 and `pandas` are installed locally): a script downloads UCI
  German Credit (`german.data`, 1,000 rows, CC BY 4.0), maps attributes to the features below, fits a logistic
  regression, and writes `src/fixtures/credit-model.json` (feature encodings, coefficients, intercept, training
  metrics, the dataset citation, and the excluded attributes). The app scores in TypeScript with that JSON: no Python
  at runtime and no new npm dependencies. The raw data file is committed next to the script for reproducibility.
- Features used, each derivable from our data:

  | German Credit attribute | Our source |
  | --- | --- |
  | A1 checking account status | checking balance band (negative / low / high / no checking) |
  | A2 duration (months) | requested loan term |
  | A3 credit history | on-time car payments counted from bank bills + existing Nessie loans |
  | A5 credit amount | requested amount (currency scaled) |
  | A6 savings | savings balance band |
  | A8 installment rate (% of disposable income) | payment-to-income band |
  | A16 number of existing credits | Nessie loan records count |

  Excluded: A9 personal status and sex, A13 age, A20 foreign worker (protected or proxy), and A4 purpose, A7, A10–A12,
  A14, A15, A17–A19 (no honest source in our data).
- Training uses the dataset's cost matrix (approving a bad borrower costs 5× rejecting a good one) when choosing the
  decision threshold. Report accuracy / AUC in the JSON and on an evidence row.

### Policy rules (knock-outs, all constants in one config)

PTI ≤ 20% of monthly income; DTI ≤ 50% including the new payment; LTV ≤ 125% (amount ÷ vehicle value); term ≤ 84
months; at least 2 payroll deposits a month in the budget window; credit score ≥ 500.

### Tier and pricing

1. Tier from the credit score (Experian bands above).
2. The model's probability of a bad loan moves the tier up one band if low, down one band if high (thresholds chosen
   from training).
3. APR = tier average (new or used, from the table above) + 0.50 pt if term > 60 months + 0.75 pt if LTV > 100%.
   Shown as a band of ± 0.75 pt around it, labeled "estimate from Experian Q3 2025 averages".
4. Max amount: the largest principal whose payment at that APR keeps PTI ≤ 20%.

### Decision

- **Pre-qualified**: passes every rule and the probability of a bad loan is under the approve threshold.
- **Needs review**: passes the rules but the probability of a bad loan is above the approve threshold, or one rule is
  within 10% of its limit.
- **Not pre-qualified**: any knock-out fails. (The model alone never declines; see Decisions after the builder review.)
- **Refinance** additionally shows "worth it" only when the estimated APR is at least 1 pt below the current APR and
  the savings over the remaining term exceed the fee.
- **Principal reasons**: up to 4, ordered by impact (failed rules first, then the model features pushing hardest
  against approval), each with its value and source, e.g. "Car payment would be 24% of income (limit 20%)".

### Data

- Seeded random credit profiles for every case study, generated by a script with a fixed seed into the people
  fixtures (score plus any existing-loan records consistent with their contract), and added to the curated Nessie
  seed plan.
- Onboarding gets one new optional field on the Bank step: "About what's your credit score?" (300–850, or "I don't
  know", which uses the near-prime tier and adds a reason saying the score was unknown).

## Decisions after the builder review

**Decided with the team:** the model never declines on its own. It moves the tier at most one band either way, and a
high probability of a bad loan sends the file to **needs review** with its reasons. **Not pre-qualified** happens only
when a policy knock-out fails (score < 500, PTI, DTI, LTV, term, income). This replaces the "probability above the
decline threshold" rule in the Decision section.

**Claude's calls (check these):**
1. **One decision per financed option.** Every option that borrows (finance a candidate, sell-and-finance,
   return-and-finance, buyout, refinance) is underwritten with its own amount, term, collateral and LTV, because
   `compare.ts` already builds a different principal for each. The card's headline "finance your next car" result is
   the one for the comparison's best-ranked financed option; the others show on their option cards.
2. **The lease buyout is its own loan**, priced from the *used* column with the purchase option as the amount and the
   current car's value as collateral. If it isn't pre-qualified, the buyout is excluded like any other option.
3. **Income for PTI/DTI is estimated gross:** take-home ÷ 0.78 (the same ratio `scripts/build-people.ts` uses),
   shown as a derived evidence row ("Estimated gross income"), because lender limits are set against gross income.
4. **DTI debts** = housing + other loan payments (the car being replaced or refinanced is left out) + a credit-card
   minimum of max(2% of the balance, $25) + the new payment. Insurance and utilities are not debts.
5. **"Needs review" options stay feasible** but are flagged on their card and in the recommendation (status
   `needs_information`, reasons listed). **A refinance that isn't "worth it"** still appears, with its tradeoff
   saying it doesn't beat the current rate after fees.
6. **Every loan holder gets a refinance option:** term = remaining months (no extension), fee $250 (synthetic), rate
   from pre-qualification. It replaces `scenario.refinance` where that exists.
7. **The credit score lives in the onboarding answers** (source of truth) and feeds the bank spec key, so changing it
   requires reconnecting, which rewrites the Nessie loan record. Profiles saved before this field existed read as
   "unknown" (near-prime tier plus a reason saying so).

## Constraints

- Follows the app's rules: integer cents, every number with a `SourceKind`, unknowns shown as unknown, domain code pure.
- The lease-terms design (`2026-10-25-lease-terms-and-switching-design.md`) also changes `compare.ts`. Build this one
  first; that one then uses pre-qualified rates for its finance options.
- Case-study outcomes may change because rates are now personal. Unlike the lease design (which protected Devon and
  Kai), this feature is allowed to change any case study's result; tests and the demo script are updated to the new
  results.
- Works offline with no keys: the fixture path gives the same decisions as Nessie.

## Left to the builder

- Exact band edges for checking/savings/PTI and the DM→USD scale, as long as they are documented in the model JSON.
- Approve/decline thresholds, as long as they come from the training run and are recorded.
- The seeded credit-profile distribution (should span all tiers across the 29 people, with Maria, Devon and Kai
  getting plausible scores for their stories).
- Card layout within the existing theme, phone width included.

## Sources

- Experian tiers and APRs: https://www.experian.com/blogs/ask-experian/average-car-loan-interest-rates-by-credit-score/ ,
  https://www.bankrate.com/loans/auto-loans/average-monthly-car-payment/
- DTI / PTI: https://www.autocreditexpress.com/blog/debt-to-income-ratio-for-car-loans/
- Term and PTI limits: https://www.cuinsight.com/press-release/open-lendings-84-month-near-and-non-prime-auto-loans-enable-credit-unions-to-meet-rising-auto-prices/
- Automated decisioning: https://defisolutions.com/defi-insight/auto-loan-origination-strategies/ ,
  https://creditunions.com/features/the-search-for-the-fat-middle/
- Adverse action and AI: https://www.cooley.com/news/insight/2023/2023-09-25-cfpb-mandates-additional-specificity-in-adverse-action-communications-based-on-ai-or-complex-credit-models
- UCI German Credit: https://archive.ics.uci.edu/dataset/144 ; cost matrix: https://sci2s.ugr.es/keel/dataset.php?cod=88
