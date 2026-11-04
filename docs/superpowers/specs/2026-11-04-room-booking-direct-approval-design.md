# Room bookings go straight to the room managers

Date: 2026-11-04. Supersedes the head step in `2026-11-03-room-booking-central-approval-design.md`.

## Decision
wasan: "เปลี่ยนกฎการจองห้องประชุม ไม่ต้องรอหัวหน้าเห็นชอบ ให้ผู้รับผิดชอบอนุมัติได้เลย".

## Behaviour
- Submitting a booking creates it as `PENDING` with no คำขอ. The booker is told "ยื่นจองห้องแล้ว รออนุมัติ"; every holder of `room.booking.decide` in the room's unit (ผู้จัดการห้องประชุม, ผู้อนุมัติการจองห้อง), except the booker, is told "มีการจองห้องรออนุมัติ".
- A booker with no unit on record may book again (the head lookup needed one).
- Bookings filed on 2026-11-03/04 are still `HEAD_REVIEW` with an open คำขอ. They appear in the approvals queue, and a room manager may approve or reject them directly; in the same transaction their คำขอ is cancelled so it leaves the head's inbox. If the head acts first, the existing hook still moves the booking to `PENDING`.
- Booker cancel of a `HEAD_REVIEW` booking still cancels its คำขอ.
- No migration: `room_booking.request_id` and the `HEAD_REVIEW` status stay for those bookings.

## Addendum: managers and admins book outright
wasan: "manager/admin กดจองห้องประชุมแล้วให้ถือเป็นการจองสำเร็จ".
- When the booker may approve bookings of that room (`room.booking.decide` in the room's owner unit: ผู้จัดการห้องประชุม or ผู้อนุมัติการจองห้อง, or an unscoped `admin`), `submit` creates the booking as `APPROVED` with `decided_by` = the booker.
- History and audit record SUBMITTED then APPROVED in the same transaction. Only the booker is notified ("จองห้องสำเร็จ (ref)"); no approver notices.
- Conflict checks are unchanged: a taken slot is still refused.
