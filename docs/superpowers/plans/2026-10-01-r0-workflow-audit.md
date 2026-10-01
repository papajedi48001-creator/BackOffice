# R0 Workflow Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record request submission and decisions atomically, then show each signed-in actor their own safe audit history on `/audit`.

**Architecture:** Extend the transaction-scoped workflow repository with append-only audit persistence. `RequestService` and `ApprovalService` create events through the existing `AuditService` inside their existing transactions. The audit page server-renders a scoped read model and delegates display to a small presentational component.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, React Testing Library, MariaDB, `@backoffice/core`, `@backoffice/db`, `@backoffice/i18n`.

**Spec:** `docs/superpowers/specs/2026-10-01-r0-workflow-audit-design.md`

## Global Constraints

- Support only `maintenance` request creation and `APPROVE`/`REJECT`/`RETURN` decisions in R0.
- Persist audit in the same MariaDB transaction as request, step, decision, and outbox writes.
- Use `AuditService` so metadata is validated and redacted before persistence.
- Persist only `moduleCode`, `requestReference`, `status`, and `organizationId` metadata; never persist or display credentials, tokens, national IDs, decision reasons, raw snapshots, or person UUIDs.
- `/audit` is actor-scoped, read-only, newest-first, and has no filter, export, or central-auditor view.
- Use UTC in the database and Thai-first copy in the UI.

## Review Focus

- An audit append failure must rollback the workflow transition instead of leaving an un-audited request or decision; covered by Task 2 integration test.
- A rejected or returned decision must record its actual outcome but not its free-text reason; covered by Task 1 unit tests.
- Metadata with a password or national ID must not persist; covered by Task 1 `AuditService` regression test.
- Events from another actor must not be rendered in `/audit`; covered by Task 3 component/page data test.
- An unauthenticated request to `/audit` must follow the existing protected-route redirect; covered by Task 3 page test.

---

### Task 1: Add transaction-scoped workflow audit events

**Files:**
- Modify: `packages/core/src/workflow/request-service.ts`
- Modify: `packages/core/src/workflow/approval-service.ts`
- Modify: `packages/core/src/workflow/request-service.test.ts`
- Modify: `packages/core/src/workflow/approval-service.test.ts`
- Modify: `packages/core/src/audit/audit-service.test.ts`

**Interfaces:**
- Consumes: existing `AuditService.recordAudit(input: AuditInput): Promise<void>` and `AuditEvent` contract.
- Produces: `WorkflowRepository.appendAudit(event: AuditEvent): Promise<void>` and workflow services that append redacted events within `transaction`.

- [ ] **Step 1: Write failing workflow tests for submitted and decided audit events**

Add a `savedAuditEvents` collection to each in-memory repository. Assert `submitRequest` appends exactly one `workflow.request.submitted` event with the requestor as actor, request ID as target, `SUCCESS` result, and metadata containing `maintenance`, `REQ-request-1`, `IN_REVIEW`, and `unit-a`. Assert `decideRequest` appends `workflow.request.decided` with the approver actor and its exact decision result.

- [ ] **Step 2: Run the new unit tests to verify they fail**

Run: `pnpm --filter @backoffice/core test -- request-service.test.ts approval-service.test.ts`

Expected: FAIL because `WorkflowRepository` cannot append an audit event and no event is saved.

- [ ] **Step 3: Extend the repository interface and record events inside the existing transactions**

Add `appendAudit(event: AuditEvent): Promise<void>` to `WorkflowRepository`. In each service transaction, construct `AuditService` with `{ append: repository.appendAudit }`; use the existing ID factory and call `recordAudit` after the request/decision state is assembled but before the transaction completes. Use these exact inputs:

| Transition | action | result | target |
|---|---|---|---|
| submit | `workflow.request.submitted` | `SUCCESS` | request ID |
| decision | `workflow.request.decided` | `decisionInput.decision` | request ID |

Pass the allowlisted metadata only. Keep `decisionInput.reason` out of metadata.

