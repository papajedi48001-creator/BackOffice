# Room booking direct approval Implementation Plan

**Goal:** remove the head step; room managers approve directly, including bookings already waiting on the head.
**Spec:** `docs/superpowers/specs/2026-11-04-room-booking-direct-approval-design.md`

### Task 1: core and web
- [x] Failing tests: `room-booking-service.test.ts` (submit is PENDING, approvers notified, no คำขอ; no-unit booker accepted; manager decides HEAD_REVIEW and its คำขอ is cancelled), integration (`filedWithHead` legacy bookings, approvals queue includes them), `booking-state.test.ts` (canDecide on HEAD_REVIEW).
- [x] `RoomBookingService.submit` creates PENDING and notifies approvers; `decide` accepts HEAD_REVIEW and calls `cancelHeadRequest`; drop `openHeadRequest` and the resolver argument.
- [x] `RoomBookingQueries.pendingForApprover` includes HEAD_REVIEW; `bookingViewState.canDecide` includes HEAD_REVIEW.
- [x] Verify: `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:integration` on a fresh DB, `pnpm --filter @backoffice/web build`, `git diff --check`.
