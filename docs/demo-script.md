# Demo script (3 minutes)

DRAFT: final wording and timings after the freeze. Start at `/next-move`, persona Maria, fixture banking.

| Time | Beat | Clicks | Say | Fallback if that feature isn't merged |
| --- | --- | --- | --- | --- |
| 0:00–0:20 | Problem | Home | "Maria's lease ends in four months and she's on track to go over her miles. The real question is what to do next, not how she drives." | none |
| 0:20–0:50 | Driving and current cost | Drives → import the `maria-commute-am`/`pm` samples, then the replay | "We show only what the data supports. The regen figures are modeled, not measured." | Replay only: skip the import |
| 0:50–1:30 | Nessie affordability | Money → income − spending − savings − buffer = $900; Sync from Nessie sandbox; add the $300 bill and re-sync | "Banking data changes the budget, and through it the recommendation." | Fixture: slide New monthly expense to $300 and show the next action change |
| — | Pre-qualification (new) | Sign up → onboarding → Bank step: enter a credit score, Connect with Nessie → the card appears; then Cost on Kai | "Connect your bank and you're instantly pre-qualified: a rate band, how much you can borrow, and the specific reasons, the way a lender has to explain a decision. The model was trained on German Credit and never uses sex, age or nationality." | Case study: Cost tab shows the same card |
| — | Lease terms and the switch (new) | Compare on Maria → four term buttons, "Best", click 12 mo; then Jordan → Next Step "Switch now", Compare → switching math | "Terms are compared all-in over their own length, so a short lease's higher payment and a long lease's warranty gap are both visible. Jordan is mid-lease: the car is worth more than the payoff, so trading in today saves about $370 a month." | Story view → Your options shows the same ranking |
| 1:30–2:20 | Compare plus a changed scenario | Compare → three options → move Gas price; "See listings"; Kai (nothing fits); Devon (keep) | "Same driving, every option. Keeping can win. Sometimes nothing fits, and we say so." | Skip listings |
| 2:20–2:40 | Next step and evidence | Next Move → Claude badge, evidence highlights, official TFS link | "Claude only explains. The decision is computed in code and every number Claude writes is checked against it." | Template explanation: "If Claude isn't available we show the calculated template" |
| 2:40–3:00 | Roadmap | Settings → planned Toyota and insurer integrations | "A future Toyota Insure Connect partnership could add authorized vehicle data. That's roadmap, not built." | none |

## Q&A crib

- **Observed vs modeled vs synthetic?** Observed = read from a source. Modeled = our physics estimate. Synthetic = invented demo input. Each number is chipped.
- **Why might a new hybrid not pay off (Devon)?** His paid-off car has low running cost and he drives little, so payments outweigh fuel savings.
- **Why can't GPS measure battery recovery?** Location and speed don't reveal motor/battery power; only vehicle data would.
- **What would an insurer or Toyota integration need?** A verified data format, user permission and defined permitted uses.
- **Where do reliability numbers come from?** NHTSA's public recalls and complaints APIs, fetched once and labeled observed with the date. They only break near ties.
- **Is this a real credit check?** No. It copies how lenders decide (score tier, payment and debt limits, a risk model, required reasons) on simulated data. Scores are user reported or synthetic.
- **What is Nessie?** Capital One's sandbox API with test data. Not a bank connection or credit bureau.
- **Can Claude make up numbers?** No. The decision is computed in code, and every number Claude writes is checked against the calculation. If it invents one, we show the template instead.
- **Why does an advertised price differ from the scenario price?** Listings are advertised prices; scenarios use synthetic terms that include assumptions about fees and financing.

## Live AI check (needs Anthropic credits)

| Persona | Badge read "Explained by Claude"? | Notes |
| --- | --- | --- |
| Maria | | |
| Devon | | |
| Kai | | |

## Backups

- [ ] Recorded run-through video (add link: ______)
- [ ] Screenshot of every beat
- Fixture mode works offline except the map, which falls back to the SVG preview.
- If a provider fails mid-demo, stay on fixture banking and switch persona (Devon or Kai) to show another outcome.

## Rehearsal log (two full runs on another device after the freeze)

| Run | Device | Time | Problems |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
