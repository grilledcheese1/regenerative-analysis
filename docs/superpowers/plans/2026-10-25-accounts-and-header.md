# Accounts and a Simpler Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real sign-up / sign-in scaffolding (email + password, server session) alongside the existing case studies, and a header that shows one clear identity control instead of "Kai ▾ · Signed in as Felix · Switch person · Sign out".

**Architecture:** Accounts live behind an `AccountStore` interface on the server (in memory, plus a JSON file outside production). Passwords are hashed with Node's `scrypt`; the session is an HMAC-signed, httpOnly cookie, so a signed-in browser stays signed in across server restarts. The existing cookie-only "fake sign-in" is renamed to what it is, viewing a **case study**. The header shows exactly one of: an account menu, a case-study switcher, or a sign-in button.

**Tech Stack:** Next.js 16 route handlers, `node:crypto` (`scrypt`, `createHmac`, `timingSafeEqual`), zod 4, React 19, motion, vitest, Playwright. No new dependencies.

**Spec:** Conversation decisions of 2026-10-25 (no separate design doc): built-in demo accounts (hashed passwords, signed cookie session, profiles in the browser), case studies kept, header simplified. Plan 2 (`2026-10-25-onboarding.md`) builds on this.

## Global Constraints

- No new npm packages. Secrets only from env: `AUTH_SECRET` (required in production; a fixed dev-only secret is used otherwise and logged once as a warning). Add it to `.env.example` with a comment.
- Cookie names: session `nm_account` (httpOnly, sameSite lax, path `/`, 30 days, `secure` in production). Case study keeps `nm_user`.
- Passwords: minimum 8 characters, maximum 200. Emails are trimmed and lowercased. Names 1–60 characters.
- Sign-in failures always return the same message, `"Email or password is incorrect"`, whether the email exists or not.
- Never log emails, names or passwords (follow `src/server/http.ts` / Nessie route logging: codes and timings only).
- UI copy says "demo account" somewhere on the sign-up form: "Demo accounts live on this server and in this browser. Don't reuse a real password."
- Phone width: no horizontal scroll (e2e E12 pattern).

## Review Focus

1. **Server restarted (or a different Vercel instance) after sign-up:** the session cookie still works (`/api/auth/me` answers from the signed token), but sign-in with the password fails because the store is empty. Expected: sign-in returns 401 with the normal message, and the dialog adds "Accounts reset when the demo server restarts. Create it again." Test in Task 3.
2. **Tampered or expired `nm_account` cookie:** treated as signed out, never a 500. Test in Task 1.
3. **Signing up with an email that differs only in case or spaces** (`" Felix@X.com "` vs `"felix@x.com"`): 409 `email_taken`. Test in Task 3.
4. **An old `nm_user` case-study cookie from before signing up:** sign-up and sign-in clear it (`exitCaseStudy()`), so afterwards a case study is open only when the user picked one from the account menu. Then the header shows the select plus the account menu, and "Back to my profile" closes it. Test in Task 6 (e2e).
5. **Missing `AUTH_SECRET` in production:** sign-up/sign-in return 500 `auth_not_configured` with a clear message instead of signing with the dev secret. Test in Task 2.

---

### Task 1: Password hashing and session tokens

**Files:**
- Create: `src/server/auth/password.ts`
- Create: `src/server/auth/token.ts`
- Test: `tests/auth/crypto.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`, format `scrypt$<saltB64url>$<hashB64url>` (16-byte salt, 64-byte key, Node defaults N=16384).
  - `verifyPassword(password: string, stored: string): Promise<boolean>`, using `timingSafeEqual`; `false` for malformed `stored`.
  - `type SessionPayload = { accountId: string; email: string; name: string; exp: number }` (exp in Unix seconds).
  - `signSession(payload: SessionPayload, secret: string): string` → `<base64url(JSON)>.<base64url(HMAC-SHA256)>`.
  - `verifySession(token: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): SessionPayload | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it("verifies the right password and rejects a wrong one", async () => {
  const h = await hashPassword("correct horse");
  expect(h).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
  expect(await verifyPassword("correct horse", h)).toBe(true);
  expect(await verifyPassword("wrong horse", h)).toBe(false);
  expect(await verifyPassword("x", "garbage")).toBe(false);
});
it("hashes the same password differently each time", async () => {
  expect(await hashPassword("pw123456")).not.toBe(await hashPassword("pw123456"));
});
it("round-trips a session and rejects tampering, the wrong secret and expiry", () => {
  const p = { accountId: "acct_1", email: "a@b.co", name: "Ana", exp: 2_000 };
  const t = signSession(p, "s1");
  expect(verifySession(t, "s1", 1_000)).toEqual(p);
  expect(verifySession(t, "s2", 1_000)).toBeNull();
  expect(verifySession(t.replace(/^./, "x"), "s1", 1_000)).toBeNull();
  expect(verifySession(t, "s1", 2_001)).toBeNull();
  expect(verifySession(undefined, "s1")).toBeNull();
  expect(verifySession("not-a-token", "s1")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run tests/auth/crypto.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement both files** with `node:crypto` only (`scrypt` promisified, `randomBytes`, `createHmac`, `timingSafeEqual`). `verifySession` must catch JSON/base64 errors and return `null`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/server/auth tests/auth && git commit -m "Add password hashing and signed session tokens"`

