# พิจารณาคำขอของตนเองในบทบาทผู้ดูแลระบบ/ผู้จัดการ (self-approval) — design

Request: "ผู้ดูแลระบบหรือผู้จัดการระบบสามารถเห็นและอนุมัติคำขอของ username เดียวกันที่เป็นบทบาทของผู้ใช้งานทั่วไปได้". Superpowers skills were followed by hand (brainstorming defaults and safeguards were set by the coordinator; the user may change them).

## Behaviour

- `canDecideOwnRequest(activeRole)` (`packages/core/src/access/active-role.ts`) is true only for the `admin` and `manager` tiers (see the active-role design, 2026-11-04). บุคลากรทั่วไป (`employee`) or no tier: false.
- In those tiers a person sees their own requests in the approval queues and may approve, reject or return them **only where the tier could already decide the same request for someone else**: they are the pending step's assignee or its active ผู้แทน (central workflow), or they hold `room.booking.decide` over the room's unit (room booking). No new routing: the command chain still skips the requester when the request is filed, so a head's own ใบลา still goes to the head above.
- Safeguards (defaults, user may change):
  - A reason is required for **every** decision on one's own request, approval included (`REASON_REQUIRED`). It is stored like other decision reasons (`approval_decision.reason`, `room_booking_history.reason`) and never in audit metadata, logs, notifications or outbox payloads.
  - The audit event of the decision (`workflow.request.decided`, `room_booking.approved` / `.rejected`) carries metadata `selfApproval: true` (allow-listed in `redactAuditMetadata`); `audit_event.actor_role` already records the tier.
  - Admin list "อนุมัติคำขอของตนเอง" at `/access/self-approvals` (admin tier only, server-checked; nav item `isAdmin`): when, who, tier, request reference, decision. No reason shown.
  - Bulk leave approval does not bypass the reason rule: an own ใบลา in the batch fails with `REASON_REQUIRED` and must be decided on its own page.
- In the employee tier nothing changes: `CONFLICT_OF_INTEREST` stays (workflow and room booking), own requests stay out of approval queues.
- UI marker "คำขอของคุณเอง" (`OwnRequestMarker`) in approval lists and detail pages when the viewer may decide their own request; the decision dialogs then require a reason and show a notice.

## Places that blocked self-approval or hid own requests (inventory)

| Place | Before | After |
| --- | --- | --- |
| `packages/core/src/workflow/approval-service.ts` `decideRequest` | `requestor === actor` → `CONFLICT_OF_INTEREST` | allowed when `actorRole` is admin/manager (+ reason, `selfApproval` audit tag); new optional `actorRole` on `decideRequestInputSchema` |
| `apps/web/src/app/api/requests/[requestId]/decisions/route.ts` | no tier passed | passes `session.activeRole` |
| `packages/core/src/rooms/room-booking-service.ts` `decide` | booker → `CONFLICT_OF_INTEREST` | allowed for admin/manager tier with reason; history keeps the reason; audit tag |
| `packages/core/src/rooms/room-booking-queries.ts` `pendingForApprover` | `b.booker_person_id <> ?` | own bookings included for admin/manager tier, flagged `ownRequest` |
| `apps/web/src/app/(app)/rooms/booking-state.ts` `bookingViewState` | `!viewerIsBooker` | `viewerMayDecideOwn` opens it |
| `packages/core/src/leave/leave-queries.ts` `pendingIds`, `detail.canDecide` | `r.requestor_person_id <> ?`, `!self` | `includeOwn` option / tier check, `ownRequest` flag |
| `packages/core/src/official-travel/travel-queries.ts` `pendingIds`, member `canDecide` | same as leave | same as leave |
| `packages/core/src/workflow/request-inbox.ts` `listPendingApprovals` | did not hide own, no flag | `ownRequest` flag for the marker |
| `apps/web/src/lib/request-access.ts` `canApproveRequest` | assignee only | own request only with admin/manager tier |
| `apps/web/src/lib/actor.ts` | `RoomActor` without tier | carries `activeRole` |
| `apps/web/src/lib/modules.ts` badges | own excluded | counts follow the same rule |

Left unchanged on purpose:

- `packages/core/src/hr/command-chain.ts`: the requester is never put on their own chain. Changing it would route an employee-tier request to its own requester; out of scope.
- `room-booking-service.submit` / `room-request-hook.ts` / `inventory/receipt-service.ts`: only filter the actor out of *notification* recipients (no one needs a notice about their own filing). An approver who books while their roles are in effect is already approved outright.
- `fleet` dispatch: fleet managers dispatch, they do not approve; head approval goes through `ApprovalService`.
- `inventory` opening certification has no self block today.
- `delegation-service` `SELF_DELEGATION`, HR `SELF_MANAGER`, `PROTECTED_ACCOUNT`: not approvals.

## Tests

Core unit: `active-role.test.ts` (`canDecideOwnRequest`), `approval-service.test.ts` (employee/no tier refused; admin/manager allowed with reason, `selfApproval` tag, reason not in audit/outbox; reason required), `room-booking-service.test.ts` (same for bookings), `self-approval-queries.test.ts`. Web: decisions route passes the tier, `request-access.test.ts`, `booking-state.test.ts`, leave/travel approvals pages, `/access/self-approvals` page (admin only). Integration (`DATABASE_URL`): `request-inbox.integration.test.ts` expects `ownRequest: false`; the existing `leave-lifecycle` bulk test still expects `CONFLICT_OF_INTEREST` for an own ใบลา (no tier passed).

## Out of scope

Configurable safeguards per module; notifying other admins when someone self-approves.
