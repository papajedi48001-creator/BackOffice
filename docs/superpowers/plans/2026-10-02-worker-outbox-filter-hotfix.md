# Worker Outbox Filter Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the staging worker running when valid workflow outbox events are pending, while preserving those events for a future workflow-notification implementation.

**Architecture:** The worker repository will query only notification event types it can deliver. Workflow events remain unprocessed rather than being passed to `NotificationConsumer` or marked processed. This is a narrow safety fix; it neither drops workflow events nor invents notification recipients.

**Tech Stack:** TypeScript, Vitest, MariaDB, pnpm workspace.

**Spec:** Staging evidence on 2026-10-02: twelve pending valid `workflow.request.submitted` and `workflow.request.decided` events caused `INVALID_NOTIFICATION_EVENT` and a worker restart loop.

## Global Constraints

- Do not mutate or mark existing workflow outbox rows as processed.
- Worker may consume only `notification.email` and `notification.in_app` event types.
- Preserve the existing notification delivery and idempotency behavior.

## Review Focus

- Pending workflow event does not reach `NotificationConsumer` or block a notification event behind it.
- Pending notification event still has its payload parsed and is deliverable.
- No SQL update is introduced for an event outside the notification types.

---

### Task 1: Filter Worker Outbox Queries

**Files:**
- Modify: `apps/worker/src/database-outbox-repository.ts:8-10`
- Modify: `apps/worker/src/database-outbox-repository.test.ts:5-20`

**Interfaces:**
- Consumes: `Database.query<T>(sql, parameters?)` from `@backoffice/db`.
- Produces: `DatabaseOutboxRepository.pending(): Promise<OutboxEvent[]>` containing only notification events.

- [x] **Step 1: Write the failing test**

Extend `loads only pending notification events and marks an event processed` to assert that the query filters by `notification.email` and `notification.in_app`, while the update remains guarded by event ID and `processed_at IS NULL`.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @backoffice/worker test -- database-outbox-repository.test.ts`

Expected: FAIL because the pending query currently selects every unprocessed outbox event.

- [x] **Step 3: Filter `DatabaseOutboxRepository.pending()` to supported notification types**

Add `type IN ('notification.email', 'notification.in_app')` to the existing pending query. Do not change `markProcessed`.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @backoffice/worker test -- database-outbox-repository.test.ts`

Expected: PASS.

- [x] **Step 5: Verify the worker suite and commit**

Run: `pnpm --filter @backoffice/worker test`; `pnpm --filter @backoffice/worker typecheck`; `git diff --check`.

Commit: `fix(worker): ignore unsupported outbox events`
