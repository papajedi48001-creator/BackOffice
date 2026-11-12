# ThaID Sign-in, Sign-in Settings and Closed Password Sign-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close username/password sign-in once an external route is ready (PR 1), then add ThaID sign-in, a web settings page for ThaID and Provider ID, and Provider-ID-pending → ThaID self-link (PR 2).

**Architecture:** A pure rule `passwordSignInOpen` decides whether the password form and `/api/auth/local` work. ThaID is a new core client plus `/api/auth/thaid/{start,callback}` that resolve the บุคลากร by `NationalIdProtector.lookup(pid)`. Settings live in `sign_in_setting` with secrets sealed by `ConnectionSecretBox`; a saved row wins over env.

**Tech Stack:** Next.js route handlers, Vitest, MariaDB + Drizzle, `@backoffice/core`, `@backoffice/i18n`.

**Spec:** `docs/superpowers/specs/2026-11-12-thaid-sign-in-design.md`

## Global Constraints

- The citizen ID (`pid`) is never stored, logged, audited, or put in a cookie, URL or outbox payload.
- Redirects to the browser are built from the configured redirect URI, never `request.url`.
- Every form opens in `FormDialog`, every confirmation in `ActionDialog`; popups close only from their buttons.
- Admin-only actions are checked on the server (`adminPage()` / `isAdmin`), never only in the UI.
- Settings change + audit row in one transaction; audit metadata never carries a secret.
- Migrations additive, listed in order in `packages/db/src/migrate.ts`, Drizzle schema kept in step.
- Thai UI copy comes from `packages/i18n/src/th.ts`.

## Review Focus

- `PASSWORD_SIGN_IN` set to anything but exactly `on` (e.g. `1`, `ON `) → treat only trimmed, lower-cased `on` as on; test in Task 1.
- `/api/auth/local` closed must answer before reading the body or the database, so no lockout counter moves → test asserts `getSharedDatabase` not called (Task 2).
- ThaID answer with `pid` as a number or with spaces → refused as `failed`, never matched (Task 7 test).
- `id_token` whose `aud` is a string vs array → both accepted when it names our client (Task 7 test).
- Settings save with a blank secret on a row that has none and no env value → card shows ยังตั้งค่าไม่ครบ, route stays not ready (Task 6 test).

---

## PR 1 — close password sign-in

### Task 1: password sign-in rule

**Files:** Create `apps/web/src/lib/password-sign-in.ts`, test `apps/web/src/lib/password-sign-in.test.ts`

**Interfaces:**
- Produces: `passwordSignInOpen(input: { externalRouteReady: boolean; override: string | undefined }): boolean` and `isPasswordSignInOpen(): boolean` (reads `providerSsoEnabled()` and `readRuntimeValue('PASSWORD_SIGN_IN')`; PR 2 adds ThaID).

- [x] **Step 1: failing tests** — `open when no external route is ready`; `closed when an external route is ready`; `PASSWORD_SIGN_IN=on reopens it` (also `' ON '`); `other override values ('1','true','off') do not reopen`.
- [x] **Step 2:** `pnpm --filter @backoffice/web exec vitest run src/lib/password-sign-in.test.ts` → FAIL (module missing).
- [x] **Step 3:** implement both functions.
- [x] **Step 4:** same command → PASS.
- [x] **Step 5:** commit `feat(web): password sign-in closes once an external sign-in route is ready`.

### Task 2: `/api/auth/local` refuses when closed

**Files:** Modify `apps/web/src/app/api/auth/local/route.ts`, test `route.test.ts`

- [x] **Step 1: failing test** `answers 403 password_sign_in_off without touching the database when password sign-in is closed` — mock `../../../../lib/password-sign-in` `isPasswordSignInOpen` → false; expect status 403, body `{ error: 'password_sign_in_off' }`, `getSharedDatabase` and `authenticateLocal` not called. Existing tests mock it → true.
- [x] **Step 2:** run route test → FAIL.
- [x] **Step 3:** first line of `POST`: `if (!isPasswordSignInOpen()) return 403`.
- [x] **Step 4:** run → PASS.
- [x] **Step 5:** commit `feat(web): /api/auth/local refuses when password sign-in is closed`.

### Task 3: sign-in page hides the form

**Files:** Modify `apps/web/src/app/page.tsx`, test `apps/web/src/app/page.test.tsx`

