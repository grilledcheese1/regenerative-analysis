# Stream 1 — Drive imports and driving profile

**Owner:** _(name)_ · **Branch:** `ws/drive-imports` · **Depends on:** nothing · **Version:** 2, 2026-10-24

**Goal:** On the Next Move Drives tab, a user can import a GPX (or the documented CSV) drive, or try a sample drive, and see an honest preview: date, distance, gaps, source, and which analysis the data supports. They confirm it, and the confirmed trips plus a confirmed weekly driving pattern produce a `DrivingProfile` (monthly miles, city share). Passed to `onProfile`, it replaces the persona's assumed usage in the comparison, so imported driving visibly changes fuel cost, lease mileage projection and possibly the next action.

## 0. Shared rules (identical in all four workstream documents)

### 0.1 These four streams run fully in parallel

Everything shared already exists on `main`. **No stream waits for, or edits files owned by, another stream:**

- **Contracts:** all types are in `src/contracts/`.
- **Server helpers:** everything under `src/server/` is in place.
- **Dependencies:** every package is installed and pinned.
- **Environment variables:** all are listed in `.env.example`.
- **Test config:** Playwright is set up, and each stream has its own spec file.
- **Mount points:** every new component is already mounted in the Next Move shell as a stub in its owner's folder.

Each stream fills in its own files and merges whenever it is green, in any order. If you find you need to change a file you don't own, treat that as a gap in this split: tell the stream 4 owner, who makes the change on `main`. You should not need to.

| # | Stream | Document | Delivers |
|---|---|---|---|
| 1 | Drive imports | `1-drive-imports.md` | GPX/CSV import, trip preview, driving profile feeding Compare |
| 2 | Nessie banking | `2-nessie-banking.md` | Live sandbox customers, retries, stale-read fallback, the "Best use of Nessie" moment |
| 3 | Market research | `3-market-research.md` | SerpAPI listings and dealers, saved results fallback |
| 4 | Shell and ship | `4-shell-and-ship.md` | Settings, polish, failure states, end-to-end tests, deploy, demo, live AI check |

The recommendations API and grounded Claude explanation (old Workstream C) is **done**. `done-C-recommendations-ai.md` documents it for reference.

### 0.2 Where things are (verified 2026-10-24)

- **Pages:**
  - `/` is the team's Regen Coach dashboard (`src/app/page.tsx` → `src/components/Dashboard.tsx`).
  - Next Move is a separate page at **`/next-move`** (`src/app/next-move/page.tsx` → `src/components/next-move/NextMoveApp.tsx`).
  - Don't link, redirect or restyle `/` from Next Move work.
- **Next Move tabs:** Home, Drives (the Regen replay reused), Money, Compare and Next Move.
  - The three personas Maria, Devon and Kai come from `src/fixtures/`.
  - Banking is a Nessie-format fixture until a sandbox read succeeds.
- **Calculations:** pure functions in `src/domain/`. `runScenario()` produces the budget and comparison for both the screens and the server, so figures reconcile everywhere.
- **Server API already live:**
  - `POST /api/banking/nessie/sync` stores each successful read for the owner.
  - `POST /api/options/compare`
  - `POST /api/recommendations`, `GET /api/recommendations/[id]`
  - `GET` and `PUT /api/consents`
  - `DELETE /api/me/data`
  - `GET /api/demo/customers`
  - Regen Coach's own routes: `/api/{routes,trips,compare,coach}`.
- **Checks:** 81 Vitest tests and 3 Playwright specs pass, and `npm run check` is green. Demo facts the tests enforce, so **don't break them:**
  - Maria: the buyout leads but needs a quote.
  - Maria with +$300/mo of spending gets a different result.
  - Devon keeps his car.
  - Kai has no feasible option.

### 0.3 Next.js 16.4: read before writing routes

