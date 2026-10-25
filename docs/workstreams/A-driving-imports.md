# Workstream A — Drive imports and driving profile

**Owner:** _(name)_ · **Branch:** `ws/a-driving` · **Version:** 1, 2026-10-24

**Goal:** On the Drives screen, a user can import a GPX (or the documented CSV) drive, or try a sample drive, and see an honest preview: date, distance, gaps, source, and which analysis the data supports. They confirm it, and the confirmed trips plus a confirmed weekly driving pattern produce a `DrivingProfile` (monthly miles, city share). That profile replaces the persona's assumed usage in the comparison, so imported driving visibly changes fuel cost, lease mileage projection and possibly the next action.

This is the "Import a drive" primary action from the product plan, and the canonical trip format that the rest of the app reads.

---

## 0. Shared rules (identical in all four workstream documents)

### 0.1 Where we are (verified 2026-10-24 ~7 pm)

The Next Move vertical slice works end to end with fixture banking:

- **Domain:** `src/domain/finance/{budget,loan,lease,fuel}.ts` and `src/domain/recommendations/{compare,rank,recommend}.ts`. These are pure functions using integer cents.
- **Fixtures:** `src/fixtures/{personas,catalog,banking}.ts`, with the three personas Maria, Devon and Kai.
- **Nessie adapter:** `src/server/providers/nessie.ts` (server-only fetch, sandbox reads) and `nessie-normalize.ts` (zod schemas and normalization).
- **API:** `GET /api/demo/customers` and `POST /api/banking/nessie/sync` (`{ personaId, mode: "fixture" | "sandbox" }`). The older `POST /api/coach` is still used by the Drives coaching panel in `src/components/Panels.tsx`.
- **UI:** `src/components/next-move/NextMoveApp.tsx` is the shell (persona picker, tabs, sync bar, scenario state). `screens.tsx` holds Home, Money, Compare and Next Move. `Evidence.tsx` provides `EvidenceList` and `SourceChip`. `src/components/DrivesView.tsx` is the Regen replay on the cached Austin routes in `src/data/routes.json`.
- **Checks:** 29 Vitest tests pass across `tests/{finance,budget,compare,braking}.test.ts`. `tsc`, `eslint` and `next build` are clean.
- **Demo scenarios already true:** Maria's buyout leads but needs a quote, and adding $300/mo of spending changes her result. Devon keeps the car. Kai has no feasible option. `tests/compare.test.ts` enforces all of these, so **do not break them.**

### 0.2 Step 0 — baseline (done)

The work above is committed on `vishruth` and merged into `main`, together with the team's Regen Coach work (physics, data pipeline, `TripMap`, generated trips). Branch from the latest `main`: `git switch main && git pull && git switch -c ws/<stream>`.

### 0.3 Next.js 16.4: read before writing routes

