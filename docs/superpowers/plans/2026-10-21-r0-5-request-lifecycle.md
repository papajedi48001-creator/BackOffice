# Request Lifecycle Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A คำขอ can now go through every lifecycle step:
- Approvers can reject or return it with a reason.
- Requesters can cancel it, or resubmit it after it is returned.
- The detail page shows the real requester and a decision history.

**Architecture:**
- Lifecycle rules live in `RequestService` and `ApprovalService` in `@backoffice/core`, behind `WorkflowRepository`. Each state change, its audit entry and its outbox writes go in one transaction with `SELECT ... FOR UPDATE`.
- History is a read model, `RequestHistory`.
- Thin Next route handlers map error codes to HTTP statuses.
- The client panel renders the actions allowed for the viewer.

**Tech Stack:** TypeScript, zod, MariaDB via `@backoffice/db`, Next 16 App Router, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-r0-5-request-lifecycle-design.md`

## Global Constraints

- Reasons are trimmed, required, and between 1 and 2000 characters. They are stored only in `approval_decision.reason` and `request_cancellation.reason`. They never appear in audit metadata, outbox payloads, notification subjects, logs, or URLs.
- Who may act:
  - Cancel: only the requester, and only when the status is `IN_REVIEW` or `RETURNED`. The result is `CANCELLED`.
  - Resubmit: only the requester, and only when the status is `RETURNED`. The result is `IN_REVIEW`.
- On `REJECT`, `RETURN` or cancel, every remaining `PENDING` step becomes `CANCELLED`.
- Steps are ordered numerically: `CAST(sequence AS UNSIGNED)` in SQL and `Number()` in code.
- Outbox and audit actions: `workflow.request.cancelled` and `workflow.request.resubmitted`, both with result `SUCCESS`.
- Notification subjects:
  - Cancel: `คำขอถูกยกเลิก`. Sent to the pending approver, only when the request was `IN_REVIEW`.
  - Resubmit: `มีคำขอรอพิจารณา`. Sent to the first new step.
- HTTP statuses:
  - 401: unauthenticated.
  - 404: request not found, or the caller is not the requester.
  - 409: the request is in the wrong state.
  - 422: no reason was given, or no approver was found.
  - 503: no database.
- Names shown: `person.display_name`, falling back to `employee_code`, then `ไม่ระบุ`. Times are shown in the Asia/Bangkok time zone.
- Migration: `0007_request_cancellation.sql`. It is additive and is listed after `0005_room_booking.sql` (from another branch) and the current last entry.
- Button copy (no browser dialogs):
  - Approver buttons: `อนุมัติ`, `ไม่อนุมัติ`, `ส่งกลับแก้ไข`.
  - Requester buttons: `ยกเลิกคำขอ`, `ส่งพิจารณาอีกครั้ง`.
  - The reason form has a `เหตุผล` field and a confirm button, `ยืนยัน`.

## Review Focus

- **Cancel racing an approval:** two transactions on the same request must serialize through `FOR UPDATE`, and the second must get `REQUEST_NOT_CANCELLABLE` or `REQUEST_NOT_PENDING`. Pinned by the integration test in Task 3.
- **Resubmit when the approver can no longer be resolved:** must throw `NO_APPROVER` and leave the request `RETURNED`. Pinned in Task 4.
- **A reason of only spaces, or longer than 2000 characters:** must be rejected with 422 and nothing written. Pinned in Tasks 1 and 6.
- **A non-requester POSTing a cancellation:** must get 404, not 403, so the response does not reveal that the request exists. Pinned in Task 6.
- **A request with 10 or more steps:** the detail page and the services must pick step 2 before step 10. Pinned in Task 1.

---

### Task 1: Contracts, migration, repository ordering and cancellation store

**Files:**
- Modify: `packages/contracts/src/workflow.ts` and its test.
- Create: `packages/db/migrations/0007_request_cancellation.sql`.
- Modify: `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, and the Drizzle schema under `packages/db/src/schema`.
- Modify: `infra/backup/restore-verify.test.sh`, if it lists tables.
- Modify: `packages/core/src/workflow/request-service.ts`, to extend the `WorkflowRepository` interface.
- Modify: `packages/core/src/workflow/database-workflow-repository.ts` and its integration test.

