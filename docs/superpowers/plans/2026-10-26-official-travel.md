# ไปราชการ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A live "ไปราชการ" module. A หัวหน้าคณะ files one คำขอไปราชการ for one or more ผู้ร่วมเดินทาง. Each person's คำขอ goes up their own สายบังคับบัญชา, and the trip shows on the leave calendar.

**Architecture:**
- A trip is an `official_travel` row. Each ผู้ร่วมเดินทาง is an `official_travel_member` row that owns a central **คำขอ** (`moduleCode: 'official-travel'`, requestor = that person).
- The trip status is derived from the members' request statuses by a pure function.
- `OfficialTravelService` writes, `OfficialTravelQueries` reads. Overlap with leave uses the existing half-day units.
- Next.js routes and pages live under `/travel`.

**Tech Stack:** pnpm monorepo, TypeScript, zod 4, mysql2 on MariaDB 11.8, Drizzle schema, Next.js App Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-official-travel-design.md`

## Global Constraints

- **Migration:** `packages/db/migrations/0013_official_travel.sql`, additive, listed after 0012 in `migrate.ts`. Drizzle lives in `packages/db/src/schema/official-travel.ts`, exported from the schema index.
- **Module code:** `OFFICIAL_TRAVEL_MODULE = 'official-travel'`. Routes are `/travel/...` and `/api/travel/...`.
- **Enums:**
  - Travel type: `IN_PROVINCE` ในจังหวัด, `OUT_OF_PROVINCE` ต่างจังหวัด, `ABROAD` ต่างประเทศ. Seeded with sort order 1–3, all `HOSPITAL`.
  - Vehicle: `GOVERNMENT_CAR` รถราชการ, `PRIVATE_CAR` รถส่วนตัว, `PUBLIC_TRANSPORT` รถโดยสารสาธารณะ, `AIRPLANE` เครื่องบิน, `WITH_ORGANISER` ไปกับผู้จัด.
  - Funding source: `HOSPITAL_FUND` เงินบำรุง, `ORGANISER` งบผู้จัด, `NONE` ไม่เบิก.
- **Days:** trip half-day units are `leaveUnits(range, 'CALENDAR_DAYS', new Set())`, and `days = units / 2`.
- **Members:** 1–30 distinct person ids. The หัวหน้าคณะ (the session person) is always added, first.
- **Permission:** `travel.manage` is granted to `hr-manager`, and `requiresDataOwner` is true. The check is `canActHospitalWide(subject, 'travel.manage', 'hr')`.
- **Audit actions:**
  - `official_travel.submitted`, `official_travel.resubmitted`, `official_travel.cancelled`, `official_travel.type.update`.
  - targetType is `official_travel`. Metadata holds `travelType`, `memberCount`, `startDate`, `endDate` and `days`. It never holds subject, costs or reason.
- **Notifications:** moduleCode `official-travel`, targetPath `/travel/requests/<requestId>`. That page redirects to `/travel/<travelId>`.
- **Error codes:** `NO_TRAVEL_DAYS`, `INVALID_MEMBERS`, `NO_ORGANIZATION`, `NO_APPROVER`, `OVERLAPS_LEAVE`, `OVERLAPS_TRAVEL`, `NOT_FOUND`, `NOT_RETURNED`, `NOT_PENDING`. A per-person failure also carries `personId`. Leave gains `OVERLAPS_OFFICIAL_TRAVEL`.
- **Copy:** Thai, in `packages/i18n/src/th.ts`, using the CONTEXT.md terms.

## Review Focus

1. **Generic request routes:** if `POST /api/requests`, `/api/requests/[id]/resubmission` or `/cancellation` accept an `official-travel` คำขอ, the trip rules are skipped. All three must refuse it, as they do for leave (Task 7).
2. **Hidden trip:** a person not on the trip, its steps or `travel.manage` opens `/travel/<id>` and gets not found. The calendar row carries only the place, never subject, costs or organiser (Task 5).
3. **One bad member:** with three members, one of whom already has leave on those dates, nothing is written, and the error names that person (Task 4).
4. **Leave after trip:** a ใบลา over an approved trip's dates is refused with `OVERLAPS_OFFICIAL_TRAVEL` (Task 4).
5. **Resubmit keeps approvals:** after one member is RETURNED and another APPROVED, a resubmit re-sends only the RETURNED คำขอ (Task 4).

---

### Task 1: Migration 0013 and schema

**Files:**
- Create: `packages/db/migrations/0013_official_travel.sql`, `packages/db/src/schema/official-travel.ts`, `packages/db/src/schema/official-travel-schema.integration.test.ts`
- Modify: `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, the schema index, and `docs/integration/modules.md`