The `AGENTS.md` warning is real. Before writing a route, read:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`

Facts that differ from older Next.js:

- Dynamic `params` is a **Promise**: `export async function GET(req: Request, ctx: RouteContext<"/api/drives/[id]">) { const { id } = await ctx.params }`.
- `cookies()` is **async**: `const jar = await cookies()`.
- `middleware.ts` is deprecated and renamed `proxy.ts`. We don't need either.

### 0.4 Conventions (from the Calculation and Data Specification)

- Money is integer cents (`Cents`), rates are basis points, distance is meters and speed is m/s internally. Timestamps are ISO-8601 UTC. Format only at the edge (`src/domain/format.ts` → `usd()`).
- An unknown value is `Maybe<T>` / `unknown(reason)` from `src/contracts/index.ts`, **never 0**.
- Every displayed number carries a `SourceKind` (`observed | user_reported | derived | modeled | synthetic`) and appears with `SourceChip`.
- Error body is always `{ error: { code, message, retryable, fieldErrors?, requestId } }`. Status codes:
  - 400 invalid input
  - 404 not found or not yours
  - 409 conflict
  - 413 too large
  - 422 supported but unusable
  - 429 rate limited
  - 502 provider error
  - 503 provider not configured or unavailable
- **Never relabel a failed live call as fixture/success.** Offer the fallback explicitly and label it.
- Pure domain code (`src/domain/**`) imports nothing from React, Next or `src/server`. Server code that holds secrets starts with `import "server-only"`.
- New CSS goes in a **CSS module next to your component** (`Foo.module.css`), using the existing tokens (`var(--border)`, `var(--text-2)`, `var(--font-mono)`, …). `src/app/globals.css` is owned by Stream D.

### 0.5 File ownership (edit only your own files; ask the owner for anything else)

| Area | Owner |
|---|---|
| `src/domain/driving/**`, `src/contracts/driving.ts`, `src/app/api/imports/**`, `src/app/api/drives/**`, `src/server/imports/**`, `src/components/next-move/import/**`, `public/samples/**`, `scripts/make-sample-drives.mjs`, `tests/driving/**` | **A** |
| `src/server/providers/nessie*.ts`, `src/fixtures/banking.ts`, `src/app/api/banking/**`, `src/app/api/dev/**`, `src/server/providers/serpapi.ts`, `src/app/api/market/**`, `src/contracts/{banking-sync,market}.ts`, `src/fixtures/market-cache.json`, `src/components/next-move/banking/**`, `src/components/next-move/market/**`, `tests/banking/**`, `tests/market/**` | **B** |
| `src/server/{session,store,http}.ts`, `src/server/explain/**`, `src/app/api/options/**`, `src/app/api/recommendations/**`, `src/app/api/consents/**`, `src/app/api/me/**`, `src/contracts/index.ts` (existing types), `src/contracts/explain.ts`, `src/domain/recommendations/**`, `src/domain/finance/**`, `src/components/next-move/explain/**`, `tests/{finance,budget,compare}.test.ts`, `tests/server/**`, `tests/explain/**` | **C** |
| `src/components/next-move/{NextMoveApp,screens,Evidence}.tsx`, new `Settings` screen, `src/app/**` pages/layout/icon, `src/app/globals.css`, `src/components/{DrivesView,Panels,RouteMap,RouteSvg,Timeline}.tsx`, `scripts/fetch-demo-routes.mjs` (writes `src/data/routes.json`), `package.json` scripts, `.env.example`, `README.md`, `playwright.config.ts`, `e2e/**`, deployment, demo script | **D** |

Shared append-only exceptions:

- **`src/contracts/index.ts`:** each stream may append **one** line, `export * from "./<file>";`. All other edits go through C.
- **`package.json` / `package-lock.json`:** add dependencies with `npm install --save-exact <pkg>@<version>`. On merge conflicts in the lockfile, take either side and re-run `npm install`.

### 0.6 Shared server primitives: C delivers by H+0:45, signatures frozen now

Code against these immediately. C merges them to `vishruth` as a tiny PR; everyone rebases.

```ts
// src/server/session.ts
import "server-only";
/** Demo owner id from httpOnly cookie "nm_sid" (crypto.randomUUID(), SameSite=Lax, Path=/, 7 days).
 *  Creates the cookie if missing. Only call from route handlers. */
export async function ownerId(): Promise<string>;

// src/server/store.ts
import "server-only";
export interface OwnedStore<T> {
  get(owner: string, id: string): T | undefined;      // undefined for other owners: callers return 404
  put(owner: string, id: string, value: T): void;
  list(owner: string): T[];                            // newest first
  remove(owner: string, id: string): boolean;
}
/** In-memory, kept on globalThis so dev HMR doesn't wipe it. Registers the store for deleteOwnerData. */
export function ownedStore<T>(name: string, opts?: { maxPerOwner?: number }): OwnedStore<T>;
export function deleteOwnerData(owner: string): { stores: string[] };

// src/server/http.ts
export function newRequestId(): string;
export function apiError(status: number, code: string, message: string, retryable: boolean,
  requestId: string, fieldErrors?: Record<string, string>): Response;
/** Idempotency-Key handling: same key + same body hash → replay the stored response;
 *  same key + different body → 409 "idempotency_conflict". */
export async function withIdempotency(req: Request, owner: string, route: string,
  run: (body: unknown) => Promise<Response>): Promise<Response>;
