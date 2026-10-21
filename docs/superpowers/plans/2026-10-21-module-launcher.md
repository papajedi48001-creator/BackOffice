# Module Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` becomes a grid of module tiles with real counts. The sidebar and the tiles are both built from one module registry that module threads extend.

**Architecture:** The registry is a typed array in `apps/web/src/lib/modules.ts`. It is filtered per `AccessSubject` on the server. A pure `ModuleLauncher` component renders the groups. The counts query lives in `@backoffice/core`, next to the other MariaDB queries, so it can be tested against MariaDB.

**Tech Stack:** Next 16 App Router (server components), React, vitest + Testing Library, MariaDB via `@backoffice/db`.

**Spec:** `docs/superpowers/specs/2026-10-21-module-launcher-design.md`

The spec places `loadDashboardSummary` in `apps/web/src/lib`. This plan places it in `packages/core/src/dashboard/` instead, because the MariaDB integration-test setup lives there.

## Global Constraints

- **Groups:** order is `mine`, `people`, `services`, `governance`, then a final "โมดูลที่กำลังพัฒนา" group that holds every `planned` entry. A group with no visible entries renders no heading.
- **Planned entries:** never rendered as `<a>` or `<button>`, and never in the sidebar. They show the tag "เร็ว ๆ นี้".
- **Visibility rules:**
  - บุคลากร and หน่วยงาน: shown when the user has `hr-reader` or `hr-manager`.
  - นำเข้าข้อมูลตั้งต้น: shown when `canActHospitalWide(subject, 'hr.person.manage', 'hr')`.
  - บทบาทและสิทธิ์ and ผู้แทน: shown when the user has `hr-manager`.
  - Everything else: shown to any signed-in user.
- **Counts:** shown as "–" when they cannot be read, never as 0.
- **Notification count:** counts `channel = 'in_app'` only.
- **Pending count:** counts only the lowest-sequence `PENDING` step, ordered by `CAST(sequence AS UNSIGNED)`, of `IN_REVIEW` requests.
- **Dates:** display in Thai with the Buddhist era, in the Asia/Bangkok time zone.
- **Icons:** inline SVG with `aria-hidden="true"`. No new npm dependency.
- **DESIGN.md colors:**
  - `#0B7285` hospital-blue
  - `#0F9D8A` care-teal
  - `#C2410C` alert
  - `#D9E2EC` line
  - No gradients.
- **Logs:** only error codes, never row data.

## Review Focus

- A user with no roles must see only the `mine` and `governance` (บันทึกการตรวจสอบ) live tiles plus the planned group, and no HR links. This is pinned in Task 1.
- An `hr-manager` scoped to one unit must not see นำเข้าข้อมูลตั้งต้น. This is pinned in Task 1.
- Pending count:
  - A request whose first step belongs to someone else, and whose second step is mine, must not count for me.
  - A closed (APPROVED) request must not count.
  - Both are pinned in Task 2.
- If `DATABASE_URL` is unset, `/dashboard` must still render all tiles with "–" counts. This is pinned in Task 3.
- A `badge` function that throws must not break the page; only that badge is hidden. This is pinned in Task 3.

---

### Task 1: Module registry and sidebar from the registry

**Files:**
- Create: `apps/web/src/lib/modules.ts`
- Test: `apps/web/src/lib/modules.test.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx` (replace the hand-built `navigation` with `navigationFor(session)`; keep the unread badge on `/notifications`)
- Modify: `apps/web/src/components/app-shell.tsx` (`'use client'` nav part or a small client `SidebarNav` using `usePathname()` to set `aria-current="page"`)
- Modify: `packages/i18n/src/th.ts` (label/description keys)

