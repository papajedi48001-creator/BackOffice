# ระบบการลา (leave) — design

Status: draft for review. Sub-project 3 of the HR scope. It builds on the command chain (PR #18) and staff profile records (PR #20).

## Goal

Every บุคลากร files leave (ใบลา) in the system. The ใบลา goes up the **สายบังคับบัญชา** for approval. The system counts days and keeps leave balances, so HR no longer tracks them by hand.

## Decisions agreed with wasan (2026-10-26)

1. Leave is its own **โมดูล**: the planned `leave` registry entry ("การลา") becomes live on the main page. It is not an HR section.
2. Round 1 has five leave types: ลาป่วย, ลากิจส่วนตัว, ลาพักผ่อน, ลาคลอดบุตร, ลาไปช่วยภริยาคลอดบุตร. Ordination, Hajj, study, following a spouse and the rest are a later round.
3. Entitlements are a table HR edits, by **ประเภทการจ้าง** and leave type, seeded with defaults from the regulation.
4. HR sets the final approval level per leave type. The default is ผู้อำนวยการ (`HOSPITAL`) for every type.
5. HR keeps a calendar of public holidays. Working-day leave skips weekends and holidays. Half days are allowed.
6. Opening balances come from a CSV that HR imports. HR can also download the current balances as a CSV in the same format, edit it and import it again.
7. An approved ใบลา can be cancelled in whole or in part through a ขอยกเลิกวันลา. The last approver of that ใบลา decides it, and approval returns the days.
8. Full details (type, reason, attachment) are seen only by the person, the approvers on that ใบลา and HR. Unit heads get a calendar of who is on leave, without type or reason.
9. The central request workflow carries the ใบลา (approach 1). Approvers can tick several ใบลา and approve them in one action.
10. HR sets a minimum number of working days per month (default 15, hospital-wide). A ใบลา that takes a month below it shows a warning to the person and to the approvers, but stays allowed.

## Vocabulary (added to CONTEXT.md)

- **ใบลา**: a **คำขอ** in module `leave` for one leave type over a date range. It carries the counted days.
- **ประเภทการลา**: a kind of leave with its counting rule, final approval level and attachment rule.
- **สิทธิ์การลา**: days per fiscal year, accumulation cap and minimum service for one ประเภทการจ้าง and one ประเภทการลา.
- **ปีงบประมาณ**: 1 October to 30 September. Fiscal year 2570 runs from 1 Oct 2569 to 30 Sep 2570.
- **วันลาสะสม**: unused ลาพักผ่อน carried into the next fiscal year, up to the cap.
- **ยอดวันลาคงเหลือ**: entitlement plus carried days, minus approved and pending days.
- **ขอยกเลิกวันลา**: a คำขอ to cancel all or some days of an approved ใบลา.
- **วันทำการขั้นต่ำต่อเดือน**: the working days a person should still work in a month after leave.

## Data — migration `0011_leave.sql` (additive)

- **`leave_type`**: `id`, `code` (unique), `name` (unique), `counting` (`WORKING_DAYS` | `CALENDAR_DAYS`), `approval_target` (`SECTION` | `DIVISION` | `HOSPITAL` | `NEAREST_HEAD`), `attachment_required_from_days` (DECIMAL NULL), `is_active`, `sort_order`, `created_at`, `updated_at`.
  - Seeded with fixed UUIDs:
    - `SICK` ลาป่วย: working days, attachment from 30 days.
    - `PERSONAL` ลากิจส่วนตัว: working days.
    - `VACATION` ลาพักผ่อน: working days.
    - `MATERNITY` ลาคลอดบุตร: calendar days.
    - `PATERNITY` ลาไปช่วยภริยาคลอดบุตร: working days.
  - Every seeded type uses approval target `HOSPITAL`.
- **`leave_entitlement`**: `employment_type_id` and `leave_type_id` (unique pair, both foreign keys), `days_per_year` DECIMAL(5,1), `first_year_days` DECIMAL NULL, `max_accumulated_days` DECIMAL NULL, `max_accumulated_days_after_10_years` DECIMAL NULL, `min_service_months` INT NOT NULL DEFAULT 0, `updated_at`.
  - Seed for `CIVIL_SERVANT`, from ระเบียบสำนักนายกรัฐมนตรีว่าด้วยการลาของข้าราชการ พ.ศ. 2555. HR checks these before go-live:
    - SICK: 60 days.
    - PERSONAL: 45 days, 15 in the first fiscal year of service.
    - VACATION: 10 days, accumulates to 20, or to 30 after 10 years of service, minimum service 6 months.
    - MATERNITY: 90 days.
    - PATERNITY: 15 days.
  - Other employment types have no rows. A person whose type has no row for a leave type cannot file that type, and the form says HR has not set the entitlement.
- **`leave_holiday`**: `holiday_date` DATE (primary key) and `name`.
- **`leave_setting`**: a single row holding `min_working_days_per_month` INT NOT NULL DEFAULT 15.
- **`leave_request`**:
  - `request_id` (primary key, foreign key to `request`), `person_id`, `leave_type_id`, `fiscal_year` INT.
  - `start_date` DATE, `end_date` DATE, `start_half` (`FULL` | `AFTERNOON`), `end_half` (`FULL` | `MORNING`), `days` DECIMAL(5,1).
  - `reason` VARCHAR(1000), `contact_during_leave` VARCHAR(500) NULL, `attachment_id` NULL (foreign key to `attachment`).
  - `created_at`, `updated_at`.
- **`leave_cancellation`**: `request_id` (primary key, foreign key to `request`, the cancellation's own คำขอ), `leave_request_id` (foreign key to `leave_request.request_id`), `start_date`, `end_date`, `start_half`, `end_half`, `days`, `created_at`.
- **`leave_opening_balance`**: `person_id`, `fiscal_year`, `leave_type_id` (unique triple), `carried_days` DECIMAL, `used_days` DECIMAL, `updated_at`. `used_days` is leave taken in that fiscal year before the system went live.

Status is never copied out of `request`. A ใบลา's state is the status of its คำขอ: IN_REVIEW, RETURNED, APPROVED, REJECTED or CANCELLED. The Drizzle schema, `migrate.ts`, `docs/integration/modules.md` and `restore-verify.sh` follow, as in earlier migrations.

## Rules (`packages/core/src/leave`)

### Counting

`countLeaveDays({ startDate, endDate, startHalf, endHalf, counting, holidays })` is a pure function.
- `WORKING_DAYS` skips Saturdays, Sundays and holidays.
- `CALENDAR_DAYS` counts every day.
- A half day takes 0.5 off the first or last day. A one-day ใบลา may be a morning or an afternoon only.
- A range that counts 0 days, such as a ใบลา only on holidays, is rejected with `NO_LEAVE_DAYS`.

### Fiscal year

A ใบลา must start and end in the same ปีงบประมาณ (`CROSSES_FISCAL_YEAR`). The person files two ใบลา instead.

### Balance

`leaveBalance(person, leaveType, fiscalYear)` returns `{ entitled, carried, used, pending, remaining }`.
- `entitled` is `days_per_year`. It is `first_year_days` when the fiscal year contains the person's **วันบรรจุ** and `first_year_days` is set.
- `carried`, for VACATION only:
  - When an opening-balance row exists, its `carried_days`.
  - Otherwise `min(max(remaining of the previous fiscal year, 0), cap − days_per_year)`. The cap is `max_accumulated_days_after_10_years` once the person has 10 years of service at the start of the fiscal year, and `max_accumulated_days` before that.
  - The previous year is counted only when the person has leave data or an opening row for it. Otherwise carried is 0.
- `used` is the opening row's `used_days`, plus the days of APPROVED ใบลา, minus the days of APPROVED ขอยกเลิกวันลา.
- `pending` is the days of IN_REVIEW and RETURNED ใบลา.
- Other types do not carry over.

### Submit checks

All checks run in one transaction, after locking the person row `FOR UPDATE`, so two submissions cannot spend the same days.
- The leave type is active and the person's employment type has an entitlement row (`NO_ENTITLEMENT`).
- Service since วันบรรจุ is at least `min_service_months` (`SERVICE_TOO_SHORT`). A person with no วันบรรจุ fails this check only when `min_service_months` is more than 0 (`APPOINTMENT_DATE_MISSING`).
- `days` is at most `remaining` (`INSUFFICIENT_BALANCE`).
- No overlap with an IN_REVIEW, RETURNED or APPROVED ใบลา of the same person, after subtracting approved cancellations (`OVERLAPS_EXISTING_LEAVE`). Half days on the same date do not overlap when one is morning and the other afternoon.
- An attachment is present when `days >= attachment_required_from_days` (`ATTACHMENT_REQUIRED`).
- PATERNITY needs no extra field in round 1. The 90-days-after-birth rule is the approver's call, written in the reason.

### Minimum working days warning

For each calendar month the ใบลา touches:

`working days in the month (weekdays minus holidays) − leave days in that month`

The leave days count every APPROVED, IN_REVIEW or RETURNED ใบลา of any type, including this one, after approved cancellations. When the result is below `min_working_days_per_month`, the result carries `warnings: [{ month: 'YYYY-MM', workingDays, minimum }]`. The form shows it before and after submit, and the approval list and the ใบลา page show it to approvers. It never blocks.

### Approval

The ใบลา is a คำขอ with `moduleCode: 'leave'`. The approver snapshot comes from the command chain, up to the leave type's `approval_target`, frozen at submit as today (**ภาพผู้อนุมัติ ณ เวลายื่น**). The existing direct-manager fallback stays.

### ขอยกเลิกวันลา

- It is allowed only on an APPROVED ใบลา.
- The range must lie inside the ใบลา and must not overlap an approved or pending cancellation of the same ใบลา.
- Its single approval step is the person who approved the last step of the ใบลา (or the delegator, when a ผู้แทน approved).
- Approval restores the days to the balance.
- Cancelling an IN_REVIEW or RETURNED ใบลา uses the existing request cancellation and needs no approval.

### Returned for edits

When a ใบลา is RETURNED, the person edits dates, half days, reason, contact and attachment, then resubmits. All submit checks run again, and the approver chain is resolved again, as today.

## Central workflow changes (`packages/core/src/workflow`)

These are small and backward compatible:
1. `submitRequest` and `resubmitRequest` accept an optional `target: CommandChainTarget`, passed through to `ApproverResolver.resolve`.
2. `submitRequest` accepts an optional `approvers` override, a fixed snapshot list. It is used for ขอยกเลิกวันลา.
3. The in-app notifications from `RequestService` and `ApprovalService` use the request's `moduleCode` instead of the constant `requests`. They point at `/leave/<requestId>` when the module is `leave`. Subjects stay generic and never include the reason.
4. `LeaveService` calls `RequestService` inside its own `database.transaction`. The nested transaction reuses the same connection, so the คำขอ, the steps, `leave_request`, the outbox and the audit events commit together.

Existing คำขอ keep `moduleCode` `requests` and behave exactly as before.

## Access

New permission `leave.manage`. It is granted to `hr-manager` and needs the HR data-owner assignment, like the other HR manager permissions.

| Action | Rule (server side) |
|---|---|
| File, edit when returned, cancel or ask to cancel own ใบลา | The session person, for themself only. The person id comes from the session. |
| See a ใบลา with reason and attachment | The person, anyone on its approval steps, a ผู้แทน acting for them, or `leave.manage` |
| Decide a ใบลา (single or bulk) | The existing approval rules: the current step's assignee or an active ผู้แทน, never the requestor |
| Team calendar | Heads of units see their units and all descendant units: dates and half days only, no type or reason |
| Leave types, entitlements, holidays, minimum days, balances CSV, all-leave list and export | `leave.manage`, hospital-wide |

Audit metadata records only the fields that changed, ids, dates, day counts and type codes. It never records a reason, a contact or attachment content. The CSV export goes through the existing **การส่งออกข้อมูล** with a stated reason.

## Screens — module "การลา" (`/leave`, live in `modules.ts`)

The sections are listed in this order. `/leave` opens the first section the viewer can see.
- **ใบลาของฉัน** (`/leave`, everyone):
  - A balance card per leave type: entitled, carried, used, pending and remaining.
  - The person's ใบลา for the current fiscal year, with status. A fiscal year picker shows earlier years.
  - Cancel while pending, ขอยกเลิกวันลา when approved.
- **ยื่นใบลา** (`/leave/new`, everyone):
  - Fields: type, dates, half days, reason, contact and attachment.
  - The day count, the remaining balance after this ใบลา and any minimum-days warning update as the person types, from a server preview endpoint.
- **ใบลา** (`/leave/[requestId]`): the details, the approval steps with decisions, any cancellations, and decide buttons for the current approver.
- **รออนุมัติ** (`/leave/approvals`, visible when the viewer has pending leave steps):
  - A table of pending ใบลา and ขอยกเลิกวันลา, each with a tick box and any warning.
  - "อนุมัติที่เลือก" approves each ticked item in its own transaction, then lists each result.
  - Not approving and returning are done one at a time on the ใบลา page, with a reason.
  - The module tile badge shows the count.
- **ปฏิทินหน่วยงาน** (`/leave/calendar`, unit heads): a month grid of people in the head's units and their leave days.
- **ใบลาทั้งหมด** (`/leave/all`, `leave.manage`): filter by unit, date range, type and status, and export a CSV.
- **ตั้งค่าการลา** (`/leave/settings`, `leave.manage`):
  - Leave types: rename, counting, approval target, attachment rule, active.
  - The entitlement grid.
  - The minimum working days per month.
- **วันหยุด** (`/leave/holidays`, `leave.manage`): list by year, add, rename or delete a holiday. Deleting a holiday does not recount existing ใบลา.
- **ยอดวันลา** (`/leave/balances`, `leave.manage`):
  - Download a CSV for a fiscal year with columns `employee_code, display_name, leave_type, carried_days, used_days`. It is pre-filled with the stored opening rows, or zeros.
  - Upload the edited file. Validation reports errors by row and column without echoing values, then applies.

Recorded days do not change when a holiday is added or removed later. The days are fixed at submit, like the approver snapshot.

## API

All bodies are validated with zod schemas in `packages/contracts/src/leave.ts`. Dates are `YYYY-MM-DD` calendar dates. The person id never comes from the body.

- `POST /api/leave/preview` returns days, balance after this ใบลา, warnings and check errors. Nothing is written.
- `POST /api/leave` files a ใบลา.
- `PUT /api/leave/[requestId]` edits and resubmits a RETURNED ใบลา.
- `POST /api/leave/[requestId]/cancellation` cancels a pending ใบลา.
- `POST /api/leave/[requestId]/cancel-days` files a ขอยกเลิกวันลา.
- `POST /api/leave/decisions` takes `{ requestIds: string[] }` (1–100) and returns per-id `{ ok }` or `{ error }`. It approves only. Single decisions with a reason use the existing `/api/requests/[requestId]/decisions`.
- `/api/leave/types`, `/api/leave/entitlements`, `/api/leave/holidays`, `/api/leave/settings`: HR maintenance.
- `GET /api/leave/balances.csv?fiscalYear=` and `POST /api/leave/balances`: the HR balance CSV.

The errors follow the HR routes:
- 401 when signed out.
- 403 without the right.
- 404 for an unknown ใบลา or one the viewer may not see, so its existence is not leaked.
- 400 `{ error: <code> }` for a rule failure, or `{ error: 'invalid_input', fields }` for a bad body.
- 409 for a duplicate type code or name, or a duplicate holiday date.

Messages are Thai.

## Notifications

All notifications go through the central inbox, `moduleCode: 'leave'`. They fire when:
- the ใบลา or ขอยกเลิกวันลา reaches a step (to its assignee);
- it is approved, not approved or returned (to the person);
- it is cancelled while pending (to the pending approver).

## Testing

- **Unit:**
  - `countLeaveDays`: weekends, holidays, half days, calendar days, one-day half, zero days.
  - Fiscal year of a date.
  - Balance: first year, carry cap at 20 and 30, opening rows, cancellations.
  - Overlap with half days, and the minimum-days warning across two months.
  - The contracts schemas.
- **Integration (MariaDB):**
  - Submit writes the คำขอ, steps, `leave_request`, outbox and audit in one transaction and rolls back together.
  - Concurrent submits cannot overspend.
  - The approval chain stops at the type's target.
  - Bulk approve returns per-item results and skips items the actor may not decide.
  - Edit and resubmit after return.
  - A cancellation request goes to the last approver and restores days.
  - The balances CSV round trip.
  - Readers outside the ใบลา get 404.
  - Calendar rows carry no type or reason.
- **Workflow regression:** existing request tests still pass with `moduleCode: 'requests'` notifications unchanged.
- **Web:**
  - Route tests for 401, 403, 400 and 200 on every route.
  - Page tests: the form preview, bulk tick and approve, the calendar without types, and HR sections hidden from staff.
  - The `leave` module live with its sections.

## Out of scope

- Leave types beyond the five, and per-shift counting from rosters (comes with shift clock-in/out).
- Printing the official leave form (แบบใบลา).
- Leave across fiscal years in one ใบลา.
- Recounting old ใบลา after holiday changes.
- Email or LINE notifications.
- Approving a ขอยกเลิกวันลา in bulk with reasons.