```

Registered store names:

- **A:** `imports`, `trips`
- **B:** `banking_snapshots`. B's market cache is global, not per owner, and lives in a module-level `Map`.
- **C:** `comparisons`, `recommendations`, `explanations`, `consents`, `idempotency`

**In-memory caveat.** Vercel instances don't share memory, so server records are best-effort. The client keeps working state. Any route that needs a missing server record returns `409 { code: "<thing>_not_found_resync" }` and the client re-sends its inputs. Supabase persistence is a C stretch goal behind the same `OwnedStore` interface.

### 0.7 Integration mount points (D wires these into the shell)

| Component (owner) | Path | Props | Mounted by D in |
|---|---|---|---|
| `ImportDrive` (A) | `src/components/next-move/import/ImportDrive.tsx` | `{ personaId: string; vehicleLabel: string; onProfile: (p: DrivingProfile \| null) => void }` | Drives tab, above `DrivesView` |
| `BankingSyncBar` (B) | `src/components/next-move/banking/BankingSyncBar.tsx` and hook `useBankingSync.ts` | hook: `useBankingSync(personaId) → { bank, mode, stale, loading, error, sync(mode) }`; bar: the hook's return value | Replaces the inline `.sync-bar` in `NextMoveApp` |
| `MarketResearch` (B) | `src/components/next-move/market/MarketResearch.tsx` | `{ catalogId: string; label: string }` | Compare: a "See listings" disclosure per new-vehicle option |
| `DealerList` (B) | `src/components/next-move/market/DealerList.tsx` | `{ near: "Austin, TX" }` | Next Move, when `nextAction === "compare_confirmed_offers"` |
| `AiExplanation` (C) | `src/components/next-move/explain/AiExplanation.tsx` | `{ request: CompareRequest; recommendation: Recommendation; evidence: EvidenceFact[] }` | Next Move: replaces the "Explanation generated by a deterministic template" footer |

Until a component lands, D mounts a placeholder with the same props.

### 0.8 Environment registry (D adds all of these to `.env.example` at H+0)

| Variable | Used by | Default / note |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | D (map) | exists |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | C | model default `claude-sonnet-5-5` in `src/lib/env.ts` |
| `AI_DAILY_CAP` | C | `50` |
| `NESSIE_API_KEY`, `NESSIE_BASE_URL`, `NESSIE_CUSTOMERS` | B | `http://api.nessieisreal.com`; `maria:<id>,devon:<id>,kai:<id>` |
| `NESSIE_SEED_ALLOW` | B | `1` only on a dev machine; never set in Vercel |
| `SERPAPI_API_KEY`, `MARKET_DAILY_CAP` | B | `100` |
| `IMPORT_MAX_BYTES` | A | `4194304` (4 MiB) |

### 0.9 Schedule (H+0 = kickoff; scale to the real deadline)

| When | Milestone |
|---|---|
| H+0 | D commits the baseline; everyone branches; D deploys the baseline preview |
| H+0:45 | C merges the shared primitives (§0.6); everyone rebases |
| H+1 | C merges the `CompareInputs.overrides` extension (`cityShare`, `usageSource`), which A needs |
| H+3 | **Integration window 1:** each stream merges whatever is green behind its component |
| H+6 | **Integration window 2:** features complete |
| H+8 | **Integration window 3:** fixes only |
| H+9 | **Freeze.** Then e2e, deploy, and two full rehearsals on another device |

Merge = rebase on `vishruth`, `npm run lint && npm run typecheck && npm test && npm run build` green, then D merges. Shared field names are frozen after H+1. Changing one needs a fixture update and a message to all owners.

### 0.10 Definition of done (every stream)

- Lint, typecheck, unit tests and build are green, and your own tests cover your acceptance list.
- No new browser console errors.
- The four demo scenarios in §0.1 still hold.
- Every new number has a source label, and unknowns are shown as unknown.
- Failures are explicit and labeled.
- Nothing claims a Toyota or insurer integration, approval, quote or booking that doesn't exist.

### 0.11 Relationship to the team `AGENTS.md` (Regen Coach Streams 1–4)

`AGENTS.md` on `main` defines four **Regen Coach** streams (1 Physics and Scoring, 2 Data and API, 3 Map and Charts, 4 UI, Theme and Pitch) and their file ownership. Those rules still govern the Regen replay that now lives on the Drives tab. These Next Move workstreams (A–D) **do not edit** Regen Coach files:

- `src/lib/physics/**`, `src/config/regen.config.ts`, `src/lib/trip/**`
- `src/components/map/**`, `src/components/charts/**`
- `data/**`, `simulated_user_data/**`, `scripts/fetch-routes.mjs`
- the existing routes `src/app/api/{routes,trips,compare}/**`

Next Move uses its own paths (`/api/drives`, `/api/options/compare`, …), so nothing collides. If a Next Move feature needs a change there, ask that Regen stream's owner. Stream D coordinates the two sets of owners at each integration window.

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

## 2. Contracts — `src/contracts/driving.ts` (deliver first, by H+0:30)

Append `export * from "./driving";` to `src/contracts/index.ts`.

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

Add the parser with `npm install --save-exact fast-xml-parser@<latest 4.x or 5.x you verify>`. Read its README for the option names in that exact version. Option names changed between v4 and v5, so do not trust memory.

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