**Interfaces:**
- Produces:
  - `type ModuleGroup = 'mine' | 'people' | 'services' | 'governance'`
  - `type ModuleIconName = 'requests' | 'bell' | 'people' | 'org' | 'upload' | 'shield' | 'delegate' | 'audit' | 'wrench' | 'package' | 'room' | 'car' | 'clock' | 'leave' | 'asset' | 'monitor' | 'target' | 'heart'`
  - `interface ModuleEntry`, with these fields:
    - `code: string`
    - `href: string`
    - `labelKey: MessageKey`
    - `descriptionKey: MessageKey`
    - `icon: ModuleIconName`
    - `group: ModuleGroup`
    - `status: 'live' | 'planned'`
    - `visible(subject: AccessSubject): boolean`
    - `badge?(db: Database, subject: AccessSubject): Promise<number>`
  - `moduleRegistry: readonly ModuleEntry[]`
  - `visibleModules(subject: AccessSubject): ModuleEntry[]` returns the live entries that pass `visible`, plus every planned entry.
  - `navigationFor(subject: AccessSubject): NavigationItem[]` returns `/dashboard` (label `dashboard`) first, then the live visible entries in registry order.
- Registry contents and order:
  - live:
    - `requests` (/requests, mine)
    - `notifications` (/notifications, mine)
    - `hr-people` (/hr/people, people)
    - `hr-organizations` (/hr/organizations, people)
    - `hr-import` (/hr/imports, people)
    - `access-roles` (/access/roles, governance)
    - `access-delegations` (/access/delegations, governance)
    - `audit` (/audit, governance)
  - planned, group `services`:
    - `room-booking` (/rooms)
    - `maintenance`
    - `inventory`
    - `fleet`
    - `attendance`
    - `leave`
    - `asset-register`
    - `computer-center`
    - `planning`
    - `donor-registry`
- Thai labels and descriptions: copy them from the mockup in `/tmp/claude-0/-home-claude-backoffice/7d39b10b-bbda-564b-8b86-f8ddfc9e5fc6/scratchpad/launcher/build.mjs` (for example `จองห้องประชุม` / `ตารางห้องและการจอง`).

- [ ] **Step 1: Write the failing tests** in `modules.test.ts`.
  - `it('has unique codes and hrefs')`: no duplicates in `moduleRegistry`.
  - `it('shows no HR or access modules to a user without roles')`: `navigationFor({ authenticated: true, personId: 'p', roles: [], dataOwnerModules: [] }).map(i => i.href)` equals `['/dashboard', '/requests', '/notifications', '/audit']`.
  - `it('shows people and units to hr-reader')`: the result contains `/hr/people` and `/hr/organizations`, and does not contain `/hr/imports` or `/access/roles`.
  - `it('shows import only to hospital-wide hr-manager data owners')`:
    - `roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr']` includes `/hr/imports`.
    - The same with `organizationId: 'unit-1'` and `hospitalWideDataOwnerModules: []` excludes it.
  - `it('never puts planned modules in navigation but lists them in visibleModules')`: `/rooms` is absent from `navigationFor`, and `visibleModules(...).find(m => m.code === 'room-booking')?.status` is `'planned'`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web exec vitest run src/lib/modules.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement** `modules.ts` and the i18n keys. `visible` uses `new AuthorizationService().canActHospitalWide` for import and role-name checks for the rest, exactly as in the current `layout.tsx`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Wire up the sidebar.** In `layout.tsx`, set `const navigation = navigationFor(session)`, then add `badge: unreadNotifications` to the `/notifications` item. In `SidebarNav`, set `aria-current="page"` when `pathname === href || pathname.startsWith(href + '/')`.
- [ ] **Step 6: Add a test** in `apps/web/src/components/sidebar-nav.test.tsx`. Mock `next/navigation` `usePathname` to return `'/hr/people/123'`, then expect the "บุคลากร" link to have `aria-current="page"` and the "ภาพรวม" link not to.
- [ ] **Step 7: Run** `pnpm --filter @backoffice/web test`. Expected: all pass.
- [ ] **Step 8: Commit** with the message `feat(web): build navigation from one module registry`.

### Task 2: Dashboard summary query

**Files:**
- Create: `packages/core/src/dashboard/dashboard-summary.ts`
- Test: `packages/core/src/dashboard/dashboard-summary.integration.test.ts`
- Modify: `packages/core/src/index.ts` (export it)

**Interfaces:**
- Produces:
  - `interface DashboardSummary { displayName: string | null; organizationName: string | null; pendingApprovals: number; unreadNotifications: number }`
  - `loadDashboardSummary(db: Pick<Database, 'query'>, personId: string): Promise<DashboardSummary>`
