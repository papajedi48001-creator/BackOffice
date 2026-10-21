# Room Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** บุคลากรจองห้องประชุมได้ (หลายวันในครั้งเดียว) ธุรการพิจารณา ยกเลิก/คืนวันพร้อมเหตุผล ทุกคนเห็นปฏิทินออนไลน์ และผู้จองได้รับแจ้งทุกขั้น

**Architecture:** โมดูล `rooms` ใน `packages/core` มีสถานะการจองของตนเอง (ADR 0001) ใช้ audit/outbox/notification กลาง กันทับซ้อนด้วย `SELECT … FOR UPDATE` ที่แถวห้อง web รู้จักผู้ใช้ผ่าน `requireActor` เท่านั้น (ADR 0002)

**Tech Stack:** TypeScript, zod, Next.js App Router, MariaDB (mysql2), Drizzle schema, Vitest

**Spec:** `docs/superpowers/specs/2026-10-21-room-booking-design.md`

## Global Constraints

- เวลาเก็บ UTC แสดง Asia/Bangkok (UTC+7 ไม่มี DST) ปี พ.ศ.
- กติกา: 07:00–20:00, ทีละ 30 นาที, ล่วงหน้าไม่เกิน 90 วัน, ไม่ย้อนหลัง, 1–14 วันต่อการจอง, ผู้เข้าประชุม ≤ ความจุ
- เหตุผล หัวข้อ หมายเหตุ ห้ามอยู่ใน audit metadata, outbox payload, notification subject, log หรือ URL
- การเปลี่ยนสถานะ + history + audit + outbox อยู่ใน transaction เดียว
- migration เพิ่มอย่างเดียว ลงทะเบียนใน `packages/db/src/migrate.ts` และ schema Drizzle ตามกัน
- ตรวจสิทธิ์ที่ server ทุก action; ข้อความ UI เป็นไทยผ่าน `@backoffice/i18n`
- บทบาท `room-manager` → `room.manage`, `room-booking-approver` → `room.booking.decide`; moduleCode `room-booking`

## Review Focus

- การจองที่ข้ามเที่ยงคืน UTC (เช่น 07:00 ไทย = 00:00 UTC) ต้องได้วันที่ถูก → test ใน Task 2
- ยื่นพร้อมกันสองรายการทับกันต้องผ่านรายการเดียว → integration test ใน Task 8
- ช่วงที่ติดกันพอดี (09:00–12:00 กับ 12:00–15:00) ไม่ถือว่าทับ → test ใน Task 5
- ผู้อนุมัติยื่นจองเอง ต้องไม่ได้รับแจ้ง "รออนุมัติ" ของตัวเองและอนุมัติเองไม่ได้ → tests ใน Task 5, 6
- คืนวันระหว่างที่วันนี้กำลังใช้อยู่ คืนเฉพาะวันที่ยังไม่เริ่ม วันนี้คงไว้ → test ใน Task 7

---

### Task 1: Contracts and permissions

**Files:**
- Create: `packages/contracts/src/rooms.ts`, `packages/contracts/src/rooms.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/access.ts` (permissionSchema), `packages/core/src/access/policy.ts`, `packages/core/src/access/authorization-service.test.ts`

**Interfaces — Produces:**
- `roomBookingPolicy = { openMinute: 420, closeMinute: 1200, slotMinutes: 30, maxAdvanceDays: 90, maxDays: 14, utcOffsetMinutes: 420 } as const`
- `ROOM_BOOKING_MODULE = 'room-booking'`
- `type RoomBookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'`; `type RoomBookingDayStatus = 'ACTIVE' | 'RELEASED'`
- `submitRoomBookingInputSchema`: `{ roomId: string, dates: string[] (YYYY-MM-DD, 1–14), startMinute: int, endMinute: int, title: trim 1–200, attendeeCount: int ≥1, addons: { addonId, quantity: int 1–999, note?: trim ≤500 }[] (≤20, default []) }`
- `decideRoomBookingInputSchema`: `{ bookingId, decision: 'APPROVE' | 'REJECT', reason?: trim 1–1000 }`
- `cancelRoomBookingInputSchema`: `{ bookingId, reason: trim 1–1000 }`
- `roomInputSchema`: `{ name: 1–120, place: 1–200, capacity: int 1–1000, equipment: ≤1000 default '', ownerOrganizationId: string, isBookable: boolean }`
- `roomAddonInputSchema`: `{ name: 1–120, unit: 1–30, isActive: boolean }`
- `interface RoomActor { personId: string; roles: AccessSubject['roles'] }`
- Permission enum gains `'room.manage' | 'room.booking.decide'`