**Interfaces:**
- Produces from contracts:
  - `ApprovalStep.status` gains the value `'CANCELLED'`.
  - `lifecycleReasonSchema = z.string().trim().min(1).max(2000)`.
  - `decideRequestInputSchema.reason` uses `lifecycleReasonSchema.optional()`.
  - `cancelRequestInputSchema`, an object with `requestId`, `actorPersonId` and `reason: lifecycleReasonSchema`.
  - `resubmitRequestInputSchema`, an object with `requestId` and `actorPersonId`.
  - `interface RequestCancellation { id: string; requestId: string; actorPersonId: string; reason: string }`.
- Produces from the repository: the `WorkflowRepository.saveCancellation(c: RequestCancellation): Promise<void>` method. `getSteps` orders by `CAST(sequence AS UNSIGNED)`.
- Migration SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS request_cancellation (
    id CHAR(36) PRIMARY KEY,
    request_id CHAR(36) NOT NULL,
    actor_person_id CHAR(36) NOT NULL,
    reason VARCHAR(2048) NOT NULL,
    created_at DATETIME NOT NULL,
    KEY request_cancellation_request_index (request_id),
    CONSTRAINT request_cancellation_request_fk FOREIGN KEY (request_id) REFERENCES request(id),
    CONSTRAINT request_cancellation_actor_fk FOREIGN KEY (actor_person_id) REFERENCES person(id)
  )
  ```

- [ ] **Step 1: Write the failing tests.**
  - Contract tests:
    - `cancelRequestInputSchema` rejects `reason: '   '` and `'x'.repeat(2001)`, and accepts `'x'.repeat(2000)`.
    - `decideRequestInputSchema` rejects a 2001-character reason.
  - Integration tests in `database-workflow-repository.integration.test.ts`:
    - Save steps with sequences 1 to 10 in shuffled order; `getSteps` returns `[1,2,...,10]`.
    - `saveCancellation` stores a row that a `SELECT reason FROM request_cancellation WHERE request_id = ?` reads back.
  - `migrate.test.ts` expects `0007_request_cancellation.sql` to be last.
- [ ] **Step 2: Run the tests and confirm they fail.**
  - Commands:
    - `pnpm --filter @backoffice/contracts test`
    - `pnpm --filter @backoffice/db test`
    - `DATABASE_URL=mysql://backoffice:ci-only-password@127.0.0.1:3306/backoffice pnpm --filter @backoffice/core exec vitest run src/workflow/database-workflow-repository.integration.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement the schemas, the migration, the Drizzle table, `saveCancellation` and the CAST ordering.**
