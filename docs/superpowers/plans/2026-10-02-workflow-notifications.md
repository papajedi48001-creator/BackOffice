# Workflow In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable, private Thai in-app notifications for new maintenance-request workflow transitions.

**Architecture:** Workflow services write a dedicated `notification.in_app` event in the same transaction as a request transition. The worker persists a recipient-scoped notification exactly once; the web app lists and reads it only for that recipient while enforcing access to the linked request.

**Tech Stack:** TypeScript, Next.js 16, React 19, Vitest, MariaDB, Drizzle schema definitions, transactional outbox worker.

**Spec:** `docs/superpowers/specs/2026-10-02-workflow-notifications-design.md`

## Global Constraints

- Create notifications only for requests and decisions occurring after release; do not replay old `workflow.*` events.
- Support only `notification.in_app`; do not add email, push, preferences, or bulk read actions.
- Persist only recipient ID, linked request ID, Thai short subject, timestamps, and read state; never persist decision reasons or clinical data in a notification.
- Keep workflow transition and notification-event creation in one database transaction.
- Keep existing worker filtering so `workflow.request.submitted` and `workflow.request.decided` are never consumed as notifications.
- Enforce the authenticated person for notification list, unread count, read action, and linked-request access.
- Release to staging first and validate only with newly created requests.

## Review Focus

- A two-step approval must remain `IN_REVIEW` after the first approval and notify only the second approver. Covered in Task 2.
- Retrying the same `notification.in_app` outbox event must yield one database notification and no duplicate list row. Covered in Task 3.
- A guessed notification ID must not disclose whether another recipient has a notification; return the same not-found result. Covered in Task 4.
- A signed-in person who is neither requestor nor an approval-step assignee must not open a guessed request URL. Covered in Task 4.
- Historical unprocessed `workflow.*` rows must remain unprocessed after the worker runs. Covered in Task 3.

---

## File Structure

| Area | Files | Responsibility |
| --- | --- | --- |
| Contract and schema | `packages/contracts/src/notifications.ts`, `packages/db/src/schema/outbox.ts`, `packages/db/migrations/0001_in_app_notifications.sql`, `packages/db/src/migrate.ts` | Validate notification payloads and evolve a deployed database safely. |
| Workflow | `packages/core/src/workflow/request-service.ts`, `packages/core/src/workflow/approval-service.ts` | Emit recipient-specific notification events while applying the correct workflow state. |
| Delivery worker | `apps/worker/src/consumers/notification-consumer.ts`, `apps/worker/src/database-notification-store.ts` | Validate and persist one notification per event/channel before marking it processed. |
| Web UI and access | `apps/web/src/app/(app)/notifications/**`, `apps/web/src/app/api/notifications/**`, `apps/web/src/lib/request-access.ts`, protected layout | Show recipient-only notifications and protect linked request access. |

### Task 1: Add notification data contract and migration path

**Files:**
- Modify: `packages/contracts/src/notifications.ts`
- Modify: `packages/db/src/schema/outbox.ts`
- Modify: `packages/db/src/migrate.ts`
- Create: `packages/db/migrations/0001_in_app_notifications.sql`
- Modify: `packages/db/src/schema/schema.integration.test.ts`
- Create: `packages/db/src/migrate.test.ts`

**Interfaces:**
- Produces `notificationEventPayloadSchema` for `{ recipientPersonId, requestId, subject }` and a notification record shape containing `requestId`, `subject`, and `readAt`.
- Produces migration execution that applies `0000_r0_foundation.sql` and `0001_in_app_notifications.sql` once each, recorded in a `schema_migration` table.
- Consumed by Tasks 2-4.

- [ ] **Step 1: Write failing migration and contract tests**

Add tests that require an in-app payload to have non-empty `recipientPersonId`, `requestId`, and `subject`; require the migration runner to skip an already-recorded version; and, in the MariaDB integration test, assert the notification table supports a unique `(outbox_event_id, channel)` row and the new read/navigation columns.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/db test`

Expected: FAIL because the payload schema, migration registry, and `0001` schema do not exist. If the database suite cannot connect locally, capture the exact environment error and run it in CI or against the approved test database before merge.

- [ ] **Step 3: Implement the additive notification migration and types**

Add `0001_in_app_notifications.sql` to add `subject VARCHAR(255)`, nullable `request_id`, nullable `read_at`, a foreign key to `request`, a unique key named `notification_event_channel_unique` on `(outbox_event_id, channel)`, and an index supporting recipient/unread/latest queries. Keep `request_id` nullable only for compatibility with existing non-workflow email events.

Update the Drizzle `notifications` table and contract exports. Change `runMigrations` from a single hard-coded file to an ordered migration list tracked by `schema_migration`; it must record a version only after that migration's statements succeed.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/db test`

