# Next Move UI spec (from the six photos)

Source photos in `docs/design/photos/`: `Home(1).png`, `Money(1).png`, `Money(2).png`, `Compare(1).png`, `Nextmove(1).png`, `Settings(1).png` (1672×941, persona Devon). No Drives photo; Drives reuses the same cards, pills and buttons. Light theme only. Everything is SIMULATED and every number is an estimate.

Code: `src/components/next-move/nextmove.css` (all rules under `.nm`), `ui/Icon.tsx`, `ui/parts.tsx`, `ui/HeroImage.tsx`, `screens.tsx`, `settings/SettingsScreen.tsx`, `NextMoveApp.tsx`, `banking/BankingSyncBar.tsx`.

## Colors (sampled from the photos with PIL, rounded)
page `#F3F7FA` · surface `#FFFFFF` · tile `#F5F7F9` / border `#E6E9EE` · pink panel `#FDF3F4` / border `#FEBBC3` · red `#EB0A1E` (hover `#D20819`, soft `#FDE4E7`) · ink `#12121E` · green `#137A4F` on `#E8F6EC` · amber `#8A5A00` · sync dot `#2FB34A`. Radii 8 / 12 / 16 / 24.

## Layout, top to bottom (every tab)
1. Header: red dot + "Next **Move**"; persona select pill (car icon, chevron); pills `BANKING · FIXTURE`, `DRIVING · MODELED|IMPORTED`, `OFFERS · SYNTHETIC`; divider; red "← Regen Coach".
2. Tabs with icons: Home, Drives, Money, Compare, Next Move, Settings. Active: red icon, bold label, 3px red underline.
3. Sync bar: white pill with green dot ("Banking loaded (fixture)"); "Use fixture" and "Sync from Nessie sandbox" buttons on the right.
4. Section head: red mono kicker, large bold title, outline pill beside it, gray lede.
5. Cards: white, 24px radius, red icon + red mono uppercase title. KPI tile: gray tile, label, bold value, optional sub-line; gray line icon at right (Home, Money) or pink icon square at left (Compare).

## Screens and Devon's template data (exact strings)
- **Home:** HOME · "Devon's 2016 Corolla" · OWNED OUTRIGHT. THIS MONTH: Payment $0 · Fuel, insurance, maintenance $265 "estimated" · Total vehicle expense $265 · Vehicle budget $550 "from banking data" · Budget remaining $285 (green) · Monthly miles 625 mi "confirm". UPCOMING DECISION: "No payment due." / "The question is whether replacing the car is worth it." · "✓ KEEP THE 2016 COROLLA" · "Review next move →".
- **Money:** "What The Car Can Cost Each Month" · NESSIE-FORMAT FIXTURE. VEHICLE BUDGET: Recurring income $5,100 · − Other spending $3,550 · − Savings goal $700 · − Buffer $300 · = Vehicle budget $550; checkbox "Income estimate from 6 payroll deposits looks right."; slider New monthly expense $250. CASH FOR THE DECISION: Checking + savings $14,000 · − Protected reserve $6,000 · = Available upfront $8,000. LEFT OUT OF THE BUDGET, AND WHY; OBSERVED VEHICLE SPENDING (Insurance $120/mo, Fuel $60/mo, Maintenance $95/mo). ACCOUNTS AND RECENT ACTIVITY: Everyday checking $4,000, Savings $10,000, Credit card −$180; table DATE / DESCRIPTION / TYPE · STATUS / AMOUNT.
- **Compare:** "Same driving, every option" · "36 MONTHS FROM 2026-11-01"; Gas price $3.00, Monthly miles 471. Cards of 2×4 tiles: Upfront cash, Payment, Total monthly, Budget left, Cash out over horizon, Debt at horizon, Equity at horizon, Economic cost; tradeoff row. Leader: red border, pink tint, LEADING. Excluded: EXCLUDED, red "Needs $20,000 upfront; $8,000 available after the reserve."
- **Next Move:** "Keep the 2016 Corolla" · RECOMMENDED. WHY (bullets) and NEXT STEP · KEEP THE CURRENT PLAN panel with "Keep the current car". EVIDENCE rows with chips: DERIVED (red), USER REPORTED (gray), MODELED (amber), OBSERVED (green), SYNTHETIC (gray). Mono explanation strip.
- **Settings:** "What this demo knows and what it may use": VEHICLE AND CONTRACT, CONNECTIONS, PERMISSIONS, DELETE MY DEMO DATA.

The numbers in the app can differ from the photos (the photos had a $250 "new monthly expense" set); that is data, not layout.

## Car picture on Home
Put one image per catalog car in `public/cars/` named `<catalogId>.jpg` (or `.png`, `.webp`). Until a file exists the hero shows only the sky gradient. Ids: `camry_hybrid_le_2024`, `camry_hev_le_2025`, `corolla_hybrid_2025`, `corolla_2016`, `rav4_awd_2021`, `rav4_hybrid_awd_2025`. Use images you have the right to use (not Toyota marketing photos).
