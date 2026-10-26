# HR leftovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the leave and ไปราชการ gaps in the spec.

**Architecture:** Service methods in `packages/core`, thin routes in `apps/web/src/app/api`, server components for pages.

**Tech Stack:** TypeScript, MariaDB, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-hr-leftovers-design.md`

## Global Constraints

- Workflow change, domain row and audit event in one transaction.
- Never put a decision reason in audit metadata or a notification.
- Thai copy from `packages/i18n/src/th.ts`.

## Review Focus

- A returned cancellation whose ใบลา was cancelled meanwhile is refused (NOT_APPROVED).
- Another person's returned cancellation answers NOT_FOUND.
- A ใบลา id sent with the cancel-days body answers NOT_FOUND, and the reverse.
- The status filter matches `tripStatus` for mixed member statuses.

---

### Task 1: Resubmit a returned ขอยกเลิกวันลา

**Files:** `packages/core/src/workflow/request-service.ts`, `packages/core/src/leave/leave-service.ts`, `packages/core/src/leave/leave-lifecycle.integration.test.ts`, `packages/core/src/workflow/request-service.test.ts`, `apps/web/src/app/api/leave/[requestId]/route.ts` and its test, the leave request page and `leave-actions.tsx`, `packages/i18n/src/th.ts`.

**Interfaces:** `LeaveService.resubmitCancelDays(personId, requestId, draft): Promise<{ ok: true } | { ok: false; code: LeaveErrorCode }>`; `resubmitRequest(input, { approvers?, actorAuthorized? })`.

- [x] Failing tests: resubmitRequest uses fixed approvers; lifecycle returns a cancellation, resubmits a new range to the same approver, approval restores those days; NOT_FOUND for others and for a ใบลา id; OVERLAPS_CANCELLATION ignores itself; route dispatches by body.
- [x] Implement; tests pass.
- [x] Commit `feat(leave): resubmit a returned ขอยกเลิกวันลา`.

### Task 2: Balance CSV follows gender

- [x] Failing integration test: a male person's export has no ลาคลอดบุตร row; a person without gender keeps it.
- [x] Implement in `exportLeaveBalancesCsv` with `genderAllows` and `genderForPrefix`.
- [x] Commit `fix(leave): balance export lists only types the person may take`.

### Task 3: ไปราชการ review leftovers

- [x] Failing tests: mixed half day gives two entries; page renders both; status filter in SQL; overlap code wins over balance.
- [x] Implement; tests pass.
- [x] Commit `fix(travel): calendar half days, status filter and overlap order`.

Verification: `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=mysql://backoffice:local-development-only@127.0.0.1:3306/backoffice_fresh pnpm test:integration`, `git diff --check origin/main...HEAD`.
