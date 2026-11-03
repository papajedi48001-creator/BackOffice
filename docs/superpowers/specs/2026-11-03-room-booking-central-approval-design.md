# Room booking through the central approval chain

Status: agreed 2026-11-03. wasan: "ใช้ระบบการอนุมัติของระบบหลัก" and "manager ของ module มีหน้าที่อนุมัติคำขอ".

## Request

wasan (2026-11-03): "ใช้ระบบการอนุมัติของระบบหลัก". Room bookings should be approved through the main system's approval process (คำขอ / สายอนุมัติ). That process is already used by ใบลา, ไปราชการ and the หัวหน้าเห็นชอบ step of ใบขอใช้รถ.

## Options put to wasan

1. **หัวหน้า+ธุรการ (recommended).**
   - The booker's nearest head เห็นชอบ the booking in คำขอ.
   - ผู้อนุมัติการจองห้อง then approves it in the room module.
   - This mirrors ใบขอใช้รถ, where หัวหน้าเห็นชอบ comes before จัดรถ.
2. **เฉพาะหัวหน้า.** The head's approval in คำขอ is final. The ผู้อนุมัติการจองห้อง role no longer decides; it can still cancel.
3. **ธุรการเดิม.** ผู้อนุมัติการจองห้อง stays the only approver. The booking appears in the คำขอ inbox and decides through it.

## Decision

Option 1, with one change: the final approver is the **ผู้จัดการโมดูล** of จองห้องประชุม, which is the `room-manager` role.
- `room-manager` gains `room.booking.decide`.
- The separate `room-booking-approver` role keeps working for people who already hold it, but it is no longer needed.
- If wasan later wants the module manager to be the only approver, the head step can be dropped.

## Design

### Data
- Add a nullable `request_id` column to `room_booking` (additive migration). It references `request.id`.
- Bookings that were submitted before this change have `request_id` NULL and keep the old one-step flow.

### Submitting a booking
`RoomBookingService.submit` does all of the following in the same transaction:
- Creates a central คำขอ with `moduleCode: 'room-booking'` and `target: 'NEAREST_HEAD'` through `RequestService.submitRequest`. The head is frozen at submit time (ภาพผู้อนุมัติ ณ เวลายื่น).
- Stores the request id on the booking.
- Holds the slots exactly as today: first come, first served.
- If no head can be resolved, the booking is refused with `NO_APPROVER` and a Thai message, the same way fleet handles it.

### Notices
- The head is notified by the central workflow.
- The room managers are notified when the head approves, through `getApprovalWatchers` for `room-booking`. Fleet uses the same hook.

### Statuses shown
- The booking gets a new status, `HEAD_REVIEW`.
- `ApprovalService` calls a new optional `WorkflowRepository.onRequestDecided` hook inside the decision transaction.
- For `room-booking`, the hook does three things:
  - A head APPROVE moves the booking to `PENDING`.
  - A head REJECT moves the booking to `REJECTED`.
  - It refuses RETURN, which rolls the decision back.
- So the workflow transition and the booking status change are written in one transaction.

| Booking | Request | Shown as |
|---|---|---|
| HEAD_REVIEW (new) | IN_REVIEW | รอหัวหน้าเห็นชอบ |
| PENDING | APPROVED (or no request, for older bookings) | รอผู้จัดการอนุมัติ |
| REJECTED | REJECTED (head) or any (manager) | ไม่อนุมัติ |
| APPROVED, CANCELLED | any | as today |

### Slot hold
A booking holds its slots while it is `HEAD_REVIEW`, `PENDING` or `APPROVED`.

### Decisions
- **Head step:** the head decides on the booking page. It calls the existing `/api/requests/{id}/decisions`, so the central rules apply: delegation, no self-approval, audit and outbox in one transaction.
- **Head step options:** only APPROVE and REJECT are offered. The route refuses RETURN for `room-booking`, because a booking cannot be edited after it is submitted (Q11).
- **Final step:** `RoomBookingService.decide` still accepts `PENDING` only, so a `HEAD_REVIEW` booking cannot be decided by a manager.

### Cancelling
- When the booker cancels, `RoomBookingService.cancel` also cancels the request if it is `IN_REVIEW`, in the same transaction.
- `/api/requests/{id}/cancellation` and `/api/requests/{id}/resubmission` refuse `room-booking`. Cancellation goes through `/api/rooms`, as fleet does.

### Links
- `notificationTarget('room-booking', id)` points to `/rooms/bookings/by-request/{id}`.
- That route redirects to the booking page.
- The คำขอ inbox and the room badge use the same link.

### Who may open a booking
The head assigned to the request (or their delegate) may open the booking page, in addition to the booker and the room approvers.

## Not changing
- Conflict rules, the 07:00–20:00 window and add-ons stay as they are.
- The month dashboard and calendar stay as they are; they only gain the new status labels.
