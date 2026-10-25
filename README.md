# Next Move + Regen Coach

Next Move helps a driver decide what to do about their car: keep it, buy out a lease, refinance, or replace it. It
builds an affordable monthly budget from banking data, compares every option over the same horizon, and explains the
leading one with the evidence behind each number. The same app also contains the Regen Coach dashboard (`/`), which
replays simulated hybrid drives on real Austin routes and scores regenerative braking.

- `/` Regen Coach dashboard
- `/next-move` Next Move (Home, Drives, Money, Compare, Next Move, Settings)

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
- **Offers:** synthetic scenario inputs. Market listings, when shown, are advertised prices, not offers.
- **AI:** Claude only explains a decision the code already computed; it never decides.
- Every number carries a source (observed, user reported, derived, modeled, synthetic). Unknown values are shown as unknown, never 0.

## Architecture

- `src/domain/` pure calculation code (integer cents, no React/Next imports)
- `src/server/providers/` adapters for external services (server-only)
- `src/app/api/` route handlers
- `src/components/next-move/` Next Move screens; `src/components/` Regen Coach and Drives replay

## Environment variables

See `.env.example` for comments. All optional; missing ones fall back to fixtures and say so on screen.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Map tiles (blank = static route preview) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_CAP` | Claude coaching and explanations |
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
- End to end (`npm run test:e2e`): `e2e/` covers page separation, the Maria journey, changed inputs, Devon and Kai
  outcomes, sliders, evidence, persona reset, Settings, phone-width overflow and the missing-Mapbox fallback. Specs run
  with no provider keys, so fixture banking and template explanations keep them deterministic.

## Workstream docs

See [`docs/workstreams/`](docs/workstreams/). Demo script: [`docs/demo-script.md`](docs/demo-script.md).
