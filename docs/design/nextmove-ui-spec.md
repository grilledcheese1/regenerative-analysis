# Next Move shell: UI spec from the mockups

Source: six PNGs in the repo root (`Home(1)`, `Compare(1)`, `Nextmove(1)`, `Money(1)`, `Money(2)`, `Settings(1)`), 1672×941, persona Devon. There is no Drives mockup; it reuses the same card, tile, pill and button system. Type scale, radii and spacing follow `DESIGN (1).md`; font family and weight follow the PNGs (bold sans headings). Everything is SIMULATED and every number is an estimate.

Implementation: `src/components/next-move/nextmove.css` (all rules under `.nm`, light default, `data-nm-theme="dark"` variant), primitives in `src/components/next-move/ui/`.

## Colors (sampled from the PNGs with PIL, then rounded)

| Token | Light | Dark | Where |
| --- | --- | --- | --- |
| `--nm-bg` | `#F3F7FA` | `#0D1013` | page background (plus soft sky/peach radial orbs) |
| `--nm-surface` | `#FFFFFF` | `#161A1F` | header, cards, pills, buttons |
| `--nm-tile` | `#F5F7F9` | `#1D2228` | KPI tiles, ledgers, selects |
| `--nm-tile-border` | `#E6E9EE` | `#2A3036` | tile outlines |
| `--nm-tint` / border | `#FDF3F4` / `#FEBBC3` | `#2A1A1E` / `#6D2A33` | leading option, next-step and decision panels |
| `--nm-red` | `#EB0A1E` (buttons `#F30116`, wordmark `#EF0529`) | `#FF4155` | accent, kickers, active tab, primary buttons |
| `--nm-ink` | `#12121E` | `#EEF0EE` | headings, values |
| text-2 / muted | `#4E4E4E` / `#6B6B76` | `#B7BEC2` / `#8A9398` | secondary text |
| green | `#137A4F` on `#E8F6EC` (status `#29926D`) | `#4CC58A` on `#14261D` | recommended, positive amounts, budget remaining |
| amber | `#8A5A00` | `#E0A43A` | MODELED chip |
| sync dot | `#2FB34A` | same | "Banking loaded" |

Radii: 8 / 12 / 16 / 24. Cards 24, tiles 16, buttons 12, pills 999. Spacing steps 4/8/12/16/20/24/32/48.

## Component map (top to bottom, same on every tab)

1. **Header** (`NextMoveApp.tsx`, `.nm-header`): dot + "Next **Move**" wordmark; persona select pill with car icon and chevron (`aria-label="Demo customer"`); three mono pills `BANKING · FIXTURE`, `DRIVING · MODELED|IMPORTED`, `OFFERS · SYNTHETIC`; divider; Story view link, Sign in, theme toggle; red "← Regen Coach".
2. **Tabs** (`.nm-tabs`, `nav[aria-label="Screens"]`): icon + label for Home, Drives, Money, Compare, Next Move, Settings. Active = red icon, bold ink label, 3px red underline.
3. **Sync bar** (`BankingSyncBar.tsx`, `.nm-sync`): white pill with green dot "Banking loaded (fixture)"; right: "Use fixture", "Sync from Nessie sandbox".
4. **Section head** (`ui/parts.tsx` `SectionHead`): red mono kicker, bold H1 (clamp 30–48px), outline `Pill` beside it, gray lede.
5. **Screen body** (`screens.tsx`, `settings/SettingsScreen.tsx`, `DrivesView.tsx`, `import/ImportDrive.tsx`).

Primitives: `Card` (red icon + mono uppercase title), `KpiTile` (right gray icon, or left tinted icon square on Compare), `Pill`, `Ledger` (rows + bold total), `Icon` (24px line set), `CarArt` (drawn sedan/SUV silhouettes keyed by catalog id).

## Screens and template data (Devon, owned 2016 Corolla; labels are exact)