- [x] **Step 1: Failing tests** — `rooms.test.ts`: rejects 15 dates; rejects empty title after trim; rejects quantity 0; cancel requires reason. `authorization-service.test.ts`: `room-booking-approver` scoped to unit-a may `room.booking.decide` on `{moduleCode:'room-booking', organizationId:'unit-a'}` and not on unit-b; `room-manager` may `room.manage` without data-owner assignment.
- [x] **Step 2:** `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization` → FAIL (module missing)
- [x] **Step 3:** Implement schemas and policy entries.
- [x] **Step 4:** same command → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): add room booking contracts and permissions"`

### Task 2: Booking time rules

**Files:** Create `packages/core/src/rooms/booking-days.ts`, `packages/core/src/rooms/booking-days.test.ts`

**Interfaces — Produces:**
- `bangkokDate(instant: Date): string` (YYYY-MM-DD)
- `buddhistYear(instant: Date): number`
- `toBookingRanges(input: { dates: string[]; startMinute: number; endMinute: number }, now: Date): { date: string; startsAt: Date; endsAt: Date }[]` sorted by date; throws `Error('INVALID_DATES')` (bad/duplicate date), `Error('INVALID_TIME_RANGE')`, `Error('OUTSIDE_BOOKING_WINDOW')`
- `rangesOverlap(a, b): boolean` (half-open)

- [x] **Step 1: Failing tests**
  - `toBookingRanges({dates:['2026-11-05'], startMinute:420, endMinute:540}, now)` → startsAt `2026-11-05T00:00:00Z`, endsAt `02:00Z`
  - 06:30 start, 20:30 end, 09:15 start, start ≥ end → `INVALID_TIME_RANGE`
  - first range starting before `now` → `OUTSIDE_BOOKING_WINDOW`; date = today(Bangkok)+91 → `OUTSIDE_BOOKING_WINDOW`; +90 → ok
  - duplicate date or `'2026-02-30'` → `INVALID_DATES`
  - `bangkokDate(new Date('2026-12-31T18:00:00Z'))` → `'2027-01-01'`; `buddhistYear` of that → `2570`
  - `rangesOverlap` 09–12 vs 12–15 → false; 09–12 vs 11–13 → true
- [x] **Step 2:** `pnpm --filter @backoffice/core test -- booking-days` → FAIL
- [x] **Step 3:** Implement with UTC arithmetic using `utcOffsetMinutes` (no Intl dependency).
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): validate booking dates and times in Bangkok time"`

### Task 3: Database schema and notification target

**Files:**
- Create: `packages/db/migrations/0004_room_booking.sql`, `packages/db/src/schema/rooms.ts`
- Modify: `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/index.ts`, `packages/db/src/schema/outbox.ts` (notification.targetPath), `infra/backup/restore-verify.sh` (required_tables + `room`, `room_booking`, `room_booking_day`), `packages/contracts/src/notifications.ts` (+test)

Tables (CHAR(36) ids, utf8mb4, FKs as in 0003):
- `room(id, name, place, capacity INT, equipment VARCHAR(1000), owner_organization_id FK organization, is_bookable TINYINT, created_at, updated_at)`
- `room_addon(id, name, unit, is_active, created_at, updated_at)`
- `room_booking(id, reference UNIQUE, room_id FK, booker_person_id FK person, booker_organization_id NULL, title VARCHAR(200), attendee_count INT, start_minute INT, end_minute INT, status, decided_by_person_id NULL, created_at, updated_at, KEY(status, created_at), KEY(booker_person_id, created_at))`
- `room_booking_day(id, booking_id FK, room_id, booking_date DATE, starts_at, ends_at, status, released_at NULL, KEY room_booking_day_room_time (room_id, status, starts_at, ends_at))`
- `room_booking_addon(id, booking_id FK, addon_id, addon_name, addon_unit, quantity INT, note VARCHAR(500) NULL)`
- `room_booking_history(id, booking_id FK, actor_person_id, action, reason VARCHAR(1000) NULL, created_at)`
- `room_booking_sequence(year INT PRIMARY KEY, last_value INT NOT NULL)`
- `ALTER TABLE notification ADD COLUMN IF NOT EXISTS target_path VARCHAR(255) NULL`