The `AGENTS.md` warning is real. Read these first:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`

Dynamic `params` is a **Promise**. Type it as `{ params }: { params: Promise<{ id: string }> }`, then `const { id } = await params` (see `src/app/api/recommendations/[id]/route.ts`). `cookies()` is async. `middleware.ts` is now `proxy.ts`, and nobody needs it.

### 0.4 Conventions

- **Units:** money is integer cents, rates are basis points, and distance and speed are meters and m/s internally. Timestamps are ISO-8601 UTC. Format only at the edge, with `usd()` from `src/domain/format.ts`.
- **Unknown values:** use `Maybe<T>` / `unknown(reason)`, **never 0**.
- **Sources:** every displayed number carries a `SourceKind` (`observed | user_reported | derived | modeled | synthetic`).
- **Errors:** return `apiError()` from `src/server/http.ts`, with the shape `{ error: { code, message, retryable, fieldErrors?, requestId } }`.
  - 400 invalid input
  - 404 not found or not yours
  - 409 conflict or resync
  - 413 too large
  - 422 supported but unusable
  - 429 rate limited
  - 502 provider error
  - 503 not configured or unavailable
- **Never relabel a failed live call as fixture or success.** Offer the fallback explicitly and label it.
- **Code boundaries:** `src/domain/**` imports nothing from React, Next or `src/server`. Server modules that hold secrets start with `import "server-only"`; Vitest stubs it, so they stay testable.
- **Styles:** new CSS goes in a **CSS module next to your component**, using the tokens in `src/app/globals.css` (`--border`, `--text-2`, `--muted`, `--accent`, `--accent-text`, `--panel`, `--font-mono`, …).
- **Dependencies:** don't add any; everything needed is installed. If you truly need one, ask stream 4. A second lockfile change is the one way parallel branches collide.

### 0.5 File ownership (exclusive)

| Owner | Files |
|---|---|
| **1 Drive imports** | `src/domain/driving/**`, `src/server/imports/**`, `src/app/api/imports/**`, `src/app/api/drives/**`, `src/components/next-move/import/**`, `public/samples/**`, `scripts/make-sample-drives.mjs`, `tests/driving/**`, `e2e/drive-imports.spec.ts` |
| **2 Nessie banking** | `src/server/providers/nessie.ts`, `src/server/providers/nessie-normalize.ts`, `src/fixtures/banking.ts`, `src/app/api/banking/**`, `src/app/api/dev/**`, `src/app/api/demo/**`, `src/components/next-move/banking/**`, `tests/banking/**`, `e2e/nessie-banking.spec.ts` |
| **3 Market research** | `src/server/providers/serpapi.ts`, `src/app/api/market/**`, `src/fixtures/market-cache.json`, `src/components/next-move/market/**`, `tests/market/**`, `e2e/market-research.spec.ts` |
| **4 Shell and ship** | `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, `src/components/next-move/settings/**`, `src/components/next-move/explain/**`, `src/app/next-move/**`, `src/app/icon.*`, the Next Move section of `src/app/globals.css` (after `/* ---------- Next Move shell ---------- */`), `src/components/DrivesView.tsx`, `scripts/fetch-demo-routes.mjs`, `playwright.config.ts`, `e2e/shell.spec.ts`, `README.md`, `.env.example`, `package.json`/lockfile, deployment, `docs/demo-script.md`. Also the finished recommendations code, for fixes and prompt tuning: `src/server/{session,store,http,hash,records}.ts`, `src/server/explain/**`, `src/app/api/{options,recommendations,consents,me}/**`, `src/domain/**`, `src/contracts/{index,explain}.ts`, `tests/{finance,budget,compare,scenario,braking}.test.ts`, `tests/server/**`, `tests/explain/**` |

**Contract files.** `src/contracts/driving.ts` belongs to stream 1, `banking-sync.ts` to stream 2 and `market.ts` to stream 3. Their shapes are **frozen** because the shell already consumes them. You may add optional fields; don't rename or remove any. `src/contracts/index.ts` already re-exports all of them, so nobody edits it.

### 0.6 Server helpers you can use today

Owned by stream 4; don't edit them:

```ts
import { ownerId } from "@/server/session";            // async; demo owner from the httpOnly "nm_sid" cookie (route handlers only)
import { ownedStore, deleteOwnerData } from "@/server/store";
//   ownedStore<T>(name, { maxPerOwner? }) → { get(owner,id), put(owner,id,v), list(owner) /* newest first */, remove(owner,id) }
//   Stores live on globalThis (in memory). DELETE /api/me/data clears every store automatically.
import { apiError, newRequestId, withIdempotency } from "@/server/http";
//   withIdempotency(req, owner, routeName, async (parsedJsonBody) => Response): replays on same key+body, 409 on a different body
import { sha256Hex, canonicalJson } from "@/server/hash";
import { bankingSnapshots, fieldErrors } from "@/server/records"; // fieldErrors(zodIssues) → { "a.b": "message" }
```

**Store names are reserved per stream:**

- **Stream 1:** `imports`, `trips`
- **Stream 2:** `banking_snapshots`, already exported as `bankingSnapshots` and keyed `${personaId}:fixture` / `${personaId}:sandbox`
- **Stream 3:** keeps its cache in a module-level `Map`; the data is public, so it needs no owner store
- **Stream 4:** `comparisons`, `recommendations`, `consents`, `idempotency`

**Tests.** Mock the cookie with `tests/server/cookies.ts`: `vi.mock("next/headers", () => ({ cookies: cookiesMock }))`, then `asOwner("a" | "b")` to switch users. `tests/server/routes.test.ts` shows the pattern.

**In memory only.** Vercel instances don't share memory, so server records are best-effort. A route that needs a missing record returns `409 { code: "<thing>_not_found_resync" }`, and the client re-sends.

### 0.7 Mount points: already wired, you only fill in your own file

| Component (owner) | File | Props (frozen) | Already mounted in | What the shell does with it |
|---|---|---|---|---|
| `ImportDrive` (1) | `src/components/next-move/import/ImportDrive.tsx` | `{ personaId, vehicleLabel, onProfile(p: DrivingProfile \| null) }` | Drives tab, above the replay; remounts per persona | `onProfile(p)` sets Compare's monthly miles (if `p.monthlyMiles.known`), city share (if known) and usage source; the header tag becomes "Driving · imported". `onProfile(null)` reverts to the persona estimate |
| `useBankingSync` and `BankingSyncBar` (2) | `src/components/next-move/banking/` | hook `useBankingSync(personaId): BankingSyncState`; bar takes `BankingSyncState` | The shell calls the hook; the bar sits under the tabs | The shell reads `bank`, `mode` and `stale` (header tag "Banking · fixture / Nessie sandbox / stale sandbox read") and sends `mode` to the explanation API |
| `MarketResearch` (3) | `src/components/next-move/market/MarketResearch.tsx` | `{ catalogId, label }` | Inside every Compare option card whose `kind` is `lease_new` or `purchase_new` | Nothing else; the component owns its whole UI, including any disclosure |
| `DealerList` (3) | `src/components/next-move/market/DealerList.tsx` | `{ near: string }` | Next Move card, when `nextAction` is `compare_confirmed_offers` or `request_buyout_quote` (no persona reaches the first, so dealers also serve Maria's buyout quote) | Nothing else |
| `AiExplanation` (4, done) | `src/components/next-move/explain/AiExplanation.tsx` | `{ request, recommendation, evidence, onCite }` | Next Move card | Highlights cited evidence |

Today the stubs render nothing, or reproduce current behavior in the banking hook's case. **Replace the body; keep the file path, the default or named export and the props.**

### 0.8 Environment variables (all already in `.env.example`)

| Variable | Stream |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 4 (map) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (the committed `.env` sets `claude-sonnet-5-5`), `AI_DAILY_CAP` | 4 |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS`, `NESSIE_SEED_ALLOW` (dev only; never in Vercel) | 2 |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` (default 20; the free plan allows 250 searches a month) | 3 |
| `IMPORT_MAX_BYTES` | 1 |

### 0.9 Merging: any time, any order

1. `git switch main && git pull && git switch -c ws/<stream>`
2. Work only in your files.
3. Before merging: `git rebase main`, `npm run check` (lint, typecheck, unit tests, build), and `npx playwright test e2e/<your>.spec.ts e2e/shell.spec.ts`. You need `npx playwright install chromium` once per machine.
4. Merge to `main` when green. Since no two streams share a file, rebases don't conflict.

### 0.10 Definition of done (every stream)

- `npm run check` is green.
- Your unit tests cover your acceptance list, and your `e2e/<stream>.spec.ts` passes alongside `e2e/shell.spec.ts`.
- No new browser console errors on `/next-move`, and `/` is unchanged.
- The demo facts in §0.2 still hold.
- Every new number has a source label, and unknowns show as unknown.
- Failures are explicit and labeled.
- Nothing claims a Toyota or insurer integration, approval, quote or booking that doesn't exist.

### 0.11 Relationship to the team `AGENTS.md` (Regen Coach Streams 1–4)

`AGENTS.md` on `main` defines four **Regen Coach** streams (1 Physics and Scoring, 2 Data and API, 3 Map and Charts, 4 UI, Theme and Pitch). Those rules govern the dashboard at `/`. These Next Move streams **do not edit** Regen Coach files:

- `src/lib/physics/**`, `src/config/regen.config.ts`, `src/lib/trip/**`, `src/lib/model/**`
- `src/components/map/**`, `src/components/charts/**`
- `src/components/{Dashboard,Panels,RouteMap,RouteSvg,Timeline}.tsx`
- `data/**`, `simulated_user_data/**`, `scripts/fetch-routes.mjs`
- `src/app/api/{routes,trips,compare,coach}/**`
- `src/app/{page,layout}.tsx`
- the Regen section of `src/app/globals.css` (everything before the Next Move marker)

If Next Move needs a change there, ask that Regen stream's owner.

---

## 1. Scope

**In scope**

1. Canonical driving contracts (`src/contracts/driving.ts`).
2. Safe GPX parser and exact-header CSV parser (pure).
3. Trip normalization, segmenting, derived speed, quality findings and summary metrics (pure).
4. Driving profile builder: monthly miles and city share, requiring weekly confirmation (pure).
5. Import API: upload → preview → confirm or cancel; trips list and detail; owner-scoped; deduplicated by content hash.
6. Sample drives: committed synthetic GPX files built from the cached Austin routes, including deliberately flawed ones.
7. `ImportDrive` UI with preview, confirmation, trip list, weekly confirmation and `onProfile`.
8. Tests for every acceptance row in §8.

**Out of scope** (say so in the UI where relevant)

- Mapbox Map Matching. This is a stretch goal (§9) and never a source of observed speed.
- Native or background recording.
- Toyota or Insure Connect file parsing. Show a disabled option, "Supported vehicle records: planned integration".
- Replacing the Regen replay simulator. `DrivesView` stays as the modeled replay; imported trips get their own preview.
- Insurance or "safety" scoring of any kind.

---

## 2. Contracts: already in `src/contracts/driving.ts` (frozen)

These types are committed and re-exported from `@/contracts`. The shell already uses `DrivingProfile`, through `onProfile`. Add optional fields if you need them; don't rename or remove any. Copied here for reference; the file is the source of truth.

```ts
import type { Maybe, SourceKind } from "./index";

export const PARSER_VERSION = "gpx-1"; // bump when parsing behavior changes
export type ImportFormat = "gpx" | "csv";
export type ImportState = "preview_ready" | "confirmed" | "failed" | "cancelled";
// (uploaded/validating/processing exist in the spec; our parse is synchronous so we jump straight to preview_ready)

export type QualityCode =
  | "missing_timestamps"        // geometry usable, speed-change analysis disabled
  | "duplicate_time_conflict"   // same timestamp, different position → interval excluded
  | "long_gap"                  // > GAP_BREAK_S between points → segment break, no inferred path
  | "sparse_sampling"           // median interval > 2 s → event analysis restricted
  | "low_accuracy"              // horizontal accuracy > ACCURACY_MAX_M → excluded from derivatives
  | "too_few_points"            // < 10 usable points
  | "single_trip_only"          // < 2 confirmed trips → no "recurring journey" claims
  | "weekly_driving_unconfirmed"// annual mileage projection needs confirmation
  | "synthetic_sample";         // file came from our sample set

export interface QualityFinding { code: QualityCode; message: string; count?: number }

export interface TripPoint {
  t: string | null;            // ISO UTC; null when the file had no time
  lat: number; lon: number;    // decimal degrees
  observedSpeedMps: number | null;   // only from the file (<speed> extension or CSV speedMps)
  derivedSpeedMps: number | null;    // computed by us; never written into observedSpeedMps
  accuracyM: number | null;
  altitudeM: number | null;
}

export interface TripSegment { points: TripPoint[] } // a long gap starts a new segment

export interface TripQuality {
  routeAvailable: boolean;          // geometry is drawable
  speedAvailable: boolean;          // observed or derivable speed exists for most of the trip
  eventAnalysisAvailable: boolean;  // timing dense enough for speed-change observations
  findings: QualityFinding[];
}

export interface TripSummary {
  distanceMeters: number;           // sum within segments only; gaps are not bridged
  startAt: string | null; endAt: string | null;
  durationS: Maybe<number>;
  movingTimeS: Maybe<number>;
  avgMovingSpeedMps: Maybe<number>;
  cityShare: Maybe<number>;         // share of distance below CITY_SPEED_MPS; modeled heuristic
  sharpDecelEvents: Maybe<number>;  // only when eventAnalysisAvailable
  originalSampleCount: number;
  usedSampleCount: number;
}

export interface ImportPreview {
  importId: string;
  vehicleId: string;                // persona id for the demo
  filename: string; byteCount: number; contentHash: string; // sha256 hex
  format: ImportFormat; parserVersion: string;
  source: { kind: "gpx_upload" | "csv_upload" | "sample"; mode: SourceKind }; // sample → "synthetic"
  state: ImportState;
  quality: TripQuality;
  summary: TripSummary;
  previewGeometry: [number, number][]; // [lon, lat], decimated to ≤ 500 points, NaN-free
  segmentBreaks: number[];            // indexes in previewGeometry where a new segment starts
  createdAt: string;
  duplicateOf?: string;               // set when the same hash was already imported
  tripIds?: string[];                 // after confirm
  error?: { code: string; message: string };
}

export interface TripRecord {
  tripId: string; importId: string; vehicleId: string;
  source: ImportPreview["source"];
  summary: TripSummary; quality: TripQuality;
  geometry: [number, number][];       // decimated; full points are not returned by the API
  segmentBreaks: number[];
  driverConfirmed: true;
  createdAt: string;
}

export interface WeeklyDriving {
  tripsPerWeek: number;               // user confirmed, e.g. 10 for a 5-day two-way commute
  otherMilesPerWeek: number;          // user confirmed errands etc.
  weeksPerYear: number;               // default 48 (spec: vacation weeks excluded)
}

export interface DrivingProfile {
  vehicleId: string;
  tripCount: number;
  avgTripMiles: Maybe<number>;
  monthlyMiles: Maybe<number>;        // unknown("weekly_driving_unconfirmed") without WeeklyDriving
  cityShare: Maybe<number>;
  source: SourceKind;                 // "derived" (trips) + "user_reported" (weekly) → report "user_reported"
  findings: QualityFinding[];
  computedAt: string;
}
```

Tunable constants live in `src/domain/driving/constants.ts`, each with a comment saying it is a prototype setting rather than a validated threshold:

```ts
export const GAP_BREAK_S = 30;        // longer gap → new segment
export const SPARSE_MEDIAN_S = 2;     // spec: median interval above two seconds
export const ACCURACY_MAX_M = 25;     // exclude from speed derivatives above this
export const MIN_POINTS = 10;
export const CITY_SPEED_MPS = 20.1;   // 45 mph
export const SHARP_DECEL_MPS2 = 3.0;  // sustained ≥ 2 s; "sharp deceleration observed in this recording"
export const MAX_TRACK_POINTS = 200_000;
export const MAX_XML_DEPTH = 12;
export const PREVIEW_POINTS = 500;
```

---

## 3. Parsing (pure, `src/domain/driving/`)

### 3.1 `parse-gpx.ts` → `parseGpx(text: string): ParsedPoints | ParseFailure`

`fast-xml-parser@5.11.2` is already installed and pinned; don't change it. Read `node_modules/fast-xml-parser/README.md` and its docs for the v5 option names. They changed between v4 and v5, so don't trust memory.

**Reject before parsing.** Return `ParseFailure { code, message }`, which the route maps to 400 unless noted:

1. The text contains `<!DOCTYPE` or `<!ENTITY` (case-insensitive) → `unsupported_xml_feature`. This blocks XXE and billion-laughs payloads at the string level, before any parser sees them.
2. The XML declaration states a non-UTF-8 encoding → `unsupported_encoding`.
3. The text is zip or gzip (starts with `PK\x03\x04` or `\x1f\x8b`) → `archive_not_supported`. The route also checks the raw bytes.
4. Nesting depth exceeds `MAX_XML_DEPTH`. Check with a quick scan: count the max running depth of `<tag` vs `</tag` / `/>` → `xml_too_deep`.
5. The count of `<trkpt` exceeds `MAX_TRACK_POINTS` → 413 `too_many_points`.

**Parser options** (verify the names for your version):

- Entity processing off (`processEntities: false`)
- No DTD handling
- Attributes on (`ignoreAttributes: false`) with no prefix, so `lat`/`lon` read cleanly
- Tag values left as strings (`parseTagValue: false`), parsed yourself
- `isArray` forcing `trk`, `trkseg` and `trkpt` to arrays

**Extract.** For each `trk/trkseg/trkpt`:

- `lat`, `lon`: required; must be finite and within range.
- `time`: optional. Parse with `Date.parse`, which must yield a finite value; store `new Date(ms).toISOString()`. Timestamps with offsets such as `-05:00` normalize to UTC.
- `ele` → `altitudeM`.
- Speed from extensions, if present: `extensions/speed` or Garmin `gpxtpx:TrackPointExtension/gpxtpx:speed`. Accept only m/s. If the unit is unknown, ignore it and add no finding.
- `hdop` is **not** meters. Ignore it for `accuracyM`, or note it in a code comment.

Each source `trkseg` starts a segment. Points with bad `lat`/`lon` are dropped and counted. If zero usable points remain → 422 `gpx_no_track_points`. Route-only files (`rte`/`wpt` without `trk`) → 422 `gpx_route_not_track`, with the message "This file has a planned route, not a recorded drive."

### 3.2 `parse-csv.ts` → `parseCsv(text: string)`

- The header must equal exactly `timestamp,latitude,longitude,speedMps,horizontalAccuracyMeters,altitudeMeters` after trimming and stripping a BOM. Otherwise → 400 `csv_header_mismatch`, with the expected header in the message.
- `timestamp`, `latitude` and `longitude` are required. The timestamp must carry a zone (`Z` or `±hh:mm`). A zone-less timestamp → 400 `csv_timestamp_without_zone` naming the row number.
- **Empty optional fields → `null`, never 0.** This is an acceptance test.
- Allow no quoted fields; reject a `"` anywhere with `csv_quoting_not_supported`. Cap at `MAX_TRACK_POINTS` rows.
- `speedMps` → `observedSpeedMps` (source: observed).

### 3.3 `normalize.ts` → `normalizeTrack(points, segments) → { segments: TripSegment[]; quality: TripQuality }`

Steps, in order:

1. **Sort** by time within each segment when every point has a time. If some points are missing a time, keep file order and add `missing_timestamps` with a count.
2. **Duplicate times.** Two or more points with the same `t`: if all positions are within 2 m, keep one. Otherwise drop all of them, add `duplicate_time_conflict` with the count, and treat the spot as a gap so we don't draw through it.
3. **Gap break.** If Δt exceeds `GAP_BREAK_S`, start a new segment and add `long_gap`. Never interpolate across a gap.
4. **Derived speed.** For consecutive points with Δt ≥ 1 s, where both accuracies are null or ≤ `ACCURACY_MAX_M`: haversine distance / Δt. Smooth with a centered 5-point median, then a 3-point mean. This avoids amplifying GPS noise, as the spec requires. Points outside the accuracy limit get `derivedSpeedMps = null` and add `low_accuracy` with a count.
5. **Quality flags:**
   - `routeAvailable` = at least `MIN_POINTS` usable points.
   - `speedAvailable` = at least 80% of the moving distance has an observed or derived speed.
   - `eventAnalysisAvailable` = `speedAvailable`, no `missing_timestamps`, and a median Δt ≤ `SPARSE_MEDIAN_S`. If the median exceeds the limit, add `sparse_sampling`.

### 3.4 `summary.ts` → `summarizeTrip(segments, quality): TripSummary`

| Field | Rule |
|---|---|
| `distanceMeters` | Haversine sum within each segment only |
| `durationS` | `endAt − startAt` when times exist; otherwise `unknown("missing_timestamps")` |
| `movingTimeS` | Sum of Δt where speed exceeds 0.5 m/s |
| `cityShare` | Distance-weighted share with speed < `CITY_SPEED_MPS`. Only when `speedAvailable`; otherwise unknown. Label as **modeled** in the UI |
| `sharpDecelEvents` | Only when `eventAnalysisAvailable`. Count runs where the smoothed deceleration is ≥ `SHARP_DECEL_MPS2` for ≥ 2 s, merging runs less than 3 s apart. Otherwise `unknown("event_analysis_unavailable")`. **Never fabricate events on sparse data.** UI wording: "N sharp decelerations observed in this recording". Never "unsafe" |

### 3.5 `decimate.ts`

Douglas–Peucker on [lon, lat], with tolerance chosen iteratively to land at or below `PREVIEW_POINTS`. Keep segment boundaries as their own polylines. Return `{ geometry, segmentBreaks }`.

### 3.6 `profile.ts` → `buildDrivingProfile(vehicleId, trips: TripRecord[], weekly: WeeklyDriving | null, now): DrivingProfile`

- `avgTripMiles` = mean of trip distances in miles (1609.344 m/mi). Unknown if there are no trips.
- `monthlyMiles` = `(avgTripMiles × tripsPerWeek × weeksPerYear + otherMilesPerWeek × weeksPerYear) / 12`, rounded to whole miles. Without `weekly` → `unknown("weekly_driving_unconfirmed")` plus that finding.
  - **Spec check (put this in a test):** 5 workdays × 2 trips × 48 weeks = 480 trips/yr, not 730.
- `cityShare` = distance-weighted mean of the trips' known `cityShare`. Unknown if none are known.
- With fewer than 2 trips → add `single_trip_only`. The UI must then not say "your commute" or "recurring".
- `source`: `"user_reported"` when `weekly` is present, since the projection rests on the user's confirmation. Otherwise `"derived"`.

---

## 4. Server: `src/server/imports/` and routes

`src/server/imports/service.ts` (`import "server-only"`) holds the stores and the pipeline, so routes stay thin:

```ts
const imports = ownedStore<ImportPreview & { bytes?: Uint8Array }>("imports", { maxPerOwner: 50 });
const trips   = ownedStore<TripRecord>("trips", { maxPerOwner: 200 });
```

Original bytes are kept with the job in memory only until confirm or cancel, then dropped. Add a comment: "production: private owner-scoped object storage, 14-day retention (engineering guide)". Never log bytes, coordinates or filenames. Log `requestId`, `importId`, the error code and duration.

### 4.1 `POST /api/imports`: `multipart/form-data` with `file`, `vehicleId`, and optional `sample=1`

1. `owner = await ownerId()` and `requestId = newRequestId()`.
2. If `Content-Length` is above `IMPORT_MAX_BYTES` → 413 `file_too_large`. Check this **before** reading the body. Then read `await file.arrayBuffer()` and check `byteLength` again, since the header can lie.
3. `vehicleId` must be a known persona id → otherwise 400 with `fieldErrors.vehicleId`.
4. Format comes from the extension (`.gpx` / `.csv`), cross-checked by sniffing: GPX contains `<gpx`, and CSV's first line is the exact header. A mismatch or other extension → 400 `unsupported_format`. Archive magic bytes → 400 `archive_not_supported`.
5. Decode with `new TextDecoder("utf-8", { fatal: true })`. On failure → 400 `unsupported_encoding`.
6. `contentHash = sha256(bytes)` via `crypto.subtle.digest`. If a non-cancelled import for **(owner, vehicleId, hash)** exists → **200**, returning that preview with `duplicateOf = existing.importId`. Do not create a second job or trip.
7. Parse → normalize → summarize → decimate, then store `state: "preview_ready"` → **201** `{ requestId, preview }`.
8. A parse failure stores a `failed` job, so the error is inspectable, and returns the mapped status with the error body.

`sample=1` is accepted only when the filename matches a file in `public/samples/`. It sets `source.kind = "sample"`, `mode: "synthetic"`, and adds `synthetic_sample`.

### 4.2 `GET /api/imports/[id]`
Owner-scoped. Missing or not yours → 404 `not_found`. Returns `{ requestId, preview }` without bytes.

### 4.3 `POST /api/imports/[id]/confirm`: `{ driverConfirmed: true, vehicleId }` (zod), wrapped in `withIdempotency`

- `state` must be `preview_ready`. Already `confirmed` with the same body → replay. `cancelled` or `failed` → 409 `import_not_confirmable`.
- `driverConfirmed` must be literally `true`; otherwise 400. Passenger trips are not personal driving data.
- `routeAvailable === false` → 422 `trip_not_usable`.
- Create one `TripRecord` per source track. Our segments from gap splitting stay inside one trip as `segmentBreaks`.
- Set `state = "confirmed"` and `tripIds`, drop the bytes → 201 `{ requestId, tripIds }`.

### 4.4 `DELETE /api/imports/[id]`
Cancels a `preview_ready` job (state `cancelled`, bytes dropped) → 200. Confirmed jobs → 409. This is the spec's "cancelling an import" browser test.

### 4.5 `GET /api/drives?vehicleId=`
Returns `{ requestId, trips: TripRecord[] }` for the owner, newest first, without per-point data.

### 4.6 `GET /api/drives/[id]`
Owner-scoped detail. Same shape. The geometry is already decimated.

There is **no profile route.** The profile is a pure function the client runs on `GET /api/drives` results plus the weekly form. Keep it that way.

---

## 5. Sample drives: `scripts/make-sample-drives.mjs` → `public/samples/`

A Node script with no TS imports. It reads `src/data/routes.json`, where each route has `points[{ s, lat, lon, elevationM, limitMs }]` and `stopsM[]`, and writes:

| File | Built from | Purpose |
|---|---|---|
| `maria-commute-am.gpx` | the longest "city" route, 1 s sampling, speed ≈ 0.85 × `limitMs` with a 20 s stop at each `stopsM` | clean trip, event analysis on |
| `maria-commute-pm.gpx` | the same route reversed, starting 9 h later | a second trip, so "recurring" wording becomes allowed |
| `devon-errand.gpx` | a short route, 1 s sampling | Devon persona |
| `kai-highway.gpx` | the fastest route | high speed → low city share |
| `sparse-no-time.gpx` | any route with every 15th point and **no `<time>`** | shows "route only, no speed analysis" |
| `gap-and-noise.gpx` | a route with a 90 s gap in the middle and a burst of duplicate-time conflicts | shows the segment break and exclusions |

Every file has `<metadata><desc>Synthetic sample generated from a cached Austin route for the Next Move demo. Not a recorded drive.</desc></metadata>`. Base date: 2026-10-20 in America/Chicago, written as UTC `Z`. Add a deterministic small lat/lon jitter (seeded LCG, ±2 m) so the derived-speed smoothing is exercised. Commit the outputs. The script is for regeneration only.

---

## 6. UI: `src/components/next-move/import/`

`ImportDrive.tsx` (`"use client"`) plus `ImportDrive.module.css`, `TripPreview.tsx`, `WeeklyForm.tsx`.

**Layout** (a card above the Regen replay, which keeps its "modeled" banner):

1. Header "Your Trips", with tag **"Imported trips · observed"** or **"Sample trips · synthetic"**.
2. Actions:
   - **Import a drive**: a file input, `accept=".gpx,.csv"`, with a visible label.
   - **Try a sample drive**: a small menu of the six samples. It fetches `/samples/<file>` and posts it as a `File` with `sample=1`.
   - A disabled third option: "Supported vehicle records (planned integration)", with a tooltip saying it needs a verified Toyota or insurer data format.
3. **Preview card** after upload. Show only facts we have:
   - Date: local display in America/Chicago, or "time not recorded".
   - Distance in miles, to 1 decimal.
   - Duration, or "unknown".
   - Samples used / original.
   - Segments, as "split at 1 gap".
   - Source chip.
   - Each finding as a plain-language line (the `message`).
   - What the file supports. Exactly one of:
     - "Route and mileage only."
     - "Route, mileage and speed."
     - "Route, mileage, speed and speed-change observations."
4. `TripPreview`: an SVG polyline of `previewGeometry` using an equirectangular projection fitted to the bbox. Each segment is its own `<polyline>`, so gaps show as breaks. Start and end dots. No map tiles are needed.
5. **Confirm row:** a checkbox "I was driving (not a passenger)" (required), assignment "Assign to {vehicleLabel}", and buttons **Confirm** / **Cancel**, which call DELETE. A duplicate shows "Already imported on {date}", with the existing trip selected.
6. **Trip list:** confirmed trips with distance, date and chips. Remove is not needed for the MVP.
7. **`WeeklyForm`:** "How often do you drive this?", with trips per week (number, step 1, default 10), other miles per week (default 0), and weeks per year (default 48). Pre-fill from the persona? No, keep the defaults explicit. Show the computed monthly miles and the formula in mono text: `avg 6.4 mi × 10 trips × 48 wk + 0 mi × 48 wk ÷ 12 = 256 mi/mo`. A **Use for comparison** button calls `onProfile(profile)`. **Revert to persona estimate** calls `onProfile(null)`.

**States:** loading, server error (show `error.message` and a retry), 413 ("Files up to 4 MiB"), 422/400 (the server message). Keyboard: all of it is reachable, the file input has a label, and an `aria-live="polite"` region announces preview ready, confirmed and errors.

**Already wired:** `ImportDrive` is mounted at the top of the Drives tab (`NextMoveApp.tsx`) and remounts per persona. The shell handles `onProfile` as follows:
- **`onProfile(profile)`:** Compare's monthly miles become `profile.monthlyMiles.value` when known, otherwise the persona's estimate.
  - The city share becomes `profile.cityShare.value` when known.
  - The `monthly_miles` evidence takes `profile.source`.
  - The `city_share` evidence reads **Modeled**.
  - The header tag reads "Driving · imported".
- **`onProfile(null)`:** reverts all of that.

So you never edit the shell. Implement the component, call `onProfile`, and watch Compare change.

---

## 7. Dependencies on other streams

**None.** Everything this stream uses already exists on `main`:
- `src/contracts/driving.ts`
- `ownerId`, `ownedStore("imports" | "trips")`, `apiError`, `withIdempotency` and `sha256Hex` from `src/server/`
- the mounted `ImportDrive` stub and the shell's `onProfile` handling
- `fast-xml-parser`
- `IMPORT_MAX_BYTES` in `.env.example`
- the cookie mock in `tests/server/cookies.ts`

---

## 8. Acceptance tests: `tests/driving/*.test.ts` (Vitest)

Fixtures live in `tests/driving/fixtures/`. Keep them small: build GPX strings in code where you can.

| # | Test | Expected |
|---|---|---|
| A1 | Valid 1 Hz GPX, 120 points | `routeAvailable`, `speedAvailable`, `eventAnalysisAvailable` all true; distance within 1% of a hand-computed haversine sum |
| A2 | `<!DOCTYPE … <!ENTITY xxe SYSTEM "file:///etc/passwd">` | `unsupported_xml_feature`; the parser is never called (spy) |
| A3 | Billion-laughs entity payload | `unsupported_xml_feature` |
| A4 | Route handler: `Content-Length` 5 MiB | 413 `file_too_large` without reading the body |
| A5 | GPX with no `<time>` | `missing_timestamps`; `durationS` unknown; `sharpDecelEvents` unknown; **0 events emitted** |
| A6 | 90 s gap | 2 segments; distance excludes the straight line across the gap |
| A7 | Median Δt 5 s | `sparse_sampling`; `eventAnalysisAvailable` false |
| A8 | Duplicate timestamp with positions 50 m apart | `duplicate_time_conflict` count 2; both points excluded |
| A9 | CSV with the wrong header | 400 `csv_header_mismatch` |
| A10 | CSV row with empty `speedMps` / `altitudeMeters` | values are `null`, not 0 |
| A11 | CSV `2026-10-24T11:00:00-05:00` | stored as `2026-10-24T16:00:00.000Z` |
| A12 | CSV timestamp with no zone | 400 `csv_timestamp_without_zone`, row named |
| A13 | Upload the same bytes twice (route, two calls, same owner) | second response 200 with `duplicateOf`; one job; after confirming, one trip |
| A14 | Owner B `GET /api/imports/{A's id}` | 404; B's `GET /api/drives` is empty (mock `ownerId`) |
| A15 | Confirm without `driverConfirmed: true` | 400 |
| A16 | Cancel then confirm | 409 `import_not_confirmable` |
| A17 | Profile with no weekly input | `monthlyMiles` unknown `weekly_driving_unconfirmed` |
| A18 | Profile with 10 trips/wk × 6.4 mi × 48 wk / 12 | 256 mi/mo; `source` `user_reported` |
| A19 | Profile from 1 trip | finding `single_trip_only` |
| A20 | Sharp decel: synthetic speed trace 15 → 5 m/s over 3 s | exactly 1 event; the same trace at 5 s sampling gives unknown |
| A21 | All six sample files parse | expected flags per §5 table |

Use `tests/server/cookies.ts` for the owner-scoped route tests (A13–A16). Call route handlers directly, as `tests/server/routes.test.ts` does.

### 8.1 End-to-end: `e2e/drive-imports.spec.ts` (Playwright, yours alone)

| # | Spec | Steps → assertions |
|---|---|---|
| E1 | Preview, cancel, confirm | `/next-move` → Drives → "Try a sample drive" → `maria-commute-am.gpx` → the preview says "Route, mileage and speed…" → Cancel → the preview is gone → again → check "I was driving" → Confirm → the trip appears in the list |
| E2 | Imported usage changes Compare | Import both Maria samples; weekly form 10 trips/wk → **Use for comparison** → the header shows "Driving · imported"; Compare's "Monthly miles" value equals the profile's monthly miles |
| E3 | Revert | **Revert to persona estimate** → the header shows "Driving · modeled"; Compare shows `875` again |
| E4 | Unsafe upload | `setInputFiles` with an in-memory `xxe.gpx` containing `<!DOCTYPE` → the server message appears; no preview |
| E5 | Sparse sample | `sparse-no-time.gpx` → "Route and mileage only."; no event count shown |

Run `npm run check` and `npx playwright test e2e/drive-imports.spec.ts e2e/shell.spec.ts`.

---

## 9. Stretch goals (only after §8 is green and merged)

1. **Map Matching enrichment.** A server-only `src/server/imports/map-match.ts` using `NEXT_PUBLIC_MAPBOX_TOKEN`. Send ≤ 100 coordinates per request with `timestamps`, chunked with a 10-point overlap, then merge geometry. Store it as `matchedGeometry` next to the raw geometry, and **never** derive observed speed from it. Show it with the toggle "Snap to roads (Mapbox)". Fall back to the raw trace on any error.
2. **Same-journey grouping.** Group trips whose start and end points are within 300 m of each other. Only with 2+ trips: show "Recurring: 2 trips, avg 6.4 mi".

## 10. Done checklist

- [ ] Parsers, normalizer, summary, decimation and profile, with tests A1–A12 and A17–A21.
- [ ] Routes (`/api/imports/**`, `/api/drives/**`), with tests A13–A16.
- [ ] Sample drives committed in `public/samples/`.
- [ ] `ImportDrive` UI implemented in place of the stub, with E1–E5 passing.
- [ ] Importing `maria-commute-am.gpx` + `-pm.gpx` with 10 trips/wk changes Maria's monthly miles on Compare. The header reads "Driving · imported" and the `monthly_miles` evidence shows the profile's source.
- [ ] Demo line handed to stream 4 (for `docs/demo-script.md`): "This is a synthetic sample built from a real Austin route. We show only what the file supports. This one has no timestamps, so there's no speed analysis."