- [ ] **Step 4: Run the same commands.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(workflow): store cancellations and order steps numerically`.

### Task 2: Closing a round closes the steps left in it

**Files:**
- Modify: `packages/core/src/workflow/approval-service.ts` and its test.

**Interfaces:**
- Consumes the `'CANCELLED'` step status from Task 1.

- [ ] **Step 1: Write the failing test.** For a request with 3 PENDING steps, `decideRequest` with `REJECT` (and, in a separate case, `RETURN`) on step 1 saves step 1 as `REJECTED` (or `RETURNED`), and steps 2 and 3 as `CANCELLED`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core exec vitest run src/workflow/approval-service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** After saving the decided step, call `saveStep({...s, status: 'CANCELLED'})` for each later PENDING step when the decision is not `APPROVE`.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `fix(workflow): cancel leftover steps when a request is rejected or returned`.

### Task 3: Cancel a request

**Files:**
- Modify: `packages/core/src/workflow/request-service.ts` and `request-service.test.ts`.
- Modify: `database-workflow-repository.integration.test.ts`.

**Interfaces:**
- Produces: `RequestService.cancelRequest(input: z.input<typeof cancelRequestInputSchema>): Promise<Omit<SubmittedRequest,'approvalSteps'>>`. It returns the request with `status: 'CANCELLED'`.
- Errors it throws, as `Error.message`:
  - `REASON_REQUIRED`, from a zod failure on the reason.
  - `REQUEST_NOT_FOUND`
  - `NOT_REQUESTOR`
  - `REQUEST_NOT_CANCELLABLE`

- [ ] **Step 1: Write the failing unit tests**, using the in-memory repository pattern already in `request-service.test.ts`:
  - The requester cancels `IN_REVIEW`:
    - The status becomes `CANCELLED` and the PENDING steps become `CANCELLED`.
    - `saveCancellation` gets the reason.
    - An outbox event `workflow.request.cancelled` is written with payload `{ requestId, moduleCode }`.
    - A notification is written to the pending approver with subject `คำขอถูกยกเลิก`.
    - An audit entry is written with action `workflow.request.cancelled` and result `SUCCESS`, and its metadata does not contain the reason text.
  - The requester cancels `RETURNED`: same result, but no notification.
  - A non-requester gets `NOT_REQUESTOR`.
  - Cancelling an `APPROVED` request gives `REQUEST_NOT_CANCELLABLE`.
  - A blank reason gives `REASON_REQUIRED`.
  - `JSON.stringify` of every outbox payload and audit event contains no reason text.
- [ ] **Step 2: Write the failing integration test.**
  - Submit a request, then run `cancelRequest` and `ApprovalService.decideRequest(APPROVE)` concurrently with `Promise.allSettled`.
  - Exactly one is fulfilled.
  - The final status is either `CANCELLED` or `APPROVED`, never both.
- [ ] **Step 3: Run** `pnpm --filter @backoffice/core exec vitest run src/workflow`, with `DATABASE_URL` set for the integration test. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Do all of the following in one `repository.transaction`:
    - `getRequestForUpdate`
    - check the requester and the status
    - `saveRequest`
    - close the steps
    - `saveCancellation`
    - write the outboxes
    - record the audit
  - Idempotency keys:
    - `workflow.request.cancelled:<requestId>`
    - `notification.in_app:request-cancelled:<requestId>:recipient:<id>`
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit.** Message: `feat(workflow): let requesters cancel a request with a reason`.

### Task 4: Resubmit after return

**Files:**
- Modify: `request-service.ts` and `request-service.test.ts`.

**Interfaces:**
- Produces: `RequestService.resubmitRequest(input): Promise<SubmittedRequest>`. The return value includes all steps, old and new.
- Errors: `REQUEST_NOT_FOUND`, `NOT_REQUESTOR`, `REQUEST_NOT_RETURNED`, `NO_APPROVER`.

- [ ] **Step 1: Write the failing tests.**
  - A RETURNED request with steps 1 (`RETURNED`) and 2 (`CANCELLED`), where the resolver returns 1 approver:
    - A new step with sequence 3 and status `PENDING` is created.
    - The status becomes `IN_REVIEW`.
    - An outbox event `workflow.request.resubmitted` is written.
    - The new approver is notified with `มีคำขอรอพิจารณา`, using idempotency key `notification.in_app:request-resubmitted:<requestId>:step:<newStepId>`.
    - An audit entry is written with action `workflow.request.resubmitted`.
  - When the resolver returns `[]`, it throws `NO_APPROVER`, and `saveRequest` is never called with `IN_REVIEW`.
  - Resubmitting an `IN_REVIEW` request gives `REQUEST_NOT_RETURNED`.
  - A non-requester gets `NOT_REQUESTOR`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Resolve approvers with the request's `moduleCode` and `organizationSnapshot.organizationId`. Number the new steps from `max(sequence) + 1`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(workflow): let requesters resubmit a returned request`.

### Task 5: Request history read model

**Files:**
- Create: `packages/core/src/workflow/request-history.ts` and `request-history.integration.test.ts`.
- Export it from `packages/core/src/index.ts`.

**Interfaces:**
- Produces `RequestHistory`, built with `new RequestHistory(db: Pick<Database,'query'>)`.
- `load(requestId): Promise<RequestHistoryView | null>`.
- `RequestHistoryView` has these fields:
  - `requestorName: string`
  - `organizationName: string`
  - `steps: Array<{ sequence: number; assigneePersonId: string; status: ApprovalStep['status'] }>`, sorted numerically.
  - `entries: Array<{ at: string; actorName: string; kind: 'APPROVE' | 'REJECT' | 'RETURN' | 'CANCEL'; reason: string | null }>`