**Interfaces:**
- Produces: the tables `official_travel_type`, `official_travel` and `official_travel_member`, as in the spec's Data section.

- [x] **Step 1: Write the failing tests.**
  - In `migrate.test.ts`, assert the three `CREATE TABLE IF NOT EXISTS` statements and the `0013_official_travel.sql` schema_migration record.
  - In the integration test, the seeded types are `['IN_PROVINCE','OUT_OF_PROVINCE','ABROAD']`, all `HOSPITAL`, and re-running the migrations keeps 3 rows.
- [x] **Step 2: Run `pnpm --filter @backoffice/db test`.** Expected: FAIL on the missing 0013.
- [x] **Step 3: Implement.** Write the SQL with `IF NOT EXISTS` and `INSERT IGNORE` seeds, the Drizzle tables, the migrate list entry, and a modules.md row.
- [x] **Step 4: Verify.** Run the db unit tests, then `DATABASE_URL=… pnpm --filter @backoffice/db test:integration`. Expected: PASS.
- [x] **Step 5: Commit** `feat(db): add official travel tables`.

### Task 2: Contracts, permission, trip status and access

**Files:**
- Create: `packages/contracts/src/official-travel.ts` (+ test), `packages/core/src/official-travel/travel-module.ts`, `travel-status.ts` (+ test), `travel-access.ts` (+ test)
- Modify: `packages/contracts/src/access.ts`, `packages/contracts/src/index.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `officialTravelInputSchema`: range fields plus `subject`, `organiser`, `place`, `province` (trimmed, 1–300 or 1–100), `travelType`, `vehicle`, `fundingSource`, the four `cost*` (number, 0–9,999,999.99, multipleOf 0.01, default 0), and `memberPersonIds: string[]` (0–29 others, distinct). Strict.
  - `OfficialTravelInput`, `travelTypeCodeSchema`, `travelVehicleSchema`, `travelFundingSchema`, `travelTypeSettingInputSchema` (`{ approvalTarget }`) and `OfficialTravelErrorCode`.
  - `tripStatus(statuses: RequestStatus[]): 'RETURNED' | 'IN_REVIEW' | 'CANCELLED' | 'REJECTED' | 'APPROVED'`, following spec rule 6.
  - `canManageTravel(subject)`.
  - `OFFICIAL_TRAVEL_MODULE`.

- [x] **Step 1: Write the failing tests.**
  - `tripStatus(['APPROVED','RETURNED'])` is `'RETURNED'`.
  - `['APPROVED','IN_REVIEW']` gives `'IN_REVIEW'`, and `['CANCELLED','CANCELLED']` gives `'CANCELLED'`.
  - `['REJECTED','CANCELLED']` gives `'REJECTED'`, and `['APPROVED','REJECTED']` gives `'APPROVED'`.
  - The schema rejects end before start, duplicate member ids and a negative cost.
  - `canManageTravel` is true for hr-manager with the HR data owner, and false without it.
- [x] **Step 2: Run the tests.** Expected: FAIL (modules missing).
- [x] **Step 3: Implement.** Reuse leave's range checks by exporting `withRangeChecks`/`rangeShape` from `leave.ts`.
- [x] **Step 4: Run `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test`.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): add official travel contracts, permission and trip status`.

### Task 3: Acting for the requestor in the central workflow

**Files:**
- Modify: `packages/core/src/workflow/request-service.ts` (+ test), `module-notification.ts` (+ test)

**Interfaces:**
- Produces:
  - `cancelRequest(input, options?: { actorAuthorized?: boolean })` and `resubmitRequest(input, options?: { actorAuthorized?: boolean })`. With `actorAuthorized`, the `NOT_REQUESTOR` check is skipped. The audit records `actorPersonId` as given.
  - `notificationTarget('official-travel', id)` returns `{ moduleCode: 'official-travel', targetPath: '/travel/requests/<id>' }`.

- [x] **Step 1: Write the failing tests.**
  - A resubmit by another actor with `actorAuthorized: true` succeeds, and the audit actor is that actor. Without the flag, it still throws `NOT_REQUESTOR`.
  - The same two cases for cancel.
  - The notification target for travel.