Notification payload: `notificationEventPayloadSchema` = `{ recipientPersonId, subject, requestId?: string, targetPath?: string matching /^\/(?!\/)[A-Za-z0-9/_-]*$/ }` refined so at least one of requestId/targetPath is present.

- [x] **Step 1: Failing tests** — `migrate.test.ts` expects `0004_room_booking.sql` last; `notifications.test.ts` accepts `{recipientPersonId, subject, targetPath:'/rooms/bookings/abc'}`, rejects `targetPath:'//evil.example'` and a payload with neither id nor path.
- [x] **Step 2:** `pnpm --filter @backoffice/db test && pnpm --filter @backoffice/contracts test && bash infra/backup/restore-verify.test.sh` → FAIL
- [x] **Step 3:** Write migration, Drizzle schema, registry, restore list, payload schema.
- [x] **Step 4:** same → PASS
- [x] **Step 5:** `git commit -m "feat(db): add room booking tables and notification target path"`

### Task 4: Notification delivery follows targetPath

**Files:** Modify `packages/contracts/src/notifications.ts` (`NotificationMessage.targetPath: string | null`), `packages/core/src/notifications/notification-service.ts`, `apps/worker/src/database-notification-store.ts` (+test), `apps/web/src/app/api/notifications/route.ts`, `apps/web/src/app/api/notifications/[notificationId]/read/route.ts` (+tests), `apps/web/src/app/(app)/notifications/notification-list.tsx` (+test)

- [x] **Step 1: Failing tests** — store inserts `target_path`; read route returns `{ href: '/rooms/bookings/b1' }` when target_path set, `{ href: '/requests/r1' }` otherwise, 404 when neither; list navigates to `href`.
- [x] **Step 2:** `pnpm --filter @backoffice/worker test && pnpm --filter @backoffice/web test -- notification` → FAIL
- [x] **Step 3:** Implement.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(notifications): link notifications to non-request targets"`

### Task 5: Submit a booking

**Files:** Create `packages/core/src/rooms/room-booking-repository.ts` (interface + record types), `packages/core/src/rooms/room-booking-service.ts`, `packages/core/src/rooms/room-booking-service.test.ts`, `packages/core/src/rooms/in-memory-room-booking-repository.ts` (test double used by Tasks 5–7); export from `packages/core/src/index.ts`

**Interfaces — Produces:**
```ts
interface RoomRecord { id: string; name: string; capacity: number; ownerOrganizationId: string; isBookable: boolean }
interface RoomBookingRecord { id: string; reference: string; roomId: string; bookerPersonId: string; bookerOrganizationId: string | null; title: string; attendeeCount: number; startMinute: number; endMinute: number; status: RoomBookingStatus; decidedByPersonId: string | null }
interface RoomBookingDayRecord { id: string; bookingId: string; roomId: string; bookingDate: string; startsAt: Date; endsAt: Date; status: RoomBookingDayStatus }
interface RoomBookingAddonRecord { id: string; bookingId: string; addonId: string; addonName: string; addonUnit: string; quantity: number; note: string | null }
interface RoomBookingRepository {
  transaction<T>(work: (repository: RoomBookingRepository) => Promise<T>): Promise<T>;
  lockRoom(roomId: string): Promise<RoomRecord | null>;
  findActiveAddons(addonIds: string[]): Promise<{ id: string; name: string; unit: string }[]>;
  findConflicts(roomId: string, ranges: { startsAt: Date; endsAt: Date }[]): Promise<{ startsAt: Date; endsAt: Date }[]>;
  nextSequence(year: number): Promise<number>;
  currentOrganizationId(personId: string): Promise<string | null>;
  findApproverPersonIds(organizationId: string): Promise<string[]>;
  insertBooking(booking: RoomBookingRecord, days: RoomBookingDayRecord[], addons: RoomBookingAddonRecord[]): Promise<void>;
  getBookingForUpdate(bookingId: string): Promise<{ booking: RoomBookingRecord; days: RoomBookingDayRecord[]; room: RoomRecord } | null>;
  updateBookingStatus(bookingId: string, status: RoomBookingStatus, decidedByPersonId: string | null): Promise<void>;
  releaseDays(dayIds: string[], releasedAt: Date): Promise<void>;
  appendHistory(entry: { id: string; bookingId: string; actorPersonId: string; action: RoomBookingHistoryAction; reason: string | null }): Promise<void>;
  saveOutbox(event: OutboxEvent): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}
type RoomBookingHistoryAction = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DAYS_RELEASED'
class BookingConflictError extends Error { message = 'BOOKING_CONFLICT'; conflicts: { startsAt: Date; endsAt: Date }[] }
class RoomBookingService { constructor(repository, authorizer = new AuthorizationService(), createId = randomUUID, now = () => new Date()); submit(actor: RoomActor, input): Promise<RoomBookingRecord>; decide(actor, input): Promise<RoomBookingRecord>; cancel(actor, input): Promise<{ booking: RoomBookingRecord; releasedDayCount: number }> }
```
Reference: `RB-${buddhistYear(now)}-${String(seq).padStart(4,'0')}`.