- [x] **Step 1: failing test** `shows no username or password box and no forgot-password line when password sign-in is closed` (mock `isPasswordSignInOpen` → false; `queryByLabelText(/รหัสผ่าน/)` null, `queryByText('ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ')` null). Existing tests mock → true.
- [x] **Step 2:** run page test → FAIL.
- [x] **Step 3:** render `LocalSignInForm` and the help line only when open.
- [x] **Step 4:** run → PASS.
- [x] **Step 5:** commit `feat(web): sign-in page shows only external routes when password sign-in is closed`.

### Task 4: break-glass wiring and runbook

**Files:** Modify `infra/compose/docker-compose.provider-sso.yml` (web env `PASSWORD_SIGN_IN: ${PASSWORD_SIGN_IN:-}`), `infra/compose/compose-config.test.sh` (assert the variable is passed and empty by default), `docs/runbooks/provider-sso.md` (section "ปิดการเข้าด้วยรหัสผ่าน / เปิดฉุกเฉิน").

- [x] **Step 1:** add assertion to `compose-config.test.sh`; `bash infra/compose/compose-config.test.sh` → FAIL.
- [x] **Step 2:** add the env line; rerun → PASS.
- [x] **Step 3:** runbook section; commit `docs(runbook): break-glass PASSWORD_SIGN_IN for closed password sign-in`.

PR 1 review fixes (done): `/mci` follows the rule; a stale form gets a reload message on 403; Provider ID credentials present but broken keep the box closed (warn once); unreadable `PASSWORD_SIGN_IN_FILE` = no override; Provider ID callback goes to `/choose-role` when several roles (user ask 2026-11-12).

PR 1 verification: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, then open PR.

## PR 2 — ThaID and settings

### Task 5: `sign_in_setting` table

**Files:** Create `packages/db/migrations/0037_sign_in_setting.sql`; modify `packages/db/src/migrate.ts`, `packages/db/src/schema/access.ts`; test `packages/db/src/schema/schema.integration.test.ts`.

Columns: `method VARCHAR(16) PK` (`THAID`|`PROVIDER_ID`), `enabled TINYINT NOT NULL`, `settings_json TEXT NOT NULL` (non-secret values), `secret_ciphertext TEXT NULL` (sealed JSON of secrets), `updated_by_person_id VARCHAR(36) NOT NULL`, `updated_at DATETIME NOT NULL`.

- [x] Integration test `sign_in_setting (migration 0037)` (skipped in the dev container without `DATABASE_URL`; runs in CI on MariaDB) → FAIL → migration + schema → PASS → commit `feat(db): sign_in_setting table`.

### Task 6: `SignInSettingsService` (core)

**Files:** Create `packages/core/src/identity/sign-in-settings-service.ts` + test; export from `packages/core/src/index.ts`.

**Interfaces:**
- `type SignInMethod = 'THAID' | 'PROVIDER_ID'`
- `interface ThaidSettings { clientId: string; clientSecret: string; redirectUri: string; apiUrl: string }`
- `ProviderIdConfig` (existing) for Provider ID.
- `class SignInSettingsService(database, box: ConnectionSecretBox | null, env: (name) => string | undefined)` with
  `view(): Promise<SignInSettingsView>` (per method: `enabled`, `source: 'SETTINGS'|'ENV'|'NONE'`, `ready`, non-secret values, `secretsSet: Record<string, boolean>`, `canStoreSecrets`),
  `thaid(): Promise<ThaidSettings | null>`, `providerId(): Promise<ProviderIdConfig | null>`,
  `save(method, input, actorPersonId): Promise<{ ok: true } | { ok: false; code: 'INVALID_INPUT' | 'NO_SECRET_KEY' | 'LAST_SIGN_IN_ROUTE' }>`.
- Redirect URI must be `https:` and end with `/api/auth/thaid/callback` or `/api/auth/provider/callback`; env fallbacks as in the spec.

- [x] Failing tests: env fallback when no row; saved row wins; blank secret keeps stored; secret never in `view()` or audit metadata; `NO_SECRET_KEY` without box; `INVALID_INPUT` for http redirect URI; `LAST_SIGN_IN_ROUTE` when disabling the only ready route; blank secret with nothing stored → `ready: false`. → implement → PASS → commit `feat(core): sign-in settings for ThaID and Provider ID`.

### Task 7: `ThaidClient` (core)

**Files:** Create `packages/core/src/identity/thaid-client.ts` + test.

**Interfaces:** `validCitizenId(value: unknown): boolean`; `class ThaidClient(settings: ThaidSettings, fetchImpl = fetch)` with `authorizeUrl(state: string): string` and `citizenIdForCode(code: string): Promise<string>`; `class ThaidError extends Error { code: 'INVALID' | 'UNAVAILABLE' }`.