- [x] **Step 2: Run `pnpm --filter @backoffice/core test -- request-service module-notification`.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run the same tests.** Expected: PASS.
- [x] **Step 5: Commit** `feat(workflow): let a module act for the requestor and route travel notices`.

### Task 4: OfficialTravelService (submit, resubmit, cancel) and leave overlap

**Files:**
- Create: `packages/core/src/official-travel/travel-store.ts`, `travel-service.ts`, `travel-service.integration.test.ts`
- Modify: `packages/core/src/leave/leave-service.ts`, `packages/contracts/src/leave.ts` (error code), `leave-service.integration.test.ts`

**Interfaces:**
- Consumes: `lockPerson`, `activeUnitsOfPerson`, `loadPersonContext`, `RequestService` (Task 3 options).
- Produces:
  - `activeTravelUnitsOfPerson(db, personId, from, to, excludeTravelId?) : Promise<string[]>`. This covers member คำขอ that are IN_REVIEW, RETURNED or APPROVED.
  - `class OfficialTravelService(database, approvers, createId?)`:
    - `submit(leaderPersonId, draft)` → `{ ok: true; travelId } | { ok: false; code; personId? }`
    - `resubmit(leaderPersonId, travelId, draft)` → `{ ok: true } | { ok: false; code; personId? }`
    - `cancel(leaderPersonId, travelId, reason)` → `{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'NOT_PENDING' }`
  - `loadTravelTypes(db)` → `Array<{ code; name; approvalTarget; sortOrder }>`.

- [x] **Step 1: Write the failing integration tests.** They use the leave fixtures' people and units.
  - Submit for leader plus 2 members writes 1 trip, 3 members and 3 คำขอ, each with its own requestor and steps, and one audit `official_travel.submitted`.
  - A member with an approved ใบลา on day 2 makes submit fail with `{ code: 'OVERLAPS_LEAVE', personId }`, and no rows are written.
  - A second trip over the same dates for the leader gives `OVERLAPS_TRAVEL`.
  - A leave submit over the trip gives `OVERLAPS_OFFICIAL_TRAVEL`.
  - Member A is RETURNED and member B is APPROVED. Resubmit with new dates: A is IN_REVIEW, B stays APPROVED, and the trip dates change. A non-leader gets `NOT_FOUND`.
  - Cancel turns every IN_REVIEW and RETURNED คำขอ into CANCELLED. Cancel on a fully approved trip gives `NOT_PENDING`.
- [x] **Step 2: Run `DATABASE_URL=… pnpm --filter @backoffice/core test:integration -- travel-service leave-service`.** Expected: FAIL.
- [x] **Step 3: Implement.** Do it in one transaction (READ COMMITTED):
  1. Lock every member's person row in id order.
  2. Check each member.
  3. Insert the trip.
  4. For each member, `submitRequest` with target `type.approvalTarget` and organization snapshot = the member's unit, then insert the member row.
  5. Audit.

  Map the thrown `NO_APPROVER` to that code with the member's personId.
- [x] **Step 4: Run the same command.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): file, resubmit and cancel official travel; leave refuses trip days`.

### Task 5: OfficialTravelQueries and the calendar

**Files:**
- Create: `packages/core/src/official-travel/travel-queries.ts` (+ integration test)
- Modify: `packages/core/src/leave/leave-queries.ts` (teamCalendar) (+ its integration test)

**Interfaces:**
- Produces:
  - `TravelListItem { travelId; subject; place; province; travelType; startDate; endDate; startHalf; endHalf; days; status; leaderDisplayName; memberCount }`.
  - `TravelDetail`: the list item plus `organiser`, `vehicle`, `fundingSource`, `costs {allowance,lodging,transport,registration,total}`, `leaderPersonId`, and `members: Array<{ requestId; personId; displayName; organizationName; status; steps: LeaveStepView[]; canDecide }>`. It also has `canEdit` (leader and any RETURNED) and `canCancel` (leader and any IN_REVIEW/RETURNED).
  - Methods:
    - `mine(personId)`
    - `detail(travelId, viewer)`, which returns null unless the viewer is a member, on any step, an active delegate of a pending step, or `canManageTravel`
    - `travelIdOfRequest(requestId)`
    - `pendingForApprover(personId)`, as member rows with trip info
    - `pendingCount(personId)`
    - `all(filter: { from?; to?; travelType?; status? })`
  - The `TeamCalendarRow.days[]` entries gain `kind: 'LEAVE' | 'TRAVEL'` and `place?: string`.
- [x] **Step 1: Write the failing tests.**
  - An outsider gets null from `detail`, and the member's head (a step assignee) gets the detail.
  - `pendingCount` for the head is 1 per member waiting on them.
  - The calendar row for a traveller has `kind: 'TRAVEL'` and `place`, and has no `subject` key.
- [x] **Step 2: Run the integration tests.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run the tests.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): add official travel queries and show trips on the leave calendar`.