- Notes:
  - `entries` is sorted ascending by `at`, which is an ISO UTC string produced with `DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ')`.
  - Names use `COALESCE(display_name, employee_code, 'ไม่ระบุ')`.
  - `organizationName` falls back to `'ไม่ระบุ'`.

- [ ] **Step 1: Write the failing integration test.**
  - Seed a requester with `display_name` `นางสาวมาลี ดีงาม`, an approver with only an `employee_code` `E001`, and one with neither.
  - Seed a decision (RETURN, with a reason), a cancellation, and 10 steps.
  - Expect:
    - the requester name;
    - actor names `E001` and `ไม่ระบุ`;
    - entries in time order, each with its reason;
    - steps sorted as 1 to 10.
  - An unknown id returns `null`.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use one query per part: the request with its requester and organization; the steps; and the decisions and cancellations joined with `UNION ALL`.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(workflow): read a request's history with real names`.

### Task 6: Cancellation and resubmission API

**Files:**
- Create: `apps/web/src/app/api/requests/[requestId]/cancellation/route.ts` and its test.
- Create: `apps/web/src/app/api/requests/[requestId]/resubmission/route.ts` and its test.
- Create: `apps/web/src/app/api/requests/lifecycle-error-status.ts` and its test.
- Modify: `apps/web/src/app/api/requests/request-error-code.ts`, adding the new codes to the known set.
- Move: `DatabaseApproverResolver` from `api/requests/route.ts` to `apps/web/src/lib/database-approver-resolver.ts`, so that resubmission can reuse it.

**Interfaces:**
- Produces: `lifecycleErrorStatus(code: string): 404 | 409 | 422 | 400`, with these mappings:
  - 404: `REQUEST_NOT_FOUND`, `NOT_REQUESTOR`
  - 409: `REQUEST_NOT_CANCELLABLE`, `REQUEST_NOT_RETURNED`
  - 422: `REASON_REQUIRED`, `NO_APPROVER`
  - 400: anything else
- Route behaviour:
  - `POST` with body `{ reason }` for cancellation, and `{}` for resubmission.
  - On success: 200 with `{ status }`.
  - On error: `{ error: '<snake_case code>' }`.
  - Log `backoffice.request_lifecycle_failed` with `{ code }` only.
- Each route test file starts with `// @vitest-environment node`.

- [ ] **Step 1: Write the failing route tests.** Mock `@backoffice/core` and `../../../../../lib/require-authorized` the same way the existing decisions route tests do.
  - Cancellation:
    - 401 when unauthenticated.
    - 404 when the service throws `NOT_REQUESTOR`.
    - 409 when it throws `REQUEST_NOT_CANCELLABLE`.
    - 422 when the reason is `'   '`.
    - 200 with `{ status: 'CANCELLED' }` on success.
    - The `console.error` spy is never called with the reason text.
  - Resubmission:
    - 200 with `{ status: 'IN_REVIEW' }` on success.
    - 422 when the service throws `NO_APPROVER`.
    - 409 when it throws `REQUEST_NOT_RETURNED`.
  - 503 when `DATABASE_URL` is empty.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web exec vitest run src/app/api/requests`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): add cancellation and resubmission endpoints`.

### Task 7: Detail page, actions and history UI

**Files:**
- Modify: `apps/web/src/components/status-badge.tsx` and its test.
- Modify: `apps/web/src/app/styles.css`.
- Modify: `apps/web/src/app/(app)/requests/[requestId]/page.tsx` and `request-detail-panel.tsx`.
- Create: `request-detail-panel.test.tsx`, plus `reason-form.tsx` if the panel gets long.
- Modify: `apps/web/src/lib/request-access.ts` and its test, adding `canCancelRequest` and `canResubmitRequest`.
- Modify: `apps/web/src/app/(app)/audit/{audit-event-table.tsx,page.tsx}` and their tests.
- Modify: `packages/i18n/src/th.ts`.