- Field sources:
  - `displayName` comes from `person.display_name`.
  - `organizationName` comes from `organization.name` of the person's active `employment_assignment`: `effective_until IS NULL OR effective_until > UTC_TIMESTAMP()`, latest `effective_from`.

- [ ] **Step 1: Write the failing integration test.** Use the `describeWithDatabase` pattern from `hr/master-data-import.integration.test.ts`.
  - Seed people `me` and `other`, an organization with an active assignment for `me`, and `display_name = 'คุณทดสอบ'`.
  - Seed requests:
    - R1 `IN_REVIEW`, step 1 PENDING for `me`. Counts.
    - R2 `IN_REVIEW`, step 1 PENDING for `other` and step 2 PENDING for `me`. Does not count.
    - R3 `APPROVED`, step 1 PENDING for `me` (stale). Does not count.
    - R4 `IN_REVIEW`, steps `'2'` APPROVED and `'10'` PENDING for `me`. Counts, which proves the numeric ordering.
  - Seed notifications for `me`: 2 `in_app` unread, 1 `in_app` read, and 1 `email` unread.
  - Expect `{ displayName: 'คุณทดสอบ', organizationName: <seeded name>, pendingApprovals: 2, unreadNotifications: 2 }`.
  - Add a second case: an unknown personId returns `{ displayName: null, organizationName: null, pendingApprovals: 0, unreadNotifications: 0 }`.
- [ ] **Step 2: Run** `DATABASE_URL=mysql://backoffice:ci-only-password@127.0.0.1:3306/backoffice pnpm --filter @backoffice/core exec vitest run src/dashboard`. Expected: FAIL, because the import does not resolve.
- [ ] **Step 3: Implement** the pending count as a single query. For each `IN_REVIEW` request, take the PENDING step with the minimum `CAST(sequence AS UNSIGNED)` and keep it when `JSON_VALUE(assignee_snapshot, '$.personId') = ?`. Wrap counts in `Number(...)`.
- [ ] **Step 4: Run** the same command. Expected: PASS, 2 tests.
- [ ] **Step 5: Commit** with the message `feat(core): count a person's pending approvals and unread notifications`.

### Task 3: Launcher UI on the dashboard

**Files:**
- Create: `apps/web/src/components/module-icon.tsx`
- Create: `apps/web/src/components/module-launcher.tsx`
- Test: `apps/web/src/components/module-launcher.test.tsx`
- Create: `apps/web/src/lib/dashboard-badges.ts`
- Test: `apps/web/src/lib/dashboard-badges.test.ts`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/styles.css`
- Modify: `packages/i18n/src/th.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `ModuleEntry`, `ModuleGroup`, `ModuleIconName`, `visibleModules`
  - from Task 2: `DashboardSummary`, `loadDashboardSummary`
- Produces:
  - `ModuleIcon({ name }: { name: ModuleIconName })`: uses the SVG paths from the mockup's `icons.mjs`.
  - `ModuleLauncher({ modules, badges, summary, today })`, where:
    - `modules: ModuleEntry[]`
    - `badges: Record<string, number | undefined>`, keyed by module code
    - `summary: Pick<DashboardSummary, 'displayName' | 'organizationName'> & { pendingApprovals: number | null; unreadNotifications: number | null }`
    - `today: Date`
  - `collectBadges(modules: ModuleEntry[], db: Database, subject: AccessSubject): Promise<Record<string, number | undefined>>` uses `Promise.allSettled`; a rejected badge becomes `undefined`.
- Thai copy:
  - Group headings: `งานของฉัน`, `บุคลากรและองค์กร`, `งานบริการ`, `ความปลอดภัยและการตรวจสอบ`, `โมดูลที่กำลังพัฒนา`.
  - Planned tag: `เร็ว ๆ นี้`.
  - Greeting: `สวัสดี คุณ{name}`, or `สวัสดี` when there is no name.
  - Stats: `คำขอรอพิจารณา`, `การแจ้งเตือนยังไม่อ่าน`.
  - Badge `aria-label`: `{n} รายการรอดำเนินการ`.
- Date: `new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { dateStyle: 'full', timeZone: 'Asia/Bangkok' })`.
- Badges on tiles:
  - `requests` tile: `summary.pendingApprovals`.
  - `notifications` tile: `summary.unreadNotifications`.
  - Other tiles: `badges[code]`, shown only when the value is greater than 0.