**Home**: kicker HOME, title "Devon’s 2016 Corolla", pill OWNED OUTRIGHT, lede = persona situation; hero band with `CarArt` fading in from the right over a sky gradient. Card THIS MONTH (2×3 tiles): Payment $0 · Fuel, insurance, maintenance $265 "estimated" · Total vehicle expense $265 · Vehicle budget $550 "from banking data" · Budget remaining $285 (green) · Monthly miles 625 mi "confirm". Card UPCOMING DECISION: pink panel, calendar circle, "No payment due." / "The question is whether replacing the car is worth it.", green status "✓ KEEP THE 2016 COROLLA", red button "Review next move →".

**Money**: kicker MONEY, "What the car can cost each month", pill NESSIE-FORMAT FIXTURE, lede with window dates. VEHICLE BUDGET ledger (Recurring income $5,100 · − Other spending $3,550 · − Savings goal $700 · − Buffer $300 · **= Vehicle budget $550**), checkbox "Income estimate from 6 payroll deposits looks right.", red range "New monthly expense" $250, CASH FOR THE DECISION (Checking + savings $14,000 · − Protected reserve $6,000 · **= Available upfront $8,000**). LEFT OUT OF THE BUDGET, AND WHY (count · amount rows), OBSERVED VEHICLE SPENDING (Insurance $120/mo, Fuel $60/mo, Maintenance $95/mo). ACCOUNTS AND RECENT ACTIVITY: three account tiles (Everyday checking $4,000, Savings $10,000, Credit card −$180) and a table DATE / DESCRIPTION / TYPE · STATUS / AMOUNT, deposits green with +, footer "Retrieved … · source fixture".

**Compare**: kicker COMPARE, "Same driving, every option", pill "36 MONTHS FROM 2026-11-01"; Gas price slider $3.00, Monthly miles slider 471. Three option cards, each 2×4 tiles (Upfront cash, Payment, Total monthly, Budget left, Cash out over horizon, Debt at horizon, Equity at horizon "value − debt", Economic cost "cash out + starting − ending equity") plus a doc-icon tradeoff row. Leader: red 2px border, pink tint, LEADING pill ("Keep the 2016 Corolla": $0 / $0/mo / $265/mo / $285 / $9,557 / $0 / $7,000 / $13,557). Second: "Sell and finance 2025 Camry Hybrid LE" ($3,000 / $333/mo / $534/mo / $16 / $22,231 / $7,466 / $14,034 / $19,197). Excluded: "Sell and buy 2025 Camry Hybrid LE with cash", EXCLUDED pill, red "Needs $20,000 upfront; $8,000 available after the reserve."

**Next Move**: kicker NEXT MOVE, title = recommendation headline ("Keep the 2016 Corolla"), green RECOMMENDED pill. WHY card: bullets, pink NEXT STEP · KEEP THE CURRENT PLAN panel (numbered steps, red "Keep the current car", "A preparation checklist. Nothing is submitted on your behalf."). EVIDENCE card: label + right value, chip (DERIVED red, USER REPORTED gray, MODELED amber, OBSERVED green, SYNTHETIC gray) + gray formula and #id. Bottom strip: info icon + mono "Template explanation (AI explanation unavailable: not configured)." Then Planned integration card.

**Settings**: "What this demo knows and what it may use". VEHICLE AND CONTRACT (Odometer 88,400 mi USER REPORTED; Estimated value $11,000 SYNTHETIC; Contract Owned outright SYNTHETIC), CONNECTIONS (Banking + Sync; Toyota vehicle records, disabled "Connect Toyota records", PLANNED INTEGRATION; Insurer sharing PLANNED INTEGRATION), PERMISSIONS (checkboxes, mono status line), DELETE MY DEMO DATA (red button).

## Behavior kept, and test hooks

Class names and roles used by `e2e/*.spec.ts` are unchanged: `.tag` pills, `.slider` with `.mono`, tab buttons by exact name inside `nav[aria-label="Screens"]`, `select[aria-label="Demo customer"]`, the headings, `data-testid`s. Icons are `aria-hidden`.

## Not in the mockups (decisions made)

Drives tab, dark theme, mobile layout (tiles stack to one column under 520px, tabs scroll horizontally, hero car moves below the title), theme toggle in the header, Story view and Sign in links. Car art is drawn SVG, not a photograph.