- [x] Failing tests: authorize URL has `response_type=code&client_id&redirect_uri&scope=pid&state`; token POST uses Basic auth and form body, `redirect: 'error'`; `pid` from body; `pid` from `id_token` when body lacks it; `aud` string and array; foreign `aud` → INVALID; disagreeing `pid` → INVALID; bad check digit / number / spaces → INVALID; 4xx → INVALID; 5xx, network error, non-JSON → UNAVAILABLE. → implement → PASS → commit `feat(core): ThaID token client`.

### Task 8: web config readers become settings-backed

**Files:** Modify `apps/web/src/lib/provider-sso.ts` (`providerSsoConfig` → async, from `SignInSettingsService` with 30 s cache), all 11 callers; create `apps/web/src/lib/thaid.ts` (`thaidConfig(): Promise<ThaidSettings | null>`, `thaidFlowCookie = 'backoffice_thaid_flow'`, path `/api/auth/thaid`, `sealThaidFlow/openThaidFlow` carrying `{ state, purpose: 'sign_in' | 'link' }`); `password-sign-in.ts` counts ThaID ready.

- [x] Failing tests for `thaid.ts` (flow seal/open, expiry, purpose) and updated provider tests → implement → PASS → commit `refactor(web): sign-in routes read settings from the database first`.

### Task 9: ThaID routes (sign in)

**Files:** Create `apps/web/src/app/api/auth/thaid/start/route.ts`, `.../callback/route.ts` + tests; modify `apps/web/src/app/page.tsx`, create `apps/web/src/app/thaid-sign-in.tsx`; i18n keys.

- [x] Failing tests: start 404 when not ready, 303 to authorize URL with sealed cookie; callback outcomes `failed` (state/error/long code/INVALID), `unavailable`, `not_found`, `inactive`, success → session cookie + `/change-password`, `/choose-role` (several roles) or `/dashboard`; audit `identity.thaid_login` metadata `{ stage }` only; no `pid` in any audit/log call. → implement → PASS → commit `feat(web): sign in with ThaID`.

### Task 10: Provider ID pending → ยืนยันด้วย ThaID

**Files:** Modify `packages/core/src/identity/external-login-service.ts` (+test): `linkPendingToPerson(ticket: string, personId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'ALREADY_LINKED' | 'PERSON_NOT_ACTIVE' }>` (audit `identity.provider_link` `{ method: 'thaid' }`); callback `purpose: 'link'`; `apps/web/src/app/link-provider/page.tsx` button + error message.

- [x] Failing tests for service and callback link purpose (after review: the callback only seals `{ personId, ticketHash }` and sends the person to `/link-provider/confirm`, which shows both names; `POST /api/auth/thaid/link` links from an `ActionDialog`, clears the ticket and signs in; expired ticket → `/link-provider?thaid=failed`, no person → `not_found`; start with `purpose=link` needs a live ticket) → implement → PASS → commit `feat: link a pending Provider ID account by confirming with ThaID`.

### Task 11: ผู้ดูแลระบบ > การเข้าสู่ระบบ

**Files:** Create `apps/web/src/app/(app)/admin/sign-in/{page.tsx,sign-in-settings.tsx}` + test, `apps/web/src/app/api/admin/sign-in-settings/route.ts` + test; admin nav link; i18n.

- [x] Failing tests: non-admin 403 on API; save calls service with actor; error codes mapped to Thai messages; secrets inputs are `type=password`, empty by default, never prefilled; dialogs are `FormDialog`/`ActionDialog`. → implement → PASS → commit `feat(web): ผู้ดูแลระบบ > การเข้าสู่ระบบ`.

### Task 12: deploy script and runbook

**Files:** Create `infra/staging-251/setup-sign-in-settings.sh` (creates `/etc/backoffice/secrets/connection-secret-key` if missing, root 0600; idempotent), mount it in `docker-compose.provider-sso.yml` as `CONNECTION_SECRET_KEY_FILE`; extend `compose-config.test.sh`; `docs/runbooks/provider-sso.md` ThaID section (register `https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback` with DOPA, allow egress to `imauth.bora.dopa.go.th`).

- [x] compose test fails → wire → passes → commit `chore(infra): connection secret key for sign-in settings`.

PR 2 verification: `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… pnpm test:integration` (say if skipped), `git diff --check`.
