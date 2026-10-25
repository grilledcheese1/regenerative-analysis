# Lease terms, reliability, and a mid-lease switch

Status: draft for approval · 2026-10-25

## Why

Today every lease option in Next Move has exactly one term (36 months) and one rate. Real lease shoppers choose
between term lengths, and the cheapest term is not obvious: short leases have higher payments, long leases run past
the warranty. We want Next Move to lay out the terms side by side, pick the best one, and say why. We also want a
demo moment where the math says "switch your lease now", because that is the kind of result a person would not find
on their own.

## Goals

1. **Multiple lease terms per leased car.** Each lease candidate can offer 12, 24, 36 and 48 month terms, each with
   its own money factor, residual and due-at-signing.
2. **Compare terms by average monthly cost over the lease's own length.** All-in: payments, due at signing, fees
   (disposition, acquisition if modeled), fuel, insurance and maintenance, spread over the term's months.
3. **Recommend the best term**, and include renew/continue choices for people already in a lease:
   - *Renew*: a new lease on the same model at lease end.
   - *Continue*: keep the current lease to maturity (mid-lease) or extend it month to month (at lease end).
4. **Reliability is shown and used.**
   - Shown: per car, NHTSA recall count and owner complaint count for that model year.
   - Used as a **tie-breaker**: when two feasible options are within **$25/mo** of average monthly cost, the more
     reliable car ranks first, and the explanation says reliability decided it.
   - Any option whose ownership period runs past Toyota's basic warranty (36 months / 36,000 miles) gets a note.
5. **A fourth demo persona with a mid-lease switch that wins.** Mid-lease, on a pricier car at a 2024 rate; the
   car's trade-in value exceeds the early payoff, and that equity plus a lower current rate makes leasing a
   different car cheaper per month than finishing the current lease, after every fee.
6. **Maria gets multiple terms too**, so her lease-end decision shows the feature.

## Non-goals

- Real lease offers, real Toyota Financial Services rates, credit tiers, taxes by state. Rates and residuals stay
  synthetic and labeled that way, like every other price in the app.
- Lease transfers to another person (Swapalease-style), sign-and-drive promotions, MSD (multiple security deposits).
- Paywalled reliability scores (Consumer Reports, J.D. Power).
- Live NHTSA calls during the demo.

## Anti-goals (would be a failure even if it works)

- **A switch that only wins because of a hidden fudge.** Every line of the switch math (payoff, trade-in value,
  equity, new due at signing, new payment, fees) must be visible as evidence, with its source.
- **Reliability deciding by itself.** It never overrides a cost difference larger than the margin. The AI explainer
  may rephrase why, but code decides, as today.
- **A cluttered Compare screen.** Terms are one row of choices per lease option, not 4× the option cards.
- **Breaking Devon or Kai.** Their outcomes and e2e assertions must stay as they are.

Maria is different (decided): her recommended option may change if the new term math says so. When it does, update
`e2e/shell.spec.ts` ("Leading option: Buy out…"), `e2e/market-research.spec.ts` R5 (buyout-quote next step),
the affected unit tests in `tests/compare.test.ts` and `tests/scenario.test.ts`, and `docs/demo-script.md` to the
new result, rather than tuning her numbers to keep the buyout on top.

## Constraints from the existing app

- Money is integer cents; domain code (`src/domain/`) stays pure, no React/Next imports.
- Every number carries a `SourceKind` (`observed`, `user_reported`, `derived`, `modeled`, `synthetic`) and appears
  in `Comparison.evidence` when it drives a decision. Unknowns are shown as unknown, never 0.
- Feasibility (monthly budget, upfront cash after the reserve) and ranking happen in
  `src/domain/recommendations/` (`compare.ts`, `rank.ts`, `recommend.ts`). The AI explainer only rephrases.
- Demo must work offline with no keys; fixtures are the default (see `src/fixtures/market-cache.json` for the
  cached-external-data pattern).
- Unit tests in `tests/` (vitest) and e2e in `e2e/` (Playwright, desktop + mobile) must pass. The e2e suite runs
  with no provider keys.

## Decided design

### Data

- `CandidateTerms` for `acquisition: "lease"` gains a list of term offers, each
  `{ termMonths, moneyFactor, residualCents, dueAtSigningCents }`. The single `leaseTermMonths/moneyFactor/
  residualCents` form can be migrated into this list. Allowed miles per year stay as today (not modeled per term).
- A cached NHTSA reliability fixture per catalog vehicle: `{ catalogId, recalls, complaints, retrievedAt, source }`,
  fetched once by a script from NHTSA's public APIs (`api.nhtsa.gov/recalls/recallsByVehicle` and
  `api.nhtsa.gov/complaints/complaintsByVehicle`, by make/model/model year) and committed. Source is `observed`.
