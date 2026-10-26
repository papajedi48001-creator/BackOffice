# ไปราชการ (official travel) — design

Status: approved by wasan on 2026-10-26 ("โอเค"). This is sub-project 4 of the HR scope. It builds on the command chain (PR #18), the staff profile (PR #20) and the leave module (PR #22).

## Goal

A บุคลากร asks permission in the system to travel on official duty: a meeting, training, a study visit or a field visit. The request goes up the **สายบังคับบัญชา** to ผู้อำนวยการ. The approved trip shows on the unit calendar next to leave, so heads can see who is away.

## Decisions agreed with wasan (2026-10-26)

1. **Module.** ไปราชการ is its own โมดูล, `official-travel`, labelled "ไปราชการ", in the งานของฉัน group. Its sections are:
   - ไปราชการของฉัน
   - ขออนุมัติไปราชการ
   - อนุมัติไปราชการ (with a count)
   - ทั้งหมด (HR only)
2. **The request (คำขอไปราชการ)** records:
   - Subject.
   - Organiser.
   - Place and province.
   - Start and end dates, with เช้า/บ่าย half days as in leave.
   - Travel type: ในจังหวัด / ต่างจังหวัด / ต่างประเทศ.
   - Vehicle: รถราชการ / รถส่วนตัว / รถโดยสารสาธารณะ / เครื่องบิน / ไปกับผู้จัด.
   - Estimated cost by item (เบี้ยเลี้ยง ที่พัก พาหนะ ค่าลงทะเบียน), and where the money comes from: เงินบำรุง / งบผู้จัด / ไม่เบิก.
   - One PDF attachment, such as the invitation letter (หนังสือเชิญ).
3. **Travelling together.** One request can list several บุคลากร. The person who files it is the หัวหน้าคณะ. Each person on the list is approved through their own สายบังคับบัญชา. The trip is approved when every person is approved, and anyone rejected comes off the list.
4. **Approval** goes up to ผู้อำนวยการ (`HOSPITAL`) by default. HR can change the final level per travel type, like leave.
5. **Dates.** A trip cannot overlap the same person's ใบลา or another of their trips. Trip days do not count against leave balances.
6. **Visibility.** Unit heads see trips on the leave calendar, as "ไปราชการ" plus the place. Costs and the attachment are seen only by the travellers, their approvers and HR.
7. **Notifications** use the same bell, for example `[ไปราชการ] > [อนุมัติ > ผู้อำนวยการโรงพยาบาล]`.
8. **Not in round 1:**
   - The report after the trip.
   - Claiming expenses back.
   - Booking a รถราชการ in the fleet module, which is not built yet.
   - Printing the official form.

## Vocabulary (added to CONTEXT.md)

- **คำขอไปราชการ**: one trip on official duty: subject, place, dates, travel type, vehicle, estimated cost and the people going. It is not itself a **คำขอ**: each person going has their own.
- **ผู้ร่วมเดินทาง**: one person on a คำขอไปราชการ. Each has a **คำขอ** in module `official-travel`, with that person as requestor, so it goes up that person's own สายบังคับบัญชา.
- **หัวหน้าคณะ**: the person who filed the คำขอไปราชการ. They always travel too, and they are the one who edits, resubmits or cancels it.
- **ประเภทการเดินทาง**: ในจังหวัด, ต่างจังหวัด or ต่างประเทศ. HR sets the final approval level per type.

## Data — migration `0013_official_travel.sql` (additive)

- **`official_travel_type`**: `code` (primary key: `IN_PROVINCE` | `OUT_OF_PROVINCE` | `ABROAD`), `name`, `approval_target` (`SECTION` | `DIVISION` | `HOSPITAL` | `NEAREST_HEAD`), `sort_order`. Seeded ในจังหวัด, ต่างจังหวัด, ต่างประเทศ, all `HOSPITAL`.
- **`official_travel`**:
  - `id` CHAR(36) primary key, `leader_person_id` (foreign key to `person`).
  - `subject` VARCHAR(300), `organiser` VARCHAR(300), `place` VARCHAR(300), `province` VARCHAR(100).
  - `travel_type` (foreign key to `official_travel_type.code`), `vehicle` (`GOVERNMENT_CAR` | `PRIVATE_CAR` | `PUBLIC_TRANSPORT` | `AIRPLANE` | `WITH_ORGANISER`).
  - `start_date`, `end_date`, `start_half` (`FULL` | `AFTERNOON`), `end_half` (`FULL` | `MORNING`), `days` DECIMAL(5,1). Trip days are calendar days: a weekend away counts.
  - `funding_source` (`HOSPITAL_FUND` เงินบำรุง | `ORGANISER` งบผู้จัด | `NONE` ไม่เบิก).
  - `cost_allowance`, `cost_lodging`, `cost_transport`, `cost_registration`: DECIMAL(12,2) NOT NULL DEFAULT 0, estimates per person-trip as filed.
  - `attachment_id` NULL (foreign key to `attachment`), `created_at`, `updated_at`.
- **`official_travel_member`**: `request_id` (primary key, foreign key to `request`), `travel_id` (foreign key to `official_travel`), `person_id` (foreign key to `person`), unique (`travel_id`, `person_id`), `created_at`.

## Rules

1. **Filing.** The หัวหน้าคณะ is the session's person and is always on the list. 1 to 30 ผู้ร่วมเดินทาง, no person twice. Every check below runs for every person before anything is written; if one fails, nothing is filed and the error names that person.
2. **Each person** needs a current unit (open employment record) and an approver on their chain up to the type's final level. Otherwise `NO_ORGANIZATION` or `NO_APPROVER`.
3. **No overlap.** A person's trip half-days cannot overlap their active ใบลา (IN_REVIEW, RETURNED or APPROVED, less approved ขอยกเลิกวันลา) or their other active trips: `OVERLAPS_LEAVE` / `OVERLAPS_TRAVEL`. The leave form also refuses a ใบลา that overlaps an active trip, with `OVERLAPS_OFFICIAL_TRAVEL`. One person's filings are serialised by locking their `person` row, as leave does.
4. **Dates** follow the leave range rules: end not before start, and one day cannot be both afternoon-only and morning-only. A trip may cross the fiscal year.
5. **Approval.** Each person's คำขอ goes through the central workflow, so each approver sees and decides it like any other, and อนุมัติ, ไม่อนุมัติ and ส่งกลับแก้ไข all work.
6. **Trip status** comes from its people's คำขอ, in this order:
   - any RETURNED → ส่งกลับแก้ไข (the หัวหน้าคณะ edits and resubmits);
   - any IN_REVIEW → รอพิจารณา;
   - all CANCELLED → ยกเลิก;
   - every one REJECTED or CANCELLED → ไม่อนุมัติ;
   - otherwise อนุมัติ. A rejected person is shown struck through and does not go; the rest do.
7. **Resubmit.** Only the หัวหน้าคณะ, only while some person is RETURNED. They may change the trip details but not the people. The overlap checks run again for every person still going, and each RETURNED คำขอ goes up a freshly resolved chain. People already approved stay approved.
8. **Cancel.** The หัวหน้าคณะ cancels the whole trip while any คำขอ is IN_REVIEW or RETURNED; every such คำขอ is cancelled with the reason given. An approved trip is not cancelled in round 1.
9. Audit, the workflow change and the outbox notice are written in one transaction. The trip's audit records the หัวหน้าคณะ as actor and carries no costs, subject or reason.

## Access

New permission `travel.manage`, granted to `hr-manager`, needing the HR data-owner assignment like `leave.manage`.

| Action | Who |
|---|---|
| File a คำขอไปราชการ | Any signed-in person with a person record |
| See a trip in full (costs, organiser, attachment) | Its ผู้ร่วมเดินทาง, anyone on any of its approval steps, an active ผู้แทน of a pending step, or `travel.manage` |
| Decide one person's คำขอ | The assignee of its current step or their active ผู้แทน (central workflow rules) |
| Edit, resubmit or cancel | The หัวหน้าคณะ only |
| Trip on the team calendar | Heads of the person's unit or a unit above it; they see only "ไปราชการ" and the place |
| ไปราชการทั้งหมด and ตั้งค่า | `travel.manage`, hospital-wide |

## Screens (`/travel`)

- **ไปราชการของฉัน** (`/travel/mine`): trips where I am a ผู้ร่วมเดินทาง, newest first: subject, place, dates, days, trip status.
- **ขออนุมัติไปราชการ** (`/travel/new`): the form above. People are added by searching the staff directory by name; the หัวหน้าคณะ is fixed at the top. Costs are four number fields and the total shows as you type.
- **รายละเอียด** (`/travel/<travelId>`): trip details, each person with their own status and steps, and decide buttons on the people the viewer may decide. The หัวหน้าคณะ gets แก้ไขและส่งใหม่ and ยกเลิก when the rules allow.
- **อนุมัติไปราชการ** (`/travel/approvals`), with a count: one row per person waiting on me, grouped by trip.
- **ไปราชการทั้งหมด** (`/travel/all`, `travel.manage`): filter by date range, travel type and status.
- **ตั้งค่า** (`/travel/settings`, `travel.manage`): final approval level for each ประเภทการเดินทาง.
- **ปฏิทินการลา** (`/leave/calendar`) shows trips in their own colour, labelled "ไปราชการ · <place>".
- **คำขอ** inbox and the bell open the trip page for a travel คำขอ.

## API

- `POST /api/travel` file; `GET /api/travel/<travelId>` detail; `PUT /api/travel/<travelId>` edit and resubmit; `POST /api/travel/<travelId>/cancellation` (reason in the body).
- Decisions use the central `POST /api/requests/<requestId>/decisions`, as leave does. The generic submit, resubmit and cancel routes refuse an `official-travel` คำขอ with `travel_request_route`.
- `GET /api/travel/people?q=` staff search for the form: id, display name and unit only.
- `PUT /api/travel/types/<code>` `{ approvalTarget }` (`travel.manage`).
- Errors: 401 signed out, 403 without `travel.manage` on HR routes, 404 `NOT_FOUND`, 409 `NOT_PENDING`, 400 `{ error: code, personId? }`.

## Notifications

The central workflow already sends: "มีคำขอรอพิจารณา" to the next approver, and "<action> > <ตำแหน่ง>" to the person whose คำขอ was decided. A notice for a travel คำขอ is filed under ไปราชการ and opens `/travel/<travelId>`. Nothing about costs or reasons goes in a notice or outbox payload.

## Round 1 limits

- The attachment column is in place but upload stays off until object storage is configured, as with the ใบรับรองแพทย์ in leave.