### Task 6: Travel type settings

**Files:**
- Create: `packages/core/src/official-travel/travel-settings-service.ts` (+ integration test)

**Interfaces:**
- Produces: `TravelSettingsService(db).setApprovalTarget(actorPersonId, code, input)` → `{ ok: true } | { ok: false; code: 'NOT_FOUND' }`, audited as `official_travel.type.update`.
- [x] **Step 1: Write the failing test.** Setting ABROAD to `DIVISION` is stored and audited, and an unknown code gives `NOT_FOUND`.
- [x] **Step 2: Run it.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run it again.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): let HR set the final approval level per travel type`.

### Task 7: API routes and generic-route guards

**Files:**
- Create the routes under `apps/web/src/app/api/travel/`:
  - `route.ts` (POST)
  - `[travelId]/route.ts` (GET)
  - `[travelId]/resubmission/route.ts`
  - `[travelId]/cancellation/route.ts`
  - `decisions/route.ts`
  - `people/route.ts`
  - `types/[code]/route.ts`
  - `travel-route.ts`
  - `route.test.ts`
- Modify:
  - `apps/web/src/app/api/requests/route.ts`, `[requestId]/resubmission/route.ts`, `[requestId]/cancellation/route.ts`: refuse `official-travel`.
  - `apps/web/src/app/(app)/requests/[requestId]/page.tsx`: redirect a travel คำขอ.

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: the JSON routes in the spec's API section.
- [x] **Step 1: Write the failing route tests (mocked services, as the leave route tests do).**
  - POST without a session gives 401.
  - POST takes the leader from the session, not the body.
  - A failure gives 400 with `{ error, personId }`.
  - PUT types without `travel.manage` gives 403.
  - A decision on a non-travel คำขอ gives 404.
  - `POST /api/requests` with `official-travel` gives 400.
- [x] **Step 2: Run `pnpm --filter @backoffice/web test -- api/travel api/requests`.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run the same tests.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): add official travel API routes`.

### Task 8: Pages, module entry and copy

**Files:**
- Create under `apps/web/src/app/(app)/travel/`:
  - `layout.tsx`, `page.tsx`, `travel-page.ts`, `travel-list.tsx`
  - `mine/page.tsx`
  - `new/page.tsx`, `new/travel-form.tsx` (+ test)
  - `[travelId]/page.tsx` (+ test), `[travelId]/travel-actions.tsx`
  - `requests/[requestId]/page.tsx` (redirect)
  - `approvals/page.tsx` (+ test)
  - `all/page.tsx`
  - `settings/page.tsx`
- Create: `apps/web/src/lib/travel-labels.ts`.
- Modify:
  - `apps/web/src/lib/modules.ts`: the `official-travel` entry, href `/travel`, icon `car`, group `mine`, with an approvals badge.
  - `packages/i18n/src/th.ts`.
  - `apps/web/src/app/(app)/leave/calendar/page.tsx`: travel cells.
  - `styles.css`.
- [x] **Step 1: Write the failing page tests.**
  - The form adds the leader as a fixed first row and shows the cost total.
  - The detail page shows each member's status and shows decide buttons only where `canDecide` is true.
  - The approvals page lists the pending members.
  - The calendar shows "ไปราชการ · <place>".
- [x] **Step 2: Run `pnpm --filter @backoffice/web test -- travel leave/calendar`.** Expected: FAIL.
- [x] **Step 3: Implement the pages** with DESIGN.md components (page-heading, detail-list, leave-table-scroll, status).
- [x] **Step 4: Run the same tests.** Expected: PASS.
- [x] **Step 5: Commit** `feat(travel): add the ไปราชการ module pages`.

### Task 9: Verification and demo

- [ ] Run:
  ```bash
  pnpm lint && pnpm typecheck && pnpm test
  DATABASE_URL=… pnpm test:integration
  node --test scripts/*.test.mjs
  git diff --check
  ```
- [ ] Migrate `backoffice_demo`, build, and file a trip as nur001 with nur014. Approve as their heads, then take screenshots of the form, the detail, the approvals and the calendar.
