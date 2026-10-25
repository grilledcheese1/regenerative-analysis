# Regentic

Next Move helps a driver decide what to do about their car: keep it, buy out a lease, refinance, or replace it. It
builds an affordable monthly budget from banking data, compares every option over the same horizon, and explains the
leading one with the evidence behind each number. The Drives tab replays modeled hybrid drives on real Austin routes.

- `/` create a demo account, sign in, or explore one of 30 simulated case studies; then the scroll story (where you stand,
  commute, options, hybrid value, next move)
- `/onboarding` a new account's setup: car, how you pay, insurance, driving, goals and banking; `?edit=1` changes answers
- `/home` the tabbed screens (Home, Drives, Cost, Compare, Next Step, Settings) for your own profile or an open case
  study; `?as=<id>` opens a case study
- `/next-move` redirects to `/`

## Run it

```bash
npm install
cp .env.example .env.local   # every variable is optional
npm run dev
npm run check                # lint + typecheck + unit tests + build
npx playwright install chromium   # once per machine
npm run test:e2e
```

## Data modes and honesty notes

- **Banking:** Capital One Nessie sandbox when configured, otherwise a synthetic fixture in Nessie's format. Neither is a
  bank connection or a credit bureau. The header always says which one is loaded.
- **Driving:** a modeled replay on cached real routes. GPS can't measure battery recovery, so regen figures are modeled.
  Imported drives and synthetic samples are labeled as such.
- **Accounts:** demo accounts (email and password, hashed with scrypt) live in server memory, plus `.data/accounts.json`
  outside production. A restart or another server instance forgets them; a signed-in browser stays signed in and re-sends
  its profile, but signing in again needs a new account. Not real authentication.
- **Loan pre-qualification:** lender-style and automated. Policy knock-outs (payment ≤ 20% and debts ≤ 50% of estimated
  gross income, loan ≤ 125% of the car's value, term ≤ 84 months, steady payroll, score ≥ 500), then a logistic
  regression trained on UCI German Credit (`scripts/credit/train.py`, AUC 0.77) that can move the rate tier one band or
  send a file to review but never declines alone. Rates start from Experian Q3 2025 tier averages. Sex, age, marital
  status and nationality are not used. Credit scores live on Nessie loan records: user reported in onboarding,
  synthetic for case studies. Every result is an estimate, not an offer or a credit decision.
- **Lease terms:** lease options come in 12, 24, 36 and 48 months (synthetic rates and residuals, money factor adjusted
  for the credit tier), compared by average monthly cost over each term's own length including what's due at signing,
  fees and expected mileage charges (12,000 mi/year, 15¢/mi). Every option ranks by average monthly cost; NHTSA recall
  and complaint counts (`scripts/fetch-reliability.mjs`, observed, by model year) break ties under $25/mo, and terms
  past Toyota's 3-year / 36,000-mile basic warranty say so. Jordan, mid-lease, shows a switch that pays: trade-in equity
  toward a cheaper lease, every line of the math shown.
- **Your profile:** onboarding answers become a regular persona. "Connect your banking" seeds a new Capital One Nessie
  sandbox customer with four months of history built from your answers and reads it back; without a key (or when Nessie
  fails) the same history is created locally and the screen says so. Toyota Insurance is a simulated connection.
- **Offers:** synthetic scenario inputs. Market listings, when shown, are advertised prices, not offers.
- **AI:** Claude only explains a decision the code already computed; it never decides.
- Every number carries a source (observed, user reported, derived, modeled, synthetic). Unknown values are shown as unknown, never 0.

## Architecture

- `src/domain/` pure calculation code (integer cents, no React/Next imports)
- `src/server/providers/` adapters for external services (server-only)
- `src/app/api/` route handlers
- `src/components/story/` the scroll story and entry; `src/components/auth/` the cookie-only demo sign-in
- `src/components/next-move/` the tabbed screens; `src/components/` Drives replay (map, timeline, panels)
- `src/lib/model/` the braking and regen model behind the Drives replay; `src/data/routes.json` its cached routes
  (`npm run fetch-demo-routes` refreshes them)
- `src/fixtures/people.generated.json` the 26 generated people, built from `simulated_user_data/` by
  `node scripts/build-people.ts`; design references are in `docs/design/`

## Environment variables

See `.env.example` for comments. All optional; missing ones fall back to fixtures and say so on screen.

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs the demo account session cookie. Required in production |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_CAP` | Claude explanations |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS` | Nessie sandbox banking |
| `NESSIE_SEED_ALLOW` | Dev machine only. Never set in Vercel |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` | Market listings |
| `IMPORT_MAX_BYTES` | Drive import size limit (default 4 MiB) |

## Planned, not built

Toyota or Insure Connect data import, an insurer partnership, lender quotes, native trip recording, and persistent
(Supabase) storage. Nothing in the app claims any of these exist.

## Tests

- Unit (`npm test`): budget, loan/lease math, option comparison and ranking (including the Maria, Devon and Kai demo
  scenarios), and the braking model.
- End to end (`npm run test:e2e`): `e2e/` covers routing, the Maria journey, changed inputs, Devon and Kai
  outcomes, sliders, evidence, persona reset, Settings, phone-width overflow and the no-WebGL map fallback. Specs run
  with no provider keys, so fixture banking and template explanations keep them deterministic.

## Workstream docs

See [`docs/workstreams/`](docs/workstreams/). Demo script: [`docs/demo-script.md`](docs/demo-script.md).