- [ ] **Step 4: Extend the audit redaction regression test**

In `audit-service.test.ts`, record metadata containing allowed `requestReference` plus `password`, `token`, and a 13-digit `nationalId`; assert serialized metadata keeps only the safe allowed reference and does not contain the sensitive values.

- [ ] **Step 5: Run focused core tests**

Run: `pnpm --filter @backoffice/core test -- request-service.test.ts approval-service.test.ts audit-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/core/src/workflow/request-service.ts packages/core/src/workflow/approval-service.ts packages/core/src/workflow/request-service.test.ts packages/core/src/workflow/approval-service.test.ts packages/core/src/audit/audit-service.test.ts
git commit -m "feat(audit): record workflow transitions"
```

### Task 2: Persist workflow audit records atomically in MariaDB

**Files:**
- Modify: `packages/core/src/workflow/database-workflow-repository.ts`
- Modify: `packages/core/src/workflow/database-workflow-repository.integration.test.ts`

**Interfaces:**
- Consumes: `WorkflowRepository.appendAudit(event: AuditEvent)` from Task 1.
- Produces: MariaDB implementation that writes the validated event to `audit_event` without opening a separate transaction.

- [ ] **Step 1: Write failing MariaDB integration assertions**

After a submitted request, query `audit_event` by `target_id` and assert one row has `action = 'workflow.request.submitted'`, `result = 'SUCCESS'`, the requestor actor, and JSON metadata without non-allowlisted values. Add a decision scenario and assert one `workflow.request.decided` row has the approver actor and `APPROVE` result.

- [ ] **Step 2: Add a rollback integration case**

Seed an `audit_event` whose ID is `audit-duplicate`. Supply a deterministic ID factory that returns unique request/step/outbox IDs and then `audit-duplicate` for the audit event. Submit the request, assert the duplicate-key audit insert rejects, then query by generated request ID and assert no `request`, `approval_step`, or `outbox_event` row remains; the original seeded audit row remains exactly once.

- [ ] **Step 3: Run the integration tests to verify they fail**

Run: `pnpm --filter @backoffice/core test -- database-workflow-repository.integration.test.ts`

Expected: FAIL because the database repository does not yet implement `appendAudit`.

- [ ] **Step 4: Implement `appendAudit(event: AuditEvent): Promise<void>`**

Insert `(id, actor_person_id, action, target_type, target_id, result, metadata, created_at)` into `audit_event`, using the already-redacted event metadata and `UTC_TIMESTAMP()` for storage. Do not add update/delete methods or a second transaction.

- [ ] **Step 5: Run the integration test**

Run: `pnpm --filter @backoffice/core test -- database-workflow-repository.integration.test.ts`