Expected: PASS; the integration test may be skipped only when its documented database prerequisite is absent.

- [ ] **Step 5: Commit the schema foundation**

```bash
git add packages/contracts/src/notifications.ts packages/db/src/schema/outbox.ts packages/db/src/migrate.ts packages/db/migrations/0001_in_app_notifications.sql packages/db/src/schema/schema.integration.test.ts packages/db/src/migrate.test.ts
git commit -m "feat(notifications): add durable in-app notification schema"
```

### Task 2: Correct workflow transitions and emit notification events

**Files:**
- Modify: `packages/core/src/workflow/request-service.ts`
- Modify: `packages/core/src/workflow/request-service.test.ts`
- Modify: `packages/core/src/workflow/approval-service.ts`
- Modify: `packages/core/src/workflow/approval-service.test.ts`
- Modify: `packages/core/src/workflow/database-workflow-repository.integration.test.ts`

**Interfaces:**
- Consumes `notificationEventPayloadSchema` from Task 1.
- Produces `notification.in_app` outbox events whose payload is `{ recipientPersonId, requestId, subject }`.
- Produces correct request statuses for submit, intermediate approval, final approval, rejection, and return.
- Consumed by Task 3.

- [ ] **Step 1: Write failing RequestService tests**

Extend the in-memory workflow repository to replace an existing saved step rather than append a duplicate. Add a test with deterministic sequential IDs asserting that submit writes both `workflow.request.submitted` and one `notification.in_app` event for approval step 1; assert the notification payload includes no decision reason or organization snapshot.

- [ ] **Step 2: Write failing ApprovalService tests**

Add a two-step sequence test: step 1 approval saves that step as `APPROVED`, keeps the request `IN_REVIEW`, and emits exactly one notification to step 2's assignee. Add final-approval, reject, and return tests asserting one notification to the requestor and terminal status. Add a terminal-request test asserting `REQUEST_NOT_PENDING` and no writes after a final decision.

- [ ] **Step 3: Run the focused core tests to verify failure**

Run: `pnpm --filter @backoffice/core test -- workflow/request-service.test.ts workflow/approval-service.test.ts`

Expected: FAIL because submit has no notification event and the first approval immediately finalizes the request.

- [ ] **Step 4: Implement atomic event emission and state selection**

In `RequestService.submitRequest`, after persisting request and steps, save the existing workflow event and a `notification.in_app` event for the first snapshot using an idempotency key tied to request and first step.

In `ApprovalService.decideRequest`, determine the next pending step before writes. For `APPROVE`, set the current step to `APPROVED`; keep the request `IN_REVIEW` and notify that next assignee when one exists, otherwise set request `APPROVED` and notify the requestor. For `REJECT` and `RETURN`, set request and current step to their corresponding terminal values and notify the requestor. Preserve the workflow audit event but record the resulting request status, never the decision reason.

- [ ] **Step 5: Extend database repository integration coverage**

Against the configured integration database, assert both event rows are stored in the same request transaction, the notification payload has the intended recipient/request/subject fields, and an intermediate approval leaves the request in `IN_REVIEW`.

- [ ] **Step 6: Run core verification**

Run: `pnpm --filter @backoffice/core test && pnpm --filter @backoffice/core typecheck`

Expected: PASS, with database integration results recorded separately if local MariaDB is unavailable.

- [ ] **Step 7: Commit workflow behavior**

```bash
git add packages/core/src/workflow/request-service.ts packages/core/src/workflow/request-service.test.ts packages/core/src/workflow/approval-service.ts packages/core/src/workflow/approval-service.test.ts packages/core/src/workflow/database-workflow-repository.integration.test.ts
git commit -m "feat(workflow): notify the next responsible person"
```

### Task 3: Persist worker-delivered in-app notifications idempotently

