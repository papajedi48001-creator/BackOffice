# ยานพาหนะ (fleet) — design

Status: draft for wasan's review. Agreed section by section in the thread "พัฒนาระบบจองรถยนต์" on 2026-10-27. Builds on the command chain (PR #18), the central request workflow and ไปราชการ (PRs #26–#31).

## Goal

บุคลากร ask for a รถราชการ in the system instead of on paper. Their head agrees through the สายบังคับบัญชา, then the หัวหน้าหมวดยานพาหนะ assigns a car and a driver from one dashboard that is both an overview of the fleet and the place where work is taken in and handed out. Drivers log departure and return with the odometer reading, which replaces the paper log book.

## Decisions agreed with wasan (2026-10-27)

| # | Topic | Decision |
|---|---|---|
| 1 | Who picks the car | The requester gives destination, times and passengers only. งานยานพาหนะ assigns the car and driver. |
| 2 | Approval | Two stages: the requester's head agrees through the central workflow (`NEAREST_HEAD`), then the หัวหน้าหมวดยานพาหนะ assigns a car or declines. |
| 3 | ไปราชการ | An approved คำขอไปราชการ with vehicle รถราชการ has a "ขอใช้รถ" button. It prefills the form and skips the head stage, because the trip itself was already approved up the chain. Other uses (documents, patient transfer between units) file a normal ใบขอใช้รถ. |
| 4 | Drivers | Drivers are บุคลากร in the staff registry, added to a driver list by the หัวหน้าหมวด. They are notified of their work and see their own schedule. The module's first page is the หัวหน้าหมวด's dashboard and dispatch centre. |
| 5 | Trip log | The driver taps ออกเดินทาง and กลับถึง with the odometer reading at each. |
| 6 | Shared rides | The หัวหน้าหมวด creates a เที่ยวรถ (car + driver + time range) and can attach several ใบขอใช้รถ to it. The odometer is logged per เที่ยวรถ. Seat count is recorded on the car for the หัวหน้าหมวด's reference only; the system does not check passengers against it. |
| 7 | Rules | File at most 90 days ahead, never in the past, no minimum notice. No editing after filing: cancel and file again (a head's ส่งกลับแก้ไข is the one exception). Cancel with a reason until the car leaves. No car free → ไม่จัดรถ with a reason, the ใบ closes and the requester is told. Calendar visibility below. The หัวหน้าหมวด maintains the car register and the driver list. |
| 8 | Approach | Head stage on the central คำขอ (reuses chain, delegation, approvals inbox, bell); dispatch, trips and the log are the module's own tables. |

**Not in this round:** fuel log, maintenance / tax / insurance schedule, printing the official car-use form (แบบ 3), monthly usage report.

## Vocabulary (added to CONTEXT.md, section "ยานพาหนะ")

- **รถราชการ**: a hospital vehicle that can be assigned to work: registration, make/model, kind, seats and status (ใช้งาน / ซ่อม / ปลดระวาง). _Avoid_: vehicle, รถ (alone, when the register is meant).
- **พนักงานขับรถ**: a บุคลากร on the driver list who can be assigned to a เที่ยวรถ. _Avoid_: driver, คนขับ.
- **ใบขอใช้รถ**: one request to use a hospital car for one piece of work: mission, destination, out and back times, passengers. Not itself a **คำขอ**; a normal one carries a คำขอ for the head stage. _Avoid_: booking, vehicle request, คำขอใช้รถ.
- **เที่ยวรถ**: one car with one พนักงานขับรถ over one time range, carrying one or more ใบขอใช้รถ. The odometer is logged per เที่ยวรถ. _Avoid_: trip (ไปราชการ already uses "trip"), job.
- **หัวหน้าหมวดยานพาหนะ**: the role (`fleet-manager`) that keeps the car register and driver list and dispatches. _Avoid_: fleet admin, ผู้จัดการรถ.
- **การจัดรถ**: attaching a ใบขอใช้รถ to a เที่ยวรถ, new or existing. _Avoid_: assign, dispatch (in UI text).

## Data — migration `0015_fleet.sql` (additive)

0010 was reserved for this module but is now taken (0010–0014 are HR, leave and travel). This module takes the next free number, 0015, and adds itself to the table in `docs/integration/modules.md`.

- **`fleet_vehicle`**: `id`, `registration` VARCHAR(20) unique, `make_model` VARCHAR(120), `kind` (`SEDAN` | `PICKUP` | `VAN` | `AMBULANCE` | `OTHER`), `seats` SMALLINT, `status` (`ACTIVE` | `IN_REPAIR` | `RETIRED`), `note` VARCHAR(300), `created_at`, `updated_at`.
- **`fleet_driver`**: `person_id` primary key (foreign key to `person`), `phone` VARCHAR(32) (work phone shown to requesters; not the profile phone), `is_active`, `created_at`, `updated_at`.
- **`fleet_request`** (ใบขอใช้รถ):
  - `id`, `reference` (e.g. `VR-2569-0001`, Buddhist year, sequence per fiscal year), `requester_person_id`, `organization_id` (requester's unit at filing).
  - `request_id` NULL unique (foreign key to `request`; the head-stage คำขอ; NULL when filed from ไปราชการ).
  - `official_travel_id` NULL (foreign key to `official_travel`).
  - `purpose` VARCHAR(300), `destination` VARCHAR(300), `province` VARCHAR(100), `depart_at`, `return_at` (UTC DATETIME), `passenger_count` SMALLINT, `passenger_names` VARCHAR(1000) (free text; may include people outside the registry, e.g. patients).
  - `dispatch_status` (`WAITING` | `ASSIGNED` | `DECLINED` | `CANCELLED`), `trip_id` NULL (foreign key to `fleet_trip`).
  - `created_at`, `updated_at`.
- **`fleet_trip`** (เที่ยวรถ): `id`, `vehicle_id`, `driver_person_id`, `starts_at`, `ends_at` (UTC), `status` (`PLANNED` | `DEPARTED` | `RETURNED` | `CANCELLED`), `odometer_out` INT NULL, `odometer_in` INT NULL, `departed_at` NULL, `returned_at` NULL, `created_by_person_id`, `created_at`, `updated_at`. Index on (`vehicle_id`, `starts_at`) and (`driver_person_id`, `starts_at`).
- **`fleet_request_history`**: `id`, `fleet_request_id`, `action`, `actor_person_id`, `reason` VARCHAR(500) NULL, `created_at`. Reasons live here only.

Drizzle schema `packages/db/src/schema/fleet.ts`; migration listed in `migrate.ts`; new tables added to `infra/backup/restore-verify.test.sh`.

## Status of a ใบขอใช้รถ

Derived in one query, in this order (as ไปราชการ derives trip status):

1. head คำขอ IN_REVIEW → **รอหัวหน้าเห็นชอบ**; RETURNED → **ส่งกลับแก้ไข**; REJECTED → **ไม่เห็นชอบ**; CANCELLED → **ยกเลิก**.
2. otherwise (head คำขอ APPROVED, or filed from ไปราชการ), by `dispatch_status`: WAITING → **รอจัดรถ**; DECLINED → **ไม่จัดรถ**; CANCELLED → **ยกเลิก**; ASSIGNED → by the เที่ยวรถ: PLANNED → **จัดรถแล้ว**, DEPARTED → **ออกเดินทาง**, RETURNED → **เสร็จสิ้น**.

`dispatch_status` starts WAITING at filing, so a ใบ enters the dispatch queue the moment its head คำขอ becomes APPROVED, with no extra write.

## Rules

1. **Filing.** Anyone signed in with a person record and a current unit. `depart_at` < `return_at`; `depart_at` ≥ now; `depart_at` ≤ today + 90 days (Asia/Bangkok); a ใบ spans at most 30 days; 1–99 passengers; times on 15-minute steps. Normal ใบ: a คำขอ in module `fleet` with target `NEAREST_HEAD`; no approver → `NO_APPROVER`, no unit → `NO_ORGANIZATION`.
2. **From ไปราชการ.** Only a ผู้ร่วมเดินทาง of an approved คำขอไปราชการ whose vehicle is `GOVERNMENT_CAR`, and only while the trip has not ended. Destination, province, purpose (the trip subject) and passengers (approved members' names) are prefilled and editable; dates default to the trip's. No head คำขอ is created. At most one active (not DECLINED/CANCELLED) ใบ per trip: `TRAVEL_ALREADY_HAS_CAR`.
3. **Head stage.** The central workflow decides it: เห็นชอบ (APPROVE), ไม่เห็นชอบ (REJECT), ส่งกลับแก้ไข (RETURN). On RETURNED the requester may edit the ใบ and resubmit through the fleet route; the time rules run again.
4. **Cancel.** The requester, with a reason, while the status is รอหัวหน้าเห็นชอบ, ส่งกลับแก้ไข, รอจัดรถ or จัดรถแล้ว. The head คำขอ (if still pending) is cancelled through the central service. A cancelled ใบ leaves its เที่ยวรถ; a เที่ยวรถ left with no ใบ is cancelled too, and its driver is told.
5. **Assign (การจัดรถ).** `fleet-manager` only, only a ใบ in รอจัดรถ. Either:
   - **new เที่ยวรถ**: vehicle (ACTIVE), active driver, `starts_at`/`ends_at` (default to the ใบ's times; must cover them); or
   - **existing เที่ยวรถ** in PLANNED whose range covers the ใบ's times.
   The car and the driver may not be on another non-cancelled เที่ยวรถ whose range overlaps (`VEHICLE_BUSY`, `DRIVER_BUSY`, 409). Overlap is checked after `SELECT ... FOR UPDATE` on the vehicle row and the driver row, inside the write transaction.
6. **Move / unassign.** While the เที่ยวรถ is PLANNED, the หัวหน้าหมวด may move a ใบ to another เที่ยวรถ or take it off (back to รอจัดรถ). Changing a PLANNED เที่ยวรถ's car, driver or times reruns rule 5's checks. A เที่ยวรถ with no ใบ left is cancelled.
7. **Decline.** `fleet-manager`, a ใบ in รอจัดรถ, reason required → ไม่จัดรถ (closed).
8. **Log.** Only the เที่ยวรถ's driver (or `fleet-manager`, for corrections when a driver has no phone): ออกเดินทาง from PLANNED with `odometer_out` ≥ the car's last `odometer_in`; กลับถึง from DEPARTED with `odometer_in` ≥ `odometer_out`. Readings are whole kilometres, at most 9,999,999. Departure is allowed from 2 hours before `starts_at`.
9. **Car status.** A car in IN_REPAIR or RETIRED cannot be put on a new เที่ยวรถ; setting a car to IN_REPAIR while it has PLANNED เที่ยวรถ is allowed but those เที่ยวรถ are flagged on the dashboard for reassignment.
10. Every state change writes `fleet_request_history`, the audit event and the outbox notices in one transaction. Audit metadata: references, ids and statuses only; never purpose, destination, passenger names or reasons.

## Access

New permission `fleet.manage`, granted to the new role `fleet-manager` (หัวหน้าหมวดยานพาหนะ). Driver rights come from an active `fleet_driver` row, not a role.

| Action | Who |
|---|---|
| File, resubmit, cancel own ใบ | The requester |
| See a ใบ in full (purpose, passengers, history, reasons) | Its requester, the head-stage assignee or their active ผู้แทน, the driver of its เที่ยวรถ, `fleet.manage` |
| Decide the head stage | Central workflow rules |
| Dashboard, assign, decline, move, car register, driver list | `fleet.manage` |
| ออกเดินทาง / กลับถึง | The เที่ยวรถ's driver, or `fleet.manage` |
| ปฏิทินรถ | Everyone signed in: car, time range, destination province and status only |

## Screens (`/fleet`)

Sections (shown only when visible to the viewer; the module opens on the first visible one):

1. **แดชบอร์ด** (`/fleet/dashboard`, `fleet.manage`): counts (รอจัดรถ, เที่ยวรถวันนี้, รถออกอยู่, รถซ่อม); the รอจัดรถ queue sorted by `depart_at`, highlighted when departure is within 24 hours, with จัดรถ and ไม่จัดรถ on each row; today's board, one row per car with เที่ยวรถ as bars over 06:00–22:00 showing driver and status; เที่ยวรถ flagged by rule 9. จัดรถ opens an `ActionDialog` with two tabs: เข้าเที่ยวที่มีอยู่ (PLANNED เที่ยวรถ that cover the times) and สร้างเที่ยวใหม่ (only free ACTIVE cars and free active drivers for those times).
2. **ใบขอใช้รถของฉัน** (`/fleet/mine`, everyone): my ใบ, newest first, with status; button ขอใช้รถ → `/fleet/new`.
3. **ปฏิทินรถ** (`/fleet/calendar`, everyone): week view, one row per ACTIVE/IN_REPAIR car.
4. **งานขับของฉัน** (`/fleet/driving`, active drivers): mobile-first; today's and upcoming เที่ยวรถ with destination, passengers count, requester names and phones; large ออกเดินทาง / กลับถึง buttons opening a number field for the odometer.
5. **ตั้งค่า** (`/fleet/settings`, `fleet.manage`): car register and driver list (add by staff search, set phone, activate/deactivate).

Other pages: **ขอใช้รถ** (`/fleet/new`, optional `?travel=<travelId>`); **รายละเอียดใบ** (`/fleet/requests/<id>`) with status, history, the car, registration, driver name and work phone once assigned, and the actions the viewer may take; **รายละเอียดเที่ยวรถ** (`/fleet/trips/<id>`, `fleet.manage` and its driver).

Integration points: `modules.ts` entry `fleet` goes from `planned` to `live` with `sections`, a badge (รอจัดรถ count for `fleet.manage`; today's not-yet-departed เที่ยวรถ for a driver); the ไปราชการ detail page shows ขอใช้รถ under rule 2 or a link to the existing ใบ; `notificationTarget` sends `fleet` คำขอ to `/fleet/requests/<fleetRequestId>`; accent `[data-module="fleet"] { --accent: #a63d40; }` in `styles.css` and the DESIGN.md table.

## API

- `POST /api/fleet/requests` file (body may carry `officialTravelId`); `GET /api/fleet/requests/<id>`; `PUT /api/fleet/requests/<id>` edit and resubmit after ส่งกลับแก้ไข; `POST /api/fleet/requests/<id>/cancellation` `{ reason }`.
- `POST /api/fleet/requests/<id>/assignment` `{ tripId } | { vehicleId, driverPersonId, startsAt, endsAt }`; `DELETE /api/fleet/requests/<id>/assignment`; `POST /api/fleet/requests/<id>/decline` `{ reason }`.
- `PATCH /api/fleet/trips/<id>` change car, driver or times (PLANNED); `POST /api/fleet/trips/<id>/departure` `{ odometer }`; `POST /api/fleet/trips/<id>/return` `{ odometer }`.
- `GET /api/fleet/availability?from&to` free cars and drivers for the dialog.
- `POST/PUT /api/fleet/vehicles[/<id>]`; `POST/PUT /api/fleet/drivers[/<personId>]`.
- Head-stage decisions use the central `POST /api/requests/<requestId>/decisions`. The generic submit, resubmit and cancel routes refuse a `fleet` คำขอ with `fleet_request_route`, as for travel.
- Errors: 401 signed out; 403 without the right; 404 `NOT_FOUND`; 409 `NOT_PENDING`, `VEHICLE_BUSY`, `DRIVER_BUSY`, `TRAVEL_ALREADY_HAS_CAR`; 400 `{ error: code }` for validation (`INVALID_RANGE`, `TOO_FAR_AHEAD`, `IN_PAST`, `TOO_LONG`, `ODOMETER_BELOW_LAST`, …).

## Notifications

All through `notification.in_app` with `moduleCode: 'fleet'`, `targetPath` to the ใบ or เที่ยวรถ page, idempotency key `notification.in_app:fleet:<event>:<id>:<recipient>`. No purpose, destination, passenger names or reasons in a subject or payload.

| Event | Recipient | Subject |
|---|---|---|
| Head agrees (คำขอ APPROVED) or a ใบ filed from ไปราชการ | every active `fleet-manager` | มีใบขอใช้รถรอจัดรถ |
| Head disagrees / returns | requester | central workflow notice (unchanged) |
| จัดรถ | requester; the driver | จัดรถแล้ว > <registration> / มีงานขับใหม่ |
| ไม่จัดรถ | requester | ไม่จัดรถ |
| Move / change car, driver or times | requester(s) on the เที่ยวรถ; old and new driver | เปลี่ยนรถหรือเวลา |
| Requester cancels an assigned ใบ | `fleet-manager`s; the driver | ผู้ขอยกเลิกใบขอใช้รถ |
| เที่ยวรถ cancelled | the driver | ยกเลิกงานขับ |

The head-approval notice to fleet managers needs one optional seam in `ApprovalService`, the same shape as `getFollowers`: `getApprovalWatchers?(requestId)` returning extra recipients when a คำขอ reaches APPROVED. The workflow repository returns active `fleet-manager` holders for module `fleet` and nobody otherwise. This is the only change to central workflow code; the code-review thread is told before it lands, per `docs/integration/modules.md`.

## Testing

TDD throughout.

- Unit: time-range rules (past, 90 days, 30-day span, 15-minute steps, Bangkok day boundary), status derivation table, odometer rules, cancel eligibility, notice recipients per event.
- Integration (MariaDB): filing creates the head คำขอ; head approval puts the ใบ in รอจัดรถ and notifies fleet managers; filing from ไปราชการ (eligibility, prefill, one active ใบ per trip); overlap on car and on driver including two concurrent assignments (one gets 409); moving and unassigning; cancel cascades to an empty เที่ยวรถ; access for each role; generic routes refuse `fleet` คำขอ.
- Web: route handler tests for status codes; Playwright screenshots at 1280 and 390 of the dashboard, the dialog, งานขับของฉัน and the form, attached to the PR.

Commands as in `CLAUDE.md`; integration suites need `DATABASE_URL` and are reported as skipped otherwise.