- [ ] **Step 1: Write the failing component tests.**
  - `it('links live modules and does not link planned ones')`: `getByRole('link', { name: /ทะเบียนบุคลากร/ })` has `href="/hr/people"`; `queryByRole('link', { name: /จองห้องประชุม/ })` is null; `getByText('จองห้องประชุม').closest('[aria-disabled="true"]')` is not null.
  - `it('hides headings of empty groups')`: with only `requests` and planned modules, there is no heading `บุคลากรและองค์กร`.
  - `it('shows a dash when counts are unavailable')`: with `pendingApprovals: null`, the link `/requests` inside the hero contains `–`.
  - `it('greets by name and shows the Buddhist-era date')`: with `displayName: 'สมชาย ใจดี'` and `today: new Date('2026-10-21T03:00:00Z')`, the page shows `สวัสดี คุณสมชาย ใจดี` and text matching `/21 ตุลาคม 2569/`.
- [ ] **Step 2: Write the failing `collectBadges` test.** Two modules: one badge resolves to 4 and one throws. Expect `{ a: 4, b: undefined }`.
- [ ] **Step 3: Run** `pnpm --filter @backoffice/web exec vitest run src/components/module-launcher.test.tsx src/lib/dashboard-badges.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the components, `collectBadges`, and the CSS.
  - Port the `.launcher-*`, `.hero-*`, `.module-*` and `.soon-tag` rules from the mockup's `build.mjs`. Use the vertical tile layout.
  - Mobile at 720px or narrower: 2 columns, descriptions hidden.
  - Planned tiles render as `<div aria-disabled="true">` inside `<li>`.
- [ ] **Step 5: Update `dashboard/page.tsx`.**
  - Read the session and redirect to `/` when there is none.
  - If `DATABASE_URL` and `personId` are set, call `loadDashboardSummary` and `collectBadges`.
  - On error, `console.error('dashboard_summary_failed')` and use null counts.
  - Render `ModuleLauncher` with `today = new Date()`.
- [ ] **Step 6: Run** `pnpm --filter @backoffice/web test`. Expected: all pass.
- [ ] **Step 7: Commit** with the message `feat(web): show modules as an icon launcher on the main page`.

### Task 4: Sign-in button, DESIGN.md, screenshots, verification

**Files:**
- Modify: `apps/web/src/app/styles.css` (`.sign-in-form > button[type="submit"]`)
- Modify: `DESIGN.md` (the launcher exception)
- Modify: `docs/integration/modules.md` (registry shape, if it changed)
- Modify: `CONTEXT.md` (term "หน้าหลัก / ตัวเรียกโมดูล", if missing)

- [ ] **Step 1: Style the sign-in button.**
  - `background: #0b7285; color: #fff; border: 0; border-radius: 8px; padding: 11px 20px; font-weight: 700; cursor: pointer; min-height: 44px;`
  - Hover: `#095c6b`.
- [ ] **Step 2: Add a DESIGN.md exception.** Under Elevation & Depth, add: "หน้าหลักใช้ตารางปุ่มโมดูลได้: ขอบเส้น line มุม 12px เงาเบาเฉพาะตอน hover ไม่มี gradient หน้าทำงานอื่นยังไม่ใช้ card จำนวนมาก".
- [ ] **Step 3: Run the full verification** and record the real output:
  - `pnpm lint && pnpm typecheck && pnpm test`
  - `DATABASE_URL=mysql://backoffice:ci-only-password@127.0.0.1:3306/backoffice pnpm test:integration`
  - `bash infra/backup/restore-verify.test.sh`
  - `git diff --check`
  - `pnpm --filter @backoffice/web build`
- [ ] **Step 4: Take screenshots.**
  - Rebuild, then start `next start` on port 3100 against `backoffice_demo`.
  - Sign in as `hr.demo`.
  - Capture `/` (sign-in) and `/dashboard` at 1440×900 and 390×844 to `/mnt/project-files/screenshots/2026-10-21/launcher-real-*.png`.
  - Compare them against the mockups.
- [ ] **Step 5: Commit** with the message `style(web): style sign-in button and document the launcher`.