**Files:**
- Modify: `apps/worker/src/consumers/notification-consumer.ts`
- Modify: `apps/worker/src/consumers/notification-consumer.test.ts` (create if absent)
- Modify: `apps/worker/src/database-notification-store.ts`
- Modify: `apps/worker/src/database-notification-store.test.ts`
- Modify: `apps/worker/src/consumers/outbox-consumer.integration.test.ts`
- Modify: `apps/worker/src/database-outbox-repository.test.ts`

**Interfaces:**
- Consumes the Task 2 `notification.in_app` payload.
- Changes `WorkerNotificationDeliveryStore.claim` to accept `{ eventId, channel, recipientPersonId, requestId, subject }` and return `Promise<boolean>`.
- Produces a single `notification` row with `subject`, `request_id`, `delivered_at`, and `read_at = null` for each event/channel.
- Consumed by Task 4.

- [ ] **Step 1: Write failing consumer and storage tests**

Add tests that reject an in-app event missing `requestId` or a non-empty subject, persist the safe subject and request ID for a valid event, and return `false` when `notification_event_channel_unique` prevents a second claim. Keep the existing email compatibility test, where request ID may be null.

Add a batch test containing one historical `workflow.request.submitted` event and one `notification.in_app` event; assert the worker asks the repository only for notification types and marks only the notification event processed.

- [ ] **Step 2: Run worker tests to verify failure**

Run: `pnpm --filter @backoffice/worker test`

Expected: FAIL because the store only accepts IDs/recipient and does not persist request, subject, or read state.

- [ ] **Step 3: Implement validation and atomic notification persistence**

Parse `notification.in_app` with the Task 1 payload schema. Pass the validated values into the store. Insert a notification with `INSERT IGNORE`, subject, request ID, `delivered_at = UTC_TIMESTAMP()`, and `read_at = NULL`; determine ownership of the claim by checking the generated notification ID. Leave the outbox repository's notification-type filter unchanged.

- [ ] **Step 4: Run worker verification**

Run: `pnpm --filter @backoffice/worker test && pnpm --filter @backoffice/worker typecheck`

Expected: PASS; retries create no duplicate notification and historical workflow rows remain unprocessed.

- [ ] **Step 5: Commit worker delivery**

```bash
git add apps/worker/src/consumers/notification-consumer.ts apps/worker/src/consumers/notification-consumer.test.ts apps/worker/src/database-notification-store.ts apps/worker/src/database-notification-store.test.ts apps/worker/src/consumers/outbox-consumer.integration.test.ts apps/worker/src/database-outbox-repository.test.ts
git commit -m "feat(worker): persist in-app workflow notifications"
```

