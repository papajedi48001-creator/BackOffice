# Room booking dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A month calendar dashboard for meeting rooms with click-through details, plus the module section bar.
**Architecture:** Pure month-grid helper in web, one viewer-aware calendar query in core, a client month calendar with a native dialog, ModuleLayout sections in the registry.
**Tech Stack:** Next.js App Router, React, Vitest + Testing Library, MariaDB.
**Spec:** `docs/superpowers/specs/2026-11-02-room-booking-dashboard-design.md`

## Global Constraints
- Thai copy in `packages/i18n/src/th.ts`; colours only through module tokens (`--accent*`, `--line`, …).
- Never send another person's personId to the browser; `canOpen` is computed on the server.
- Bangkok dates; months as `YYYY-MM`; invalid month falls back to the current month.

## Review Focus
- Invalid `month` (e.g. `2026-13`) must not 500 → current month.
- A month starting on Sunday / ending on Monday still renders full Mon–Sun weeks.
- A day with more than 3 bookings shows "+N" linking to the day view.
- Someone who is neither booker nor approver sees no "open details" link.
- Multi-day bookings appear on each active day.

### Task 1: month grid helper
**Files:** Create `apps/web/src/app/(app)/rooms/month-grid.ts`, test `month-grid.test.ts`
**Produces:** `monthGrid(params: { month?: string }, today: string): { month; weeks: { date; inMonth; isToday; isPast }[][]; previous; next; first; last }`
- [x] failing test (weeks start Monday, cover whole month, invalid month → today's month, prev/next across years)
- [x] implement, pass, commit

### Task 2: viewer-aware calendar query
**Files:** Modify `packages/core/src/rooms/room-booking-queries.ts`, integration test
**Produces:** `calendarForViewer(from: Date, to: Date, actor: RoomActor, roomId?: string): Promise<RoomCalendarViewerEntry[]>` with `roomPlace`, `canOpen`
- [x] failing integration test (booker and scoped approver canOpen, others not)
- [x] implement, pass, commit

### Task 3: month calendar component with detail dialog
**Files:** Create `apps/web/src/app/(app)/rooms/dashboard/room-month-calendar.tsx` + test
- [x] failing tests (entries under their day, +N link, dialog shows details, link only when canOpen)
- [x] implement, pass, commit

### Task 4: dashboard page, sections, layout, move week calendar
**Files:** `rooms/layout.tsx`, `rooms/page.tsx` (ModuleIndex), `rooms/dashboard/page.tsx`, `rooms/calendar/page.tsx`, `lib/modules.ts`, styles, i18n
- [ ] failing registry test (room-booking sections and approver badge on approvals tab)
- [ ] implement, pass, commit

### Verification
`pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… pnpm test:integration` on MariaDB 11.8, web build, Playwright screenshots of `/rooms/dashboard`.