- [x] **Step 1: Failing tests**
  - happy path: booking `PENDING`, 3 days `ACTIVE`, reference `RB-2569-0001`, history `SUBMITTED`, audit `room_booking.submitted` with metadata keys exactly `bookingReference, roomId, status, dayCount`
  - outbox: notification to booker (`ยื่นจองห้องแล้ว รออนุมัติ (RB-2569-0001)`, targetPath `/rooms/bookings/<id>`) and to each approver except the booker; no payload contains the title
  - room missing → `ROOM_NOT_FOUND`; not bookable → `ROOM_NOT_BOOKABLE`; attendee > capacity → `OVER_CAPACITY`; inactive addon → `INVALID_ADDON`
  - existing active day 10:00–12:00 → `BookingConflictError` listing that range; adjacent 12:00–13:00 succeeds
- [x] **Step 2:** `pnpm --filter @backoffice/core test -- room-booking-service` → FAIL
- [x] **Step 3:** Implement `submit` (lock room → validate → conflicts → sequence → insert → history → audit → outbox).
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): submit room bookings with conflict prevention"`

### Task 6: Decide a booking

**Files:** Modify `room-booking-service.ts`, `room-booking-service.test.ts`

- [x] **Step 1: Failing tests** — approve → `APPROVED`, `decidedByPersonId`, history `APPROVED`, notification `การจองห้องได้รับอนุมัติ (RB-…)`; reject without reason → `REASON_REQUIRED`; reject stores reason only in history; booker deciding own → `CONFLICT_OF_INTEREST`; actor without role or wrong org scope → `FORBIDDEN`; status not `PENDING` or all days ended → `BOOKING_NOT_PENDING`
- [x] **Step 2:** run → FAIL
- [x] **Step 3:** Implement `decide`.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): approve or reject room bookings"`

### Task 7: Cancel and release days

**Files:** Modify `room-booking-service.ts`, `room-booking-service.test.ts`

Rules per spec "การยกเลิก". Actor is booker if `personId === bookerPersonId`, else must hold `room.booking.decide` in scope (else `FORBIDDEN`). Booker who also holds the role is treated as approver for timing.

- [x] **Step 1: Failing tests** — booker before start → `CANCELLED`, days untouched, approver who decided gets `ผู้จองยกเลิกการจองห้อง (RB-…)` when it was `APPROVED`; booker after first day started on `APPROVED` → only days with `startsAt > now` released, today kept, status stays `APPROVED`, history `DAYS_RELEASED`, audit `room_booking.days_released`; booker after start with no future days → `NOTHING_TO_RELEASE`; booker on `PENDING` after start → `CANCEL_NOT_ALLOWED`; approver after last day ended → `CANCEL_NOT_ALLOWED`; approver mid-booking releases remaining and booker gets `การจองห้องถูกยกเลิกโดยผู้ดูแล (RB-…)`; empty reason rejected by schema
- [x] **Step 2:** run → FAIL
- [x] **Step 3:** Implement `cancel`.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): cancel bookings and release remaining days"`