**Interfaces:**
- Consumes:
  - `RequestHistory` and `RequestHistoryView` from Task 5.
  - Routes from Task 6.
  - `POST /api/requests/[id]/decisions` with `{ decision, reason }`.
- Produces:
  - `RequestDisplayStatus` gains `'CANCELLED'`.
  - `canCancelRequest(actor, { requestorPersonId, status })` returns true for the requester when the status is `IN_REVIEW` or `RETURNED`.
  - `canResubmitRequest(actor, { requestorPersonId, status })` returns true for the requester when the status is `RETURNED`.
  - `RequestDetailPanel` props: `{ requestId, reference, requestorName, organizationName, status, history: RequestHistoryView['entries'], actions: { approve: boolean; cancel: boolean; resubmit: boolean }, statusAfterApprove }`.

- [ ] **Step 1: Write the failing tests.**
  - The StatusBadge test covers `CANCELLED` (shows `ยกเลิกแล้ว`), alongside the 4 existing statuses.
  - Panel test, approver view:
    - Clicking `ไม่อนุมัติ` shows a `เหตุผล` textbox.
    - `ยืนยัน` is disabled while the box is empty.
    - Typing `ข้อมูลไม่ครบ` and confirming POSTs `{ decision: 'REJECT', reason: 'ข้อมูลไม่ครบ' }`, after which the badge shows `ไม่อนุมัติ` and the actions disappear.
    - Do the same for `ส่งกลับแก้ไข`, which posts `RETURN`.
  - Panel test, requester view:
    - `ยกเลิกคำขอ`, with a reason, POSTs to `/cancellation`, and the badge then shows `ยกเลิกแล้ว`.
    - With `resubmit`, `ส่งพิจารณาอีกครั้ง` POSTs to `/resubmission`, and the badge then shows `รอพิจารณา`.
  - Panel test, failure: on a non-OK response, a `role="alert"` message appears and the status is unchanged.
  - The panel shows `requestorName` and does not show `ตัวอย่างบุคลากร`.
  - History: each entry shows the actor, the result label, the reason, and the time formatted in Asia/Bangkok. For `2026-10-21T03:00:00Z`, expect the text `21 ต.ค. 2569 10:00`, produced with `Intl.DateTimeFormat('th-TH-u-ca-buddhist', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })`.
  - Audit table: it shows labels for `workflow.request.cancelled` (`ยกเลิกคำขอ`) and `workflow.request.resubmitted` (`ส่งคำขออีกครั้ง`), and the page filter includes both.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page uses `RequestHistory.load`, so the old SQL `ORDER BY sequence` goes away. View access still uses `canViewRequest` with every step's assignee.
  - The reason form is an inline `<form>` with a `<label>เหตุผล</label>`, a `<textarea maxLength={2000} required>`, `ยืนยัน`, and `ยกเลิก` to close it.
  - CSS status classes:
    - `.status-rejected`: `#fde8e1` / `#9a3412`
    - `.status-returned`: `#fff4ce` / `#714d00`
    - `.status-cancelled`: `#eef2f6` / `#486581`
    - `.status-in_review` keeps the existing pending colours.
  - The danger action (`ไม่อนุมัติ`, `ยกเลิกคำขอ`) uses an outline style in alert colour, distinct by intent.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): approve, reject, return, cancel and resubmit from the request page`.

### Task 8: Verification and screenshots

- [ ] **Step 1: Run the checks** and record their real output:
  - `pnpm lint && pnpm typecheck && pnpm test`
  - `DATABASE_URL=... pnpm test:integration`
  - `bash infra/backup/restore-verify.test.sh`
  - `git diff --check`
  - `pnpm --filter @backoffice/web build`
- [ ] **Step 2: Take screenshots.**
  - Start the production server against `backoffice_demo` and seed a RETURNED request with history.
  - Capture the requester view and the approver view at 1440×900 and 390×844, saving them to `/mnt/project-files/screenshots/2026-10-21/request-*.png`.
- [ ] **Step 3: Commit** any fixes. Then tick the checkboxes in this plan.