- The fourth persona has a `lease` contract mid-term plus what the switch needs: an early payoff amount
  (synthetic, labeled "estimate, not a payoff quote") and an estimated trade-in value (synthetic).

### Comparison

- Each lease candidate is expanded into one result per term internally. The **best term per car** (lowest average
  monthly cost over its own length) becomes that car's option; the other terms are kept on the option for display.
- **Average monthly cost** for a lease term =
  `(due at signing + payments × term + fees + running costs × term − equity applied) / term`.
- **Mid-lease, "Continue"** = remaining payments + running costs to maturity + disposition fee + projected mileage
  charge, averaged over the remaining months.
- **Mid-lease, "Switch now"** = trade in the current car; equity = trade-in value − early payoff. Positive equity
  reduces the new lease's due at signing (excess beyond due at signing is cash back). Negative equity is paid in
  cash, not rolled in (matches how Kai's shortfall is treated today). Then the new lease's term math as above.
- **Tie-breaker:** after ranking by cost, if the runner-up is within $25/mo of the leader and has fewer NHTSA
  complaints for its model year (recalls as the second key), it moves ahead. The explanation names the counts.
- **Warranty note:** an option whose period exceeds 36 months, or whose projected miles exceed 36,000 over the
  period, gets a tradeoff line saying repairs after that are not covered by the basic warranty.

### Screens

- **Compare:** each lease option shows a row of term choices (12 / 24 / 36 / 48). Each shows average monthly cost,
  due at signing and money factor (shown as an APR equivalent too, `MF × 2400`). The best term is marked; picking
  another term updates that card's numbers. A small reliability panel per car (recalls, complaints, NHTSA, date).
- **Fourth persona:** a highlighted "Switch now" option on Compare and Next Move with the switch math as line items:
  early payoff, trade-in value, equity, new due at signing after equity, new payment, average monthly, monthly
  savings vs continuing.
- **Next Move:** explanation covers why this term (and why not the shorter/longer ones), and reliability when it
  broke a tie.
- Everything synthetic is labeled synthetic; NHTSA counts are labeled observed with their retrieval date.

## Calls made after the builder review (Claude's calls, check these)

1. **One ranking number for every option: average monthly economic cost over that option's own period.** Leases
   use their term; keep, buyout, finance, refinance and "Continue" use the existing horizon (36 months), so for them
   it is `economicCostCents / horizonMonths`. Because Devon's and Kai's options all share the 36-month horizon,
   dividing by 36 keeps their order unchanged. The `lowest_monthly` objective (Kai) still ranks by
   `totalMonthlyCents`. The $25/mo tie margin applies to whichever monthly figure is being ranked. Known limitation,
   stated in the UI: a 12-month lease's average ignores what the person drives after it ends.
2. **Each car is represented by its cheapest *feasible* term.** If no term passes the budget and upfront-cash
   checks, the cheapest term represents the car and it shows as not feasible. The "best" mark is on the term the
   app would actually pick.
3. **Choosing a different term is a display what-if.** All terms are computed once; picking one changes that card's
   numbers only. The ranking and Next Move recommendation always use the app's pick, which the card labels.
4. **Mid-lease is a data question, not a date cutoff.** The switch branch runs only when the lease contract carries
   an early payoff and a trade-in value (both new optional fields). Maria has neither, so her options keep their
   current shape: return-and-replace, buyout, plus the new terms.
5. **Renew = the existing same-model candidate.** Maria's 2025 Camry Hybrid lease candidate is the renewal, now with
   several terms. A month-to-month extension at lease end is shown as an informational bridge (current payment, up to
   6 months), not ranked, because with no due-at-signing it would always win a monthly average.
6. **Candidate leases get a mileage allowance:** 12,000 mi/year at 15¢ per excess mile (synthetic), with projected
   overage from monthly miles added to the term's cost.

## Left to the builder

- Exact synthetic numbers for the fourth persona and for Maria's term table, as long as: the switch wins clearly
  (target at least ~$40/mo better) after all fees; numbers are plausible for 2024–2026 Toyota leases; Maria's
  ranked result can change, but the reason must be explainable from the evidence.
- The persona's name, car and banking fixture (follow `src/fixtures/banking.ts`); route for the Drives tab can reuse
  an existing route id. If `NESSIE_CUSTOMERS` has no mapping for the new persona, it uses the fixture like the others.
- Names of new fields and evidence ids, and whether term expansion lives in `compare.ts` or a new module.
- How the term picker looks, within the existing theme (`src/app/theme.css`) and on phone width (no horizontal
  scroll, per e2e E12).
- New unit tests for the term math, switch math and tie-breaker, and e2e coverage of the term picker and the switch.