### Task 4: Add recipient-only notification APIs, page, and request access checks

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/lib/request-access.ts`
- Modify: `apps/web/src/lib/request-access.test.ts`
- Modify: `apps/web/src/app/(app)/requests/[requestId]/page.tsx`
- Create: `apps/web/src/app/(app)/notifications/page.tsx`
- Create: `apps/web/src/app/(app)/notifications/notification-list.tsx`
- Create: `apps/web/src/app/(app)/notifications/notification-list.test.tsx`
- Create: `apps/web/src/app/api/notifications/route.ts`
- Create: `apps/web/src/app/api/notifications/route.test.ts`
- Create: `apps/web/src/app/api/notifications/[notificationId]/read/route.ts`
- Create: `apps/web/src/app/api/notifications/[notificationId]/read/route.test.ts`
- Modify: `packages/i18n/src/th.ts`

**Interfaces:**
- Consumes persisted notification rows from Task 3.
- `GET /api/notifications` returns `{ notifications, unreadCount }` only for `session.personId`.
- `PATCH /api/notifications/:notificationId/read` marks a recipient-owned notification read and returns its `requestId`; it returns `404` for a missing or non-owned notification.
- `canViewRequest(actorPersonId, { requestorPersonId, approverPersonIds })` returns a boolean used before rendering a request detail page.

- [ ] **Step 1: Write failing API and pure-access tests**

Add API tests that assert list SQL is parameterized with only the signed-in person, unread count is scoped to that person, and a read update includes both notification ID and recipient person ID. Assert a non-owned or unknown ID returns the same `404` response. Add `canViewRequest` tests for requestor, a step assignee, and an unrelated person.

- [ ] **Step 2: Write failing page and interaction tests**

Add a notification-list test that renders Thai unread/read states, calls the read endpoint when a row is opened, and then navigates to `/requests/<requestId>`. Add protected-layout coverage for the `การแจ้งเตือน` navigation item and unread badge. Add request-detail page coverage that invokes `notFound()` for a signed-in unrelated person before rendering request data.

- [ ] **Step 3: Run focused web tests to verify failure**

Run: `pnpm --filter @backoffice/web test -- notifications request-access`

Expected: FAIL because the notification routes/page and request visibility check do not exist.

- [ ] **Step 4: Implement recipient-scoped endpoints and Thai UI**

Implement direct parameterized database reads following the existing app-route pattern. The list query selects only safe notification fields and orders `created_at DESC`; the read update uses `WHERE id = ? AND recipient_person_id = ? AND read_at IS NULL`. The client list marks a row read before navigating, and retains a safe empty state when there are no notifications.

Extend `NavigationItem` with an optional numeric badge and query the unread count in the protected layout only when database configuration is available. Add Thai copy keys for the notifications title, empty state, unread/read labels, and error state.

Before rendering a request detail page, load step assignee snapshots, derive their person IDs, and require `canViewRequest` for the requestor or one of those assignees. Use `notFound()` for a denied view so a guessed request identifier leaks no data.

- [ ] **Step 5: Run web verification**

Run: `pnpm --filter @backoffice/web test && pnpm --filter @backoffice/web typecheck && pnpm --filter @backoffice/web lint`

Expected: PASS, including recipient isolation, Thai empty/read states, navigation, and request access denial.

- [ ] **Step 6: Commit web experience and authorization**

```bash
git add apps/web/src packages/i18n/src/th.ts
git commit -m "feat(web): show private workflow notifications"
```

### Task 5: Verify the release candidate and perform staging UAT

**Files:**
- Modify: `docs/pilot/r0-uat-scenarios.md`
- Modify: `docs/runbooks/deploy.md`

**Interfaces:**
- Consumes the completed Tasks 1-4 application build.
- Produces repeatable staging evidence for notification behavior; does not authorize production deployment.

- [ ] **Step 1: Add failing acceptance checklist entries**

Add explicit UAT scenarios for a new two-step request, final approval, reject, return, unread count, read-on-open, recipient isolation, and confirmation that pre-feature workflow rows did not create notifications. Add deploy-runbook checks for the notification migration, worker health, and rollback boundary.

- [ ] **Step 2: Verify the documentation diff**

Run: `git diff --check && git diff -- docs/pilot/r0-uat-scenarios.md docs/runbooks/deploy.md`

Expected: the checklist captures only new-post-release requests and contains no credentials or sensitive examples.

- [ ] **Step 3: Run release-candidate verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS in CI or in an environment with the documented MariaDB integration credentials. Do not claim a local full-suite pass if the known database prerequisite remains absent.

- [ ] **Step 4: Build and deploy only to staging**

Use the existing staging release procedure with a commit-addressed image tag. Confirm `/api/health`, worker running state, migration completion, and absence of notification-consumer errors before UAT.

- [ ] **Step 5: Execute and record staging UAT**

Create new test requests only after the feature deployment. Capture outcomes for every scenario from Step 1, including one authorization-denial check. Verify the existing twelve workflow events remain untouched. Stop for explicit user approval before any production action.

- [ ] **Step 6: Commit UAT and runbook updates**

```bash
git add docs/pilot/r0-uat-scenarios.md docs/runbooks/deploy.md
git commit -m "docs(notifications): add staging verification procedure"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1-4 implement every design section; Task 5 provides the required staging-only rollout evidence. No design requirement is unassigned.
- **Step clarity:** Each task begins with a named failing test, specifies the interface and exact affected files, then verifies and commits one independently reviewable deliverable.
- **Type consistency:** Task 1 defines the payload; Task 2 emits it; Task 3 persists it; Task 4 reads it. `requestId`, `recipientPersonId`, `subject`, and `readAt` use the same names throughout.
- **Review focus:** Each listed failure mode is assigned to an explicit task test.
- **Proportion:** The plan fixes interfaces and behavior without prescribing implementation bodies beyond migration and query constraints that the design requires.