1. Header "Your drives", with tag **"Imported trips · observed"** or **"Sample trips · synthetic"**.
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
4. `TripPreview`: an SVG polyline of `previewGeometry` using an equirectangular projection fitted to the bbox. Each segment is its own `<polyline>`, so gaps show as breaks. Start and end dots. No map tiles needed, so it also serves as D's static fallback.
5. **Confirm row:** a checkbox "I was driving (not a passenger)" (required), assignment "Assign to {vehicleLabel}", and buttons **Confirm** / **Cancel**, which call DELETE. A duplicate shows "Already imported on {date}", with the existing trip selected.
6. **Trip list:** confirmed trips with distance, date and chips. Remove is not needed for the MVP.
7. **`WeeklyForm`:** "How often do you drive this?", with trips per week (number, step 1, default 10), other miles per week (default 0), and weeks per year (default 48). Pre-fill from the persona? No, keep the defaults explicit. Show the computed monthly miles and the formula in mono text: `avg 6.4 mi × 10 trips × 48 wk + 0 mi × 48 wk ÷ 12 = 256 mi/mo`. A **Use for comparison** button calls `onProfile(profile)`. **Revert to persona estimate** calls `onProfile(null)`.

**States:** loading, server error (show `error.message` and a retry), 413 ("Files up to 4 MiB"), 422/400 (the server message). Keyboard: all of it is reachable, the file input has a label, and an `aria-live="polite"` region announces preview ready, confirmed and errors.

Do **not** edit `NextMoveApp.tsx`. D wires `onProfile` into the shell like this, which you can tell D or leave as a PR comment:

```ts
onProfile={(p) => {
  if (p && p.monthlyMiles.known) setMonthlyMiles(p.monthlyMiles.value);
  setCityShareOverride(p && p.cityShare.known ? p.cityShare.value : null);
  setUsageSource(p ? p.source : null);
}}
```

C adds `overrides.cityShare` and `overrides.usageSource` to `CompareInputs` by H+1. Then the `monthly_miles` evidence fact carries the profile's source and the formula `trips/wk × avg trip mi × weeks ÷ 12`, so the comparison cites the imported drives instead of the persona's assumption.

---

## 7. Dependencies on other streams

| Need | From | By | If late |
|---|---|---|---|
| `ownerId`, `ownedStore`, `apiError`, `withIdempotency` | C | H+0:45 | write against the frozen signatures and stub the import path in tests with `vi.mock` |
| `overrides.cityShare` / `usageSource` in `compareOptions` | C | H+1 | your component still emits the profile; D wires `monthlyMiles` only |
| Mounting `ImportDrive` on Drives | D | window 1 or 2 | demo it standalone with a temporary story page **in your branch only**; don't merge that |

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

Run `npm test` and also `npm run build`. The route files must compile under Next 16.

---

## 9. Stretch goals (only after §8 is green and merged)

1. **Map Matching enrichment.** A server-only `src/server/imports/map-match.ts` using `NEXT_PUBLIC_MAPBOX_TOKEN`. Send ≤ 100 coordinates per request with `timestamps`, chunked with a 10-point overlap, then merge geometry. Store it as `matchedGeometry` next to the raw geometry, and **never** derive observed speed from it. Show it with the toggle "Snap to roads (Mapbox)". Fall back to the raw trace on any error.
2. **Same-journey grouping.** Group trips whose start and end points are within 300 m of each other. Only with 2+ trips: show "Recurring: 2 trips, avg 6.4 mi".
3. **Lease-mileage evidence.** When the profile is used for Maria, put the projected end miles in the preview: "At this pattern you'd reach ~38,100 of 36,000 miles." Take the number from the comparison evidence `projected_mileage`. Do not recompute it.

## 10. Handoff checklist

- [ ] `src/contracts/driving.ts` merged by H+0:30, and the field names posted to the team.
- [ ] Parsers, normalizer, summary and profile merged with tests A1–A12, A17–A21 by **window 1 (H+3)**.
- [ ] Routes and UI with A13–A16 by **window 2 (H+6)**.
- [ ] D has mounted `ImportDrive`. Importing `maria-commute-am.gpx` + `-pm.gpx` with 10 trips/wk changes Maria's monthly miles on Compare, and the `monthly_miles` evidence shows the trip-based formula.
- [ ] Demo line for D's script: "This is a synthetic sample built from a real Austin route. We show only what the file supports. This one has no timestamps, so there's no speed analysis."