### Task 2: Account store and session helpers

**Files:**
- Create: `src/server/auth/accounts.ts`
- Create: `src/server/auth/session.ts`
- Modify: `.gitignore` (add `/.data/`), `.env.example` (add `AUTH_SECRET=` with comment "Signs the demo account session cookie. Required in production; any long random string.")
- Test: `tests/auth/accounts.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `type AccountRecord = { accountId: string; email: string; name: string; passwordHash: string; createdAt: string }`; `accountId` is `"acct_" + 16 hex chars`.
  - `type PublicAccount = { accountId: string; email: string; name: string }`.
  - `createAccount(input: { email: string; name: string; password: string }): Promise<AccountRecord | "email_taken">`
  - `findAccountByEmail(email: string): AccountRecord | undefined` (normalizes email).
  - `resetAccountsForTests(): void`
  - Persistence: when `process.env.NODE_ENV !== "production"` the store loads from and writes to `.data/accounts.json` (override path with `ACCOUNTS_FILE`; `ACCOUNTS_FILE=off` disables it, which tests set). Production is memory only. Kept on `globalThis.__nmAccounts`, like `src/server/store.ts`.
  - `authSecret(): string`: `AUTH_SECRET`, or in non-production the constant `"regentic-dev-only-secret"` (warn once); in production without it, throws `AuthNotConfigured`.
  - `currentAccount(): Promise<PublicAccount | null>`: reads `nm_account` via `cookies()` and `verifySession`.
  - `startSession(account: PublicAccount): Promise<void>` (30-day `exp`), `endSession(): Promise<void>`.

- [ ] **Step 1: Write the failing tests:** creating an account returns a record with a hashed password (not the plain text); a second `createAccount` with `" FELIX@x.com "` after `"felix@x.com"` returns `"email_taken"`; `findAccountByEmail("Felix@X.com")` finds it; with `NODE_ENV=production` and no `AUTH_SECRET`, `authSecret()` throws `AuthNotConfigured`.
- [ ] **Step 2: Run** `npx vitest run tests/auth/accounts.test.ts` (set `ACCOUNTS_FILE=off` in the test's `beforeAll`). Expected: FAIL.
- [ ] **Step 3: Implement** both modules (`import "server-only"` in each).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add demo account store and session cookie helpers"`

### Task 3: Auth API routes