### Task 8: Catalog service, database repository, calendar query

**Files:** Create `packages/core/src/rooms/room-catalog-service.ts` (+test), `database-room-booking-repository.ts`, `database-room-catalog-repository.ts`, `room-booking-queries.ts`, `database-room-booking-repository.integration.test.ts`

**Interfaces — Produces:**
- `RoomCatalogService(repository, authorizer, createId)`: `createRoom(actor, input)`, `updateRoom(actor, roomId, input)`, `createAddon(actor, input)`, `updateAddon(actor, addonId, input)`; rooms checked against `room.manage` on the room's owner org (create: input owner org); addons require `room.manage` in any scope; audit `room.created|room.updated|room_addon.created|room_addon.updated`
- `RoomBookingQueries(database)`: `listRooms({ bookableOnly })`, `listAddons({ activeOnly })`, `calendar(from: Date, to: Date, roomId?)` → `{ bookingId, reference, roomId, roomName, date, startsAt, endsAt, status, title, bookerPersonId, bookerOrganizationName | null }[]` only `ACTIVE` days of `PENDING|APPROVED`; `myBookings(personId)`; `pendingForApprover(actor)`; `detail(bookingId, actor)` → full booking incl. addons and history, or `null` when actor is neither booker nor scoped approver

- [x] **Step 1: Failing tests** — catalog unit: manager scoped to unit-a cannot create a room owned by unit-b (`FORBIDDEN`); audit metadata excludes names. Integration (skips without `DATABASE_URL`): two concurrent `submit`s for overlapping ranges → exactly one fulfilled, one `BOOKING_CONFLICT`; 5 concurrent submits for different rooms get distinct references; `calendar` omits released days and rejected bookings; `detail` returns null for an unrelated person
- [x] **Step 2:** `pnpm --filter @backoffice/core test && DATABASE_URL=… pnpm --filter @backoffice/core test:integration` → FAIL
- [x] **Step 3:** Implement repositories (`FOR UPDATE` on room, `INSERT … ON DUPLICATE KEY UPDATE` + `SELECT … FOR UPDATE` on sequence) and queries.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(rooms): persist bookings in MariaDB and query the calendar"`

### Task 9: Web API and actor seam

**Files:** Create `apps/web/src/lib/actor.ts` (+test), `apps/web/src/app/api/rooms/room-error-response.ts` (+test), routes: `api/rooms/route.ts` (GET list, POST create), `api/rooms/[roomId]/route.ts` (PATCH), `api/rooms/addons/route.ts` (GET, POST), `api/rooms/addons/[addonId]/route.ts` (PATCH), `api/rooms/calendar/route.ts` (GET `from`,`to`,`roomId`), `api/rooms/bookings/route.ts` (GET mine, POST submit), `api/rooms/bookings/[bookingId]/decision/route.ts` (POST), `api/rooms/bookings/[bookingId]/cancellation/route.ts` (POST) + tests for bookings, decision, cancellation

**Interfaces — Produces:** `requireActor(request: Request): Promise<RoomActor>` (throws `AuthorizationError(401)`); `roomErrorResponse(error: unknown): Response` mapping: ZodError/`INVALID_*`/`OVER_CAPACITY`/`OUTSIDE_BOOKING_WINDOW`/`REASON_REQUIRED` → 400 `{error: code}`, `FORBIDDEN`/`CONFLICT_OF_INTEREST` → 403, `ROOM_NOT_FOUND`/`BOOKING_NOT_FOUND` → 404, `BOOKING_CONFLICT` → 409 with `conflicts: [{startsAt, endsAt}]`, `BOOKING_NOT_PENDING`/`CANCEL_NOT_ALLOWED`/`NOTHING_TO_RELEASE`/`ROOM_NOT_BOOKABLE` → 409, 401 → `unauthenticated`, else 500 `room_booking_failed` (log code only)

- [x] **Step 1: Failing tests** — POST bookings without session → 401; conflict → 409 with conflicts; decision by non-approver → 403; cancellation without reason → 400; response bodies never echo the reason
- [x] **Step 2:** `pnpm --filter @backoffice/web test -- rooms` → FAIL
- [x] **Step 3:** Implement routes using `getSharedDatabase()`.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(web): expose room booking API behind the actor seam"`

