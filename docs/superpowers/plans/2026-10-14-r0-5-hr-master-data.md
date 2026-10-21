# R0.5 HR Master Data and Import Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR can validate and import people and organizations from CSV, and the HR pages show real, scoped, masked data.
**Spec:** `docs/superpowers/specs/2026-10-14-r0-5-hr-master-data-design.md`

### Task 1: Schema and masking

**Files:** `packages/db/migrations/0004_hr_master_data.sql`, `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/schema/{hr,core}.ts`, `packages/core/src/crypto/national-id.ts`, `packages/core/src/hr/person-service*.ts`

- [x] Step 1: Failing tests: migrate test expects 0004; `mask('1234567890123')` is `X-XXXX-XXXXX-12-3`.
- [x] Step 2: Add the migration, schema columns and the real mask; `PersonService` stores `national_id_masked`.

### Task 2: CSV parser and validation

**Files:** `packages/core/src/hr/csv.ts`, `packages/core/src/hr/master-data-validation.ts`, tests

- [x] Step 1: Failing tests for quoting, BOM, CRLF, and every error code in the spec, plus "report never contains the national ID".
- [x] Step 2: Implement `parseCsv` and `validateMasterData`.

### Task 3: Import service and directory

**Files:** `packages/core/src/hr/master-data-import.ts`, `packages/core/src/hr/hr-directory.ts`, integration test

- [x] Step 1: Failing MariaDB tests: apply creates rows and one audit event, re-apply is a no-op, a changed org closes the old assignment, an invalid row writes nothing, scoped listing.
- [x] Step 2: Implement the service (one transaction) and directory queries.

### Task 4: Web

**Files:** `apps/web/src/app/api/hr/imports/route.ts`, `apps/web/src/lib/national-id.ts`, `(app)/hr/{people,organizations,imports}`, layout navigation, i18n, tests

- [x] Step 1: Failing route tests (401, 403, 413, 422 with report, 200 apply) and page tests (masked ID only, scope).
- [x] Step 2: Implement route, pages and import form.
- [x] Step 3: Add national ID key secrets to production compose and the deploy runbook; add terms to CONTEXT.md.

### Task 5: Verify

- [x] `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:integration` with MariaDB, `bash infra/backup/restore-verify.test.sh`, `git diff --check`, `next build`.
