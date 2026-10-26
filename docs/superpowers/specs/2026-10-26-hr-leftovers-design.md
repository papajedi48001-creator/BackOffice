# HR leftovers: leave and official travel fixes

Status: approved by wasan ("ทำที่เหลือที่ทำได้", 2026-10-26). Scanning in and out of shifts is postponed.

This round closes gaps left by the leave and ไปราชการ modules. It adds no table.

## 1. Resubmit a returned ขอยกเลิกวันลา

Today an approver can return a ขอยกเลิกวันลา, but the person can only cancel it. The returned range also still blocks a new ขอยกเลิกวันลา on the same days.

- The person who filed it can edit the range and the reason and send it again while it is RETURNED.
- The checks are the same as filing: the ใบลา must still be APPROVED, the range must lie inside it, and it must not overlap another pending or approved cancellation of the same ใบลา (this one excluded).
- It goes back to the same approver as before: the person who approved the last step of the ใบลา.
- The `leave_cancellation` row is updated in the same transaction as the workflow change and the audit event `leave.cancel_days.resubmitted`.
- `RequestService.resubmitRequest` accepts `options.approvers`, a fixed list, as `submitRequest` already does.
- API: `PUT /api/leave/<id>` takes either body. A body with `leaveTypeId` edits a ใบลา; a body without it edits a ขอยกเลิกวันลา. Each service method answers NOT_FOUND when the id is the other kind.
- Page: a returned ขอยกเลิกวันลา shows the cancel-days form filled in, titled "แก้ไขคำขอยกเลิกวันลาที่ถูกส่งกลับ".

## 2. Balance CSV follows gender

The ยอดยกมา export lists only leave types the person may take. A type limited to one gender is left out for a person of the other gender, using the same rule as filing (recorded gender, else the name prefix; unknown gender sees every type).

## 3. ไปราชการ review leftovers

- **Calendar half days.** A date with a leave half and a trip half shows both: one entry per kind, each with its own part. The calendar cell shows both labels.
- **HR status filter.** `/travel/all` filters by trip status in SQL before the 1000-row cap, so a filter never hides matching trips beyond the cap.
- **Overlap before balance.** Filing leave over a trip answers OVERLAPS_OFFICIAL_TRAVEL even when the balance is also short, because the overlap is the real reason.
- **Unchanged:** resubmit keeps the คำขอ's organisation snapshot, as leave does. A person who moved unit cancels and files again.
