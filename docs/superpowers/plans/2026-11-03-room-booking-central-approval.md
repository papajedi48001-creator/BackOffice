# Room booking through the central approval chain: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A room booking first goes to the booker's head in คำขอ. After the head เห็นชอบ, ผู้จัดการห้องประชุม (`room-manager`) gives the final approval.

**Architecture:**
- `RoomBookingService.submit` opens a central คำขอ (`room-booking`, `NEAREST_HEAD`) in the same transaction as the booking.
- `ApprovalService` calls a new optional `onRequestDecided` hook. `DatabaseWorkflowRepository` uses it to move the booking to its next status in the same transaction.
- The web app adds a link from a request to its booking, the head's decision buttons, and the new status label.

**Tech Stack:** TypeScript, MariaDB, Vitest, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-11-03-room-booking-central-approval-design.md`

## Global Constraints
- Migrations are additive and listed in `migrate.ts`. The Drizzle schema is kept in step.
- The workflow transition, the booking status change, audit and outbox are written in one transaction.
- No decision reason goes into a notice, outbox payload or audit metadata.
- Thai copy: รอหัวหน้าเห็นชอบ, รอผู้จัดการอนุมัติ, เห็นชอบ, ไม่เห็นชอบ.

## Review Focus
1. **Booker is their own unit's head.** Resolution goes up the chain, as for fleet. If no approver is found, the booking is refused with a Thai message.
2. **RETURN posted to the central API for a booking.** It is refused and nothing changes.
3. **Booker cancels while the booking is in head review.** The request is cancelled too, and the head's inbox empties.
4. **Head rejects.** The slots are free at once for another booking.
5. **Bookings submitted before this change** (PENDING, no request). They keep working for the manager.

### Task 1: data, contracts and the decision hook
**Files:**
- `packages/db/migrations/0027_room_booking_request.sql`, `migrate.ts`, `schema/rooms.ts`
- `packages/contracts/src/rooms.ts` (`HEAD_REVIEW`; history actions `HEAD_APPROVED`, `HEAD_REJECTED`)
- `packages/core/src/workflow/request-service.ts` (optional `onRequestDecided(request, status, actorPersonId)` on `WorkflowRepository`)
- `approval-service.ts`, `approval-service.test.ts`

**Produces:** `onRequestDecided?(request: SubmittedRequestRow, status: RequestStatus, decision: ApprovalAction, actorPersonId: string): Promise<void>`. It is called before `saveRequest`, and a throw rolls the decision back.

- [ ] Failing unit test: the hook is called with the final status. A throwing hook leaves nothing saved.
- [ ] Implement, pass, commit.

### Task 2: room service and workflow hook for room-booking
**Files:**
- `room-booking-service.ts`, `room-booking-repository.ts`, `database-room-booking-repository.ts`, `in-memory-room-booking-repository.ts`
- `database-workflow-repository.ts`, `module-notification.ts`, `access/policy.ts`
- Integration tests in `database-room-booking-repository.integration.test.ts`

What the tests must prove:
- [ ] A submit creates a booking in `HEAD_REVIEW` with a `request_id` and a pending head step. The slots are held.
- [ ] A head APPROVE moves the booking to `PENDING`, notifies the room managers, and writes `HEAD_APPROVED` history.
- [ ] A head REJECT moves the booking to `REJECTED` and frees the slots.
- [ ] A head RETURN is refused and the request is still `IN_REVIEW`.
- [ ] A manager cannot decide a `HEAD_REVIEW` booking.
- [ ] A `room-manager` can decide a `PENDING` booking.
- [ ] When the booker cancels during `HEAD_REVIEW`, the request is cancelled too.
- [ ] Implement, pass, commit.

### Task 3: queries and web
**Files:**
- `room-booking-queries.ts` (calendar includes HEAD_REVIEW; detail is readable by the request's assignee or delegate; `requestId` on detail)
- `/rooms/bookings/by-request/[requestId]/page.tsx`
- The booking page's head decision buttons, which call `/api/requests/{id}/decisions`
- Status labels and i18n
- Central cancel and resubmit routes refuse `room-booking`
- The resolver is wired into the booking API routes

Steps:
- [ ] Failing tests:
  - by-request redirects to the booking
  - the head sees เห็นชอบ/ไม่เห็นชอบ
  - `HEAD_REVIEW` reads รอหัวหน้าเห็นชอบ
  - the central routes refuse room-booking
- [ ] Implement, pass, commit.

### Verification
- `pnpm lint && pnpm typecheck && pnpm test`
- `DATABASE_URL=… pnpm test:integration`
- web build, then a Playwright smoke of the head → manager flow
- `git diff --check`