Expected: PASS with the existing MariaDB test database available.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/core/src/workflow/database-workflow-repository.ts packages/core/src/workflow/database-workflow-repository.integration.test.ts
git commit -m "feat(audit): persist workflow evidence atomically"
```

### Task 3: Render actor-scoped audit history

**Files:**
- Create: `apps/web/src/app/(app)/audit/audit-event-table.tsx`
- Create: `apps/web/src/app/(app)/audit/audit-event-table.test.tsx`
- Create: `apps/web/src/app/(app)/audit/page.test.tsx`
- Modify: `apps/web/src/app/(app)/audit/page.tsx`
- Modify: `packages/i18n/src/th.ts`

**Interfaces:**
- Consumes: session `personId`, `audit_event` rows, and Thai label keys.
- Produces: `AuditEventTable({ events }: { events: AuditEventRow[] })` that renders only safe fields or the existing empty-state copy.

- [ ] **Step 1: Write the failing table tests**

Define `AuditEventRow` with `createdAt`, `action`, `result`, and parsed safe `requestReference`. Render events for a submitted request and an approved request; assert the Thai action/result labels and `REQ-request-1` are visible. Render an empty list and assert `noAuditData`. Assert the rendered markup never contains actor ID, target ID, raw metadata, password, or national ID fixtures.

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `pnpm --filter @backoffice/web test -- audit-event-table.test.tsx`

Expected: FAIL because `AuditEventTable` does not exist.

- [ ] **Step 3: Implement the presentational table and Thai labels**

Create `AuditEventTable` as a server-safe component. Add Thai labels for submitted, approved, rejected, returned, success, and the table headings. The component accepts only prepared safe fields and does not parse or render raw metadata.

- [ ] **Step 4: Replace the audit placeholder with the protected scoped query**

Follow `requests/page.tsx`: read session from request headers, redirect unauthenticated users to `/`, read `DATABASE_URL`, create/close the database in `try/finally`, and query only `audit_event WHERE actor_person_id = ? ORDER BY created_at DESC`. Select only `created_at`, `action`, `result`, and `metadata`; parse `requestReference` defensively from metadata and discard all other keys before passing events to the table. If runtime configuration is unavailable, render a Thai alert rather than leaking technical details.

- [ ] **Step 5: Write and run the page access/scope test**

Mock `headers`, `readSession`, `readRuntimeValue`, and `createDatabase`. For session person `person-a`, assert the SQL query includes `WHERE actor_person_id = ?` with `person-a`, and that the page closes the database. Mock an absent session and assert `redirect('/')` is called before a database query.

- [ ] **Step 6: Run focused web tests**

Run: `pnpm --filter @backoffice/web test -- audit-event-table.test.tsx page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add -- 'apps/web/src/app/(app)/audit/audit-event-table.tsx' 'apps/web/src/app/(app)/audit/audit-event-table.test.tsx' 'apps/web/src/app/(app)/audit/page.test.tsx' 'apps/web/src/app/(app)/audit/page.tsx' packages/i18n/src/th.ts
git commit -m "feat(web): show actor workflow audit history"
```

### Task 4: Verify and stage the completed audit flow

**Files:**
- Modify only if verification identifies a defect in Tasks 1–3.

**Interfaces:**
- Consumes: completed workflow audit persistence and actor-scoped audit UI.
- Produces: verified staging evidence without committing secrets or claiming production readiness.

- [ ] **Step 1: Run repository verification**

Run: `pnpm test; pnpm typecheck; pnpm lint; pnpm --filter @backoffice/web build; git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Inspect the final change before staging**

Run: `git status --short; git log --oneline -3; git diff HEAD~3..HEAD --check`

Expected: only audit implementation commits are present and no whitespace errors appear.

- [ ] **Step 3: Build and deploy staging web image**

Archive the exact verified commit, transfer it to `/opt/backoffice-staging/releases/<commit>`, build only the `web` service with the staging compose set, then recreate only `web`. Do not print or transfer secret values.

- [ ] **Step 4: Verify service readiness and browser workflow**

Run the retrying loopback health check until it returns `{"status":"ok"}`. In the browser, use the existing separate local pilot accounts to create and approve one request; verify the requestor’s `/audit` shows the submit event, the approver’s `/audit` shows the decision event, and neither view shows the other actor’s event.

- [ ] **Step 5: Commit any verification-only correction, then report boundaries**

If a defect fix is needed, make one focused Conventional Commit and rerun Step 1. Report the exact commands and browser evidence. Do not claim restore-drill, production, push, merge, or go-live completion.

## Plan Self-Review

- Spec coverage: Tasks 1–2 implement event creation, metadata safety, append-only persistence, and atomic failure semantics. Task 3 implements actor-scoped read-only rendering. Task 4 covers unit/integration/UI verification and staging evidence.
- Interface consistency: `WorkflowRepository.appendAudit(event: AuditEvent)` is introduced in Task 1, persisted in Task 2, and consumed only within transaction scopes. Task 3 does not expose it to the client.
- Review-focus coverage: rollback is Task 2, decision reason/redaction are Task 1, cross-actor isolation and authentication are Task 3.
- Proportion: the plan defines interfaces, tests, and commands without embedding implementation bodies.