**Files:**
- Create: `src/app/api/auth/signup/route.ts`, `src/app/api/auth/signin/route.ts`, `src/app/api/auth/signout/route.ts`, `src/app/api/auth/me/route.ts`
- Modify: `tests/server/cookies.ts`: make `cookiesMock` a small jar (`get/set/delete` over a `Map`) that still serves `nm_sid` from `asOwner()`, plus `resetJar()`. Existing tests must keep passing unchanged.
- Test: `tests/auth/routes.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (all JSON, errors via `apiError` from `src/server/http.ts`):
  - `POST /api/auth/signup` body `{ name, email, password }` → `201 { account: PublicAccount }` and sets the session; `400 invalid_request` with `fieldErrors`; `409 email_taken` ("An account with this email already exists"); `500 auth_not_configured`.
  - `POST /api/auth/signin` body `{ email, password }` → `200 { account }`; `401 invalid_credentials` ("Email or password is incorrect"; when the store is empty, add `hint: "Accounts reset when the demo server restarts. Create it again."`).
  - `POST /api/auth/signout` → `204`, clears the cookie.
  - `GET /api/auth/me` → `200 { account: PublicAccount | null }`.

- [ ] **Step 1: Write the failing tests:** sign-up → 201 and `me` returns the account; duplicate (case/space variant) → 409; bad email / 7-char password → 400 with `fieldErrors.email` / `fieldErrors.password`; sign-in wrong password and unknown email return identical 401 bodies apart from `requestId`; after `resetAccountsForTests()` sign-in 401 carries the `hint` while `me` still returns the account; sign-out → 204 then `me` → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/auth/routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the four handlers with zod bodies.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all tests PASS (old route tests included).
- [ ] **Step 5: Commit** `git commit -m "Add sign-up, sign-in, sign-out and me routes"`

### Task 4: Client auth state; rename the fake sign-in to "case study"

**Files:**
- Rename: `src/components/auth/auth.ts` → `src/components/auth/caseStudy.ts`, with exports `useCaseStudyId()`, `openCaseStudy(id)`, `exitCaseStudy()` (same `nm_user` cookie and `nm-auth` event).
- Create: `src/components/auth/useAccount.ts`
- Modify: every importer of the old names (`SignIn.tsx`, `NextMoveEntry.tsx`, `DetailsEntry.tsx`).

**Interfaces:**
- Produces:
  - `useAccount(): { account: PublicAccount | null; ready: boolean }`: fetches `/api/auth/me` on mount and on the `nm-auth` event.
  - `signUp(input): Promise<{ ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string>; hint?: string }>`; `signInWithPassword(email, password)` with the same result type; `signOutAccount(): Promise<void>`. Each dispatches `nm-auth` on success.

- [ ] **Step 1: Rename and update imports**; run `npm run typecheck`. Expected: PASS.
- [ ] **Step 2: Add `useAccount.ts`**; run `npm run typecheck && npx eslint src`. Expected: PASS.
- [ ] **Step 3: Commit** `git commit -m "Split case-study viewing from account state on the client"`

### Task 5: Auth dialog, case-study picker, account menu and entry page

**Files:**
- Create: `src/components/auth/AuthDialog.tsx`: one `<dialog>` with two tabs, "Create account" (name, email, password) and "Sign in" (email, password). Inline field errors, `hint` shown under the form, demo-account notice from Global Constraints. On success: call `exitCaseStudy()`, then sign-up → `router.push("/onboarding")`, sign-in → `router.push("/home")`.
- Create: `src/components/auth/CaseStudyPicker.tsx`: the people list dialog moved out of `SignIn.tsx` (search, rows, `aria-current`). Trigger label `"Explore a case study"`. Choosing calls `openCaseStudy(id)` then `router.push("/home")`.
- Create: `src/components/auth/IdentityControl.tsx`: the only identity element in any header:
  - account signed in → button `"{name} ▾"` opening a menu: "Story view" / "Details view" (whichever page you're not on), "Explore a case study", and when a case study is open "Back to my profile" (calls `exitCaseStudy()`), then "Sign out".
  - no account, case study open → `"Exit case study"` text button.
  - neither → `"Sign in"` button opening `AuthDialog`.
- Create: `src/app/onboarding/page.tsx`: placeholder until Plan 2 ("Let's set up your profile. Onboarding is coming in the next step." plus a link to `/home`). Plan 2 replaces it.
- Delete: `src/components/auth/SignIn.tsx`.
- Modify: `src/components/story/NextMoveEntry.tsx` landing: primary "Create an account", secondary "Sign in", and the `CaseStudyPicker` trigger. Copy: "Create an account to get your own plan, or explore one of {PEOPLE.length} simulated case studies." Header right side becomes `<IdentityControl />` plus the view link.
- Modify: `src/components/next-move/NextMoveApp.tsx` header: logo, the `Demo customer` `<select>` **only when no account is signed in or a case study is open**, one view link, `<IdentityControl />`. Remove `<SignIn />`.
- Modify: `src/components/next-move/nextmove.css` or `src/app/theme.css` (wherever `.auth` rules live now) for the menu; reuse `.m-btn`, `.m-dialog`.

- [ ] **Step 1: Build the components and wire both headers**; run `npm run typecheck && npx eslint src`. Expected: PASS.
- [ ] **Step 2: Manual check** with `npm run dev`: at 1280px and 390px the header holds at most select + view link + one identity control, with no "Signed in as" text next to a different person's name.
- [ ] **Step 3: Commit** `git commit -m "One identity control in the header, with account sign-up and sign-in"`

### Task 6: End-to-end coverage

**Files:**
- Create: `e2e/accounts.spec.ts`
- Modify: `e2e/shell.spec.ts` only if a locator broke (the `Demo customer` select must still exist for case studies).

- [ ] **Step 1: Write the tests**
  - `"sign up, land on onboarding, sign out"`: open `/`, click "Create an account", fill name `Felix`, a unique email `felix+${Date.now()}@example.com`, password `password123`, submit → URL `/onboarding`; open `/home` → button `"Felix ▾"` visible, `getByText("Signed in as")` count 0, `"Switch person"` count 0; menu → "Sign out" → "Sign in" button visible.
  - `"wrong password shows one generic message"`: sign up, sign out, sign in with `wrongpass1` → `"Email or password is incorrect"`.
  - `"case study without an account"`: `/` → "Explore a case study" → pick Kai → `/home` shows the select with Kai, `"Exit case study"` visible, no account menu.
  - `"signing up closes an open case study"` (Review Focus 4): pick Kai as a case study, then sign up → `/home` has no select; menu → "Explore a case study" → Kai → select visible plus `"Felix ▾"`; menu → "Back to my profile" → select gone.
  - The header checks run on both Playwright projects (desktop and mobile), with no horizontal overflow on `/` and `/home`.
- [ ] **Step 2: Run** `npx playwright test`. Expected: all pass (2 live-Nessie skips).
- [ ] **Step 3: Run** `npm run typecheck && npx eslint src e2e tests && npm test && npm run build`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "E2E coverage for accounts and the simplified header"`
