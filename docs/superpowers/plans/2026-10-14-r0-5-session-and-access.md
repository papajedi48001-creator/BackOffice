# R0.5 Server-Side Session and Access Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the never-expiring signed cookie with revocable server-side sessions, load roles from the database on every request, and harden local login.

**Spec:** `docs/superpowers/specs/2026-10-14-r0-5-session-and-access-design.md`

## Global Constraints

- Store only a SHA-256 hash of the session token; never log or audit a token, password, or username.
- Authorization data comes from the database on every request; the cookie carries only the opaque token.
- Migrations are additive.

### Task 1: Schema

**Files:** `packages/db/migrations/0003_session_and_login_throttle.sql`, `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/schema/access.ts`, `infra/backup/restore-verify.sh`

- [ ] Step 1: Extend `migrate.test.ts` to expect `0003_session_and_login_throttle.sql`; see it fail.
- [ ] Step 2: Add the migration (`user_session`, `login_throttle`, `role_name_unique`), Drizzle tables, and `user_session` in the restore check; run db tests and `restore-verify.test.sh`.

### Task 2: Session service

**Files:** `packages/core/src/identity/session-service.ts`, `session-service.test.ts`, `database-session-repository.ts`, `database-session-repository.integration.test.ts`

- [ ] Step 1: Write failing unit tests for start/resolve/revoke, idle and absolute expiry, hashed storage, and per-request access loading.
- [ ] Step 2: Implement `SessionService` and the MariaDB repository and access loader.
- [ ] Step 3: Integration test against MariaDB: start → resolve with scoped roles → revoke.

### Task 3: Login hardening

**Files:** `packages/core/src/identity/auth-service.ts`, `auth-service.test.ts`, `database-login-throttle.ts`, integration test

- [ ] Step 1: Write failing tests: lock after five failures, success clears the counter, unknown username still hashes, success/failure audit.
- [ ] Step 2: Implement throttle, dummy-hash verification, and audit recording.

### Task 4: Web integration

**Files:** `apps/web/src/lib/session.ts`, `apps/web/src/lib/database.ts`, `apps/web/src/lib/require-authorized.ts`, `apps/web/src/app/api/auth/local/**`, protected pages and layout, tests

- [ ] Step 1: Write failing route tests: login sets `Max-Age`, locked login returns 429, sign-out revokes.
- [ ] Step 2: Make `readSession` async over `SessionService`, update every caller, and wire login/sign-out.
- [ ] Step 3: Run web tests, typecheck, lint, and production build.

### Task 5: Verify

- [ ] `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:integration` with MariaDB, `bash infra/backup/restore-verify.test.sh`, `git diff --check`.
