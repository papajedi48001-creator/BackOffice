# R0.5 Restore Verification and Worker Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the restore drill check real tables and keep the worker running when one outbox event fails.

**Spec:** `docs/superpowers/specs/2026-10-14-r0-5-restore-and-worker-resilience-design.md`

## Global Constraints

- Additive migration only; never drop or rewrite existing outbox rows.
- Persist and log only sanitized error codes, never payloads or free text.
- Keep the existing `notification.*` type filter and idempotent delivery.

### Task 1: Restore verification checks real tables

**Files:** `infra/backup/restore-verify.sh`, `infra/backup/restore-verify.test.sh`, `infra/backup/README.md`, `docs/runbooks/restore.md`

- [x] Step 1: Make `restore-verify.test.sh` read `required_tables` and require each to be created by a migration; run it and see it fail on `foundation_person`.
- [x] Step 2: Replace the single `foundation_person` count with the `required_tables` loop and a `schema_migration` version check.
- [x] Step 3: Run `bash infra/backup/restore-verify.test.sh`; expect PASS. Update README and restore runbook wording.

### Task 2: Outbox retry schema

**Files:** `packages/db/migrations/0002_outbox_retry.sql`, `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/schema/outbox.ts`

- [x] Step 1: Extend `migrate.test.ts` to expect the `0002_outbox_retry.sql` version; see it fail.
- [x] Step 2: Add the migration and Drizzle columns; run `pnpm --filter @backoffice/db test`; expect PASS.

### Task 3: Worker isolates failing events

**Files:** `apps/worker/src/consumers/outbox-consumer.ts`, `apps/worker/src/consumers/outbox-consumer.test.ts`, `apps/worker/src/database-outbox-repository.ts`, `apps/worker/src/database-outbox-repository.test.ts`, `apps/worker/src/worker-runtime.ts`, `apps/worker/src/worker-runtime.test.ts`, `apps/worker/src/main.ts`

- [x] Step 1: Write failing tests: a failing first event does not block the second; error codes are sanitized; repository SQL filters retry state and applies backoff/dead-letter; runtime survives a rejected batch.
- [x] Step 2: Implement `markFailed`, per-event isolation, sanitized codes, and runtime `onError`.
- [x] Step 3: Run `pnpm --filter @backoffice/worker test && pnpm --filter @backoffice/worker typecheck`; expect PASS.

### Task 4: Verify

- [x] Run `pnpm lint && pnpm typecheck && pnpm test`, `bash infra/backup/restore-verify.test.sh`, `git diff --check`.