### Task 10: Screens, navigation, Thai copy

**Files:** Create under `apps/web/src/app/(app)/rooms/`: `page.tsx` + `room-calendar.tsx` (+test), `bookings/new/page.tsx` + `booking-form.tsx` (+test), `bookings/page.tsx`, `bookings/[bookingId]/page.tsx` + `booking-actions.tsx` (+test), `approvals/page.tsx`, `manage/page.tsx` + `room-manage-forms.tsx`; `apps/web/src/lib/bangkok-time.ts` (+test). Modify `apps/web/src/app/(app)/layout.tsx`, `packages/i18n/src/th.ts`, `apps/web/src/app/styles.css`

- `formatBangkokDate(date)` → `'5 พ.ย. 2569'`, `formatMinutes(540)` → `'09:00'`
- Nav: `ห้องประชุม` (all), `รออนุมัติจองห้อง` (room-booking-approver), `จัดการห้องประชุม` (room-manager)
- Status labels: PENDING `รออนุมัติ`, APPROVED `อนุมัติแล้ว`, REJECTED `ไม่อนุมัติ`, CANCELLED `ยกเลิกแล้ว`; error codes → Thai messages in `th.ts`

- [x] **Step 1: Failing tests** — calendar renders text status label and title per booking for a week; form builds `dates` from range minus unchecked days and shows conflict dates from a 409; actions show cancel for booker, approve/reject for approver, require reason before submit; time helpers
- [x] **Step 2:** `pnpm --filter @backoffice/web test -- rooms bangkok` → FAIL
- [x] **Step 3:** Implement pages as server components reading via `RoomBookingQueries`, client components posting to the API.
- [x] **Step 4:** → PASS
- [x] **Step 5:** `git commit -m "feat(web): add meeting room calendar, booking, approval, and management screens"`

### Task 11: Verify and document

- [x] `pnpm lint && pnpm typecheck && pnpm test` → all pass
- [x] `DATABASE_URL=mysql://… pnpm test:integration` → pass (report skip honestly if MariaDB unavailable)
- [x] `bash infra/backup/restore-verify.test.sh` and `git diff --check`
- [x] Runbook `docs/runbooks/room-booking-roles.md`: how to grant `room-manager` / `room-booking-approver` roles
- [x] `git commit -m "docs(rooms): record verification and role setup"`

## Execution notes (2026-10-21)

- PR #10 (HR master data) merged into `main` mid-way and claimed migration `0004`; this branch merged `main` and renumbered the room migration to `0005_room_booking.sql`.
- `room_booking_history.created_at` is `DATETIME(6)` so entries made in the same second keep their order.
- Domain outbox events (`room_booking.*`) are not emitted: the worker only consumes notification events and nothing else subscribes yet; audit + history carry the record.
- Verified end to end against a local MariaDB and `next start`: manager adds room and add-ons, booker books 5, 6, 9 Nov, a clashing booking shows the clash, approver approves, worker delivers in-app notifications that open the booking page.

## Review follow-ups (2026-10-21)

Whole-branch review returned "with fixes". Each fix was test-first:

- [x] Approval queue leaves out the approver's own bookings and pending bookings whose active days have all ended; those show as "หมดเวลา ไม่ได้พิจารณา" (integration test, `booking-state.test.ts`).
- [x] Decide and cancel answer `BOOKING_NOT_FOUND` to people who may not see the booking; approver release button only while future days remain.
- [x] Booking form caps the end date (`first + 13` days, `today + 90`) and refuses a longer range with a message instead of cutting it.
- [x] Manage page edits rooms and add-ons in place and warns with the count of bookings still to come before closing a room.
- [x] Calendar day view (`/rooms?view=day&date=`), and an unusable `week`/`date` falls back to today instead of a 500.
- [x] Index `(status, starts_at)` on `room_booking_day` for the all-rooms calendar; `GET /api/notifications` returns `targetPath` and a nullable `requestId`.
- [x] Deploy runbook: run the migration, then switch web and worker images together. ADR 0001 notes sequence-row waiting and the host-timezone assumption (`timezone: 'Z'` left for a separate change because it affects every module).
