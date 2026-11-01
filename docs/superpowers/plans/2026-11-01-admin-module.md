# โมดูลผู้ดูแลระบบ — implementation plan

Spec: `docs/superpowers/specs/2026-11-01-admin-module-design.md`. Superpowers skills were followed by hand.

Verification for every task: `pnpm lint && pnpm typecheck && pnpm test`; integration tasks also
`DATABASE_URL=mysql://backoffice:<password>@127.0.0.1:3306/backoffice_admin_it pnpm test:integration`.

## Task 1 — admin passes every permission check
- Files: `packages/core/src/access/authorization-service.ts`, `policy.ts`, tests beside them.
- Interface: `isAdmin(subject)`, `ADMIN_ROLE = 'admin'`; `canAccess`/`organizationScope`/`canActHospitalWide` allow an unscoped `admin`; new roles `leave-manager`, `travel-manager`.
- Failing test first: admin (no data owner) → `canManageLeave`, `canManageFleet`, `canActHospitalWide('hr.person.manage','hr')` true; admin scoped to a unit is not admin.
- [x] test fails → implement → passes

## Task 2 — module settings and grants (DB)
- Files: `packages/db/migrations/0020_admin_module.sql`, `packages/db/src/migrate.ts`, `packages/db/src/schema/admin.ts` (+ index export), `packages/core/src/admin/{module-managers,admin-service,admin-queries}.ts`, contracts `admin.ts`, redact allowlist `roleName`.
- Interface: `AdminService.setModuleEnabled(actor, code, enabled)`, `grantRole(actor, personId, roleName)`, `revokeRole(actor, personId, roleName)`, `setPersonRoles(actor, personId, roleNames[])`; `AdminQueries.disabledModules()`, `grants()`, `managersOf(code)`, `activePeople()`.
- Failing integration test first: grant/revoke writes role_assignment + audit in one transaction; last admin refused; admin module cannot be disabled; disable writes setting + audit.
- [x] test fails → implement → passes

## Task 3 — seed first admin IT001
- Files: `packages/core/src/dev/local-demo-seed.ts`, its integration test.
- Failing test first: after seeding, `it001` exists, person นายจีระศักดิ์ หอกคำ holds `admin`, and a second run creates nothing new.
- [x] test fails → implement → passes

## Task 4 — registry, disabled modules, proxy
- Files: `apps/web/src/lib/modules.ts` (+test), `apps/web/src/lib/module-gate.ts` (+test), `apps/web/src/proxy.ts`, `apps/web/src/lib/shell-data.ts`, `app/(app)/module-disabled/page.tsx`, styles.css.
- Failing test first: `moduleForPath('/api/rooms/x')` = `room-booking`; `gateDecision` refuses disabled module pages/APIs and never `admin`; admin entry visible only to admins; disabled modules filtered from navigation.
- [x] test fails → implement → passes

## Task 5 — admin APIs and pages
- Files: `apps/web/src/app/api/admin/**/route.ts` (+ route test), `app/(app)/admin/**`, `components/form-dialog.tsx` (FormDialog), i18n keys `admin*`, audit labels.
- Failing test first: API refuses non-admin with 403 and maps `LAST_ADMIN` to 409; page tests render lists.
- [x] test fails → implement → passes

## Task 6 — docs and verification
- DESIGN.md colour row, modules.md migration row 0020 (renumbered: 0019 went to hr_position on main), CONTEXT.md ผู้จัดการโมดูล / ผู้ดูแลระบบ, restore-verify table.
- [x] lint, typecheck, unit, integration, migrate, next build, `git diff --check`, screenshots
