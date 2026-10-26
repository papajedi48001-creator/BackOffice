# Menu Badges, Notification Bell and คำขอ Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every menu with waiting work shows a red count, a bell at the top right lists the newest notices, and the คำขอ page lists what waits on the person and is hidden when it would be empty.

**Architecture:** Core gains `RequestInboxQueries`, which lists pending approvals, counts them, and says whether a person has any คำขอ activity. Approval and room-booking notices get "<action> > <who>" subjects. The web `ModuleEntry` gains an optional async `available` check plus a badge on คำขอ and การแจ้งเตือน. The protected layout computes the sidebar badges and the bell items once per request.

**Tech Stack:** Next.js 16 App Router, MariaDB via mysql2, vitest.

**Spec:** docs/superpowers/specs/2026-10-26-notification-badges-bell-design.md

## Global Constraints
- Subjects never contain a decision reason, a national ID or a token.
- Workflow transitions, audit events and outbox events stay in one transaction.
- Display Asia/Bangkok time.
- A badge that fails or stalls is left out; the page still renders.

## Review Focus
- Someone who is a ผู้แทน decides: the subject names the delegate's position, not the assignee's.
- `position_title` is NULL: the subject uses ผู้อนุมัติ.
- A notice whose target is gone, or that someone else owns: the existing read route still answers 404 and the bell does nothing.
- The database is unavailable in the layout: no badges, an empty bell, and the page still renders.
- A person with no activity who opens `/requests` directly still gets the page.

---

### Task 1: Decision subjects name the action and the actor
**Files:** packages/core/src/workflow/approval-service.ts, request-service.ts (optional `getPositionTitle`), database-workflow-repository.ts, approval-service.test.ts; packages/core/src/rooms/room-booking-service.ts and its tests.
- [ ] Test: approving step 1 of 2 sends the requestor "อนุมัติ > หัวหน้ากลุ่มการพยาบาล" and the next approver "มีคำขอรอพิจารณา".
- [ ] Test: rejecting sends "ไม่อนุมัติ > <title>", returning sends "ส่งกลับแก้ไข > <title>", and a NULL title gives "ผู้อนุมัติ".
- [ ] Test: a room decision subject reads "อนุมัติ > ผู้รับผิดชอบ (<ref>)".
- [ ] Run `npx vitest run src/workflow src/rooms`, then implement and see it pass.
- [ ] Commit: feat(notifications): say what was decided and by whom.

### Task 2: RequestInboxQueries
**Files:** packages/core/src/workflow/request-inbox-queries.ts (+ an integration test) and the index export.
- `pendingFor(personId): Promise<Array<{ requestId; reference; moduleCode; requestorName: string | null; submittedAt: string }>>` uses the same rule as dashboard pendingApprovals, so the lowest pending step must be theirs.
- `pendingCount(personId): Promise<number>`.
- `hasActivity(personId): Promise<boolean>` is true when they own a request or appear in any approval_step.
- `requestHref(moduleCode, requestId): string` returns notificationTarget's targetPath, or `/requests/<id>`.
- [ ] Integration tests for each, failing first, then passing.
- [ ] Commit: feat(requests): list the requests waiting on a person.

### Task 3: คำขอ page inbox and hiding
**Files:** apps/web/src/app/(app)/requests/page.tsx (+ test), lib/modules.ts (`available?`, badges on requests and notifications), dashboard page, module-launcher.
- [ ] Test: the page shows a "รอฉันพิจารณา" row with a [การลา] label that links to /leave/requests/<id>.
- [ ] Test: visibleModules leaves out requests when `available` resolves false.
- [ ] Commit: feat(requests): show what waits on me and hide an empty คำขอ menu.

### Task 4: Sidebar red counts and the bell
**Files:** app/(app)/layout.tsx, components/app-shell.tsx, components/notification-bell.tsx (+ test), lib/unread-notifications.ts (`readRecentNotifications`), styles.css, i18n.
- [ ] Test: the bell shows the unread count, opens a panel with "[การลา] > [อนุมัติ > …]", and clicking a notice calls PATCH and then routes to the href.
- [ ] Test: the layout gives each sidebar item its badge.
- [ ] Commit: feat(shell): red counts on menus and a notification bell.

### Verification
`pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=… pnpm test:integration`, `git diff --check`, and screenshots of the demo.
