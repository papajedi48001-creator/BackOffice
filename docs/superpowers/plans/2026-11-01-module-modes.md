# Module modes and tester role — plan

Spec: `docs/superpowers/specs/2026-11-01-module-modes-design.md`. (Superpowers skills followed by hand.)

## Task 1: contracts and core — modes, tester roles, service
Files: `packages/contracts/src/admin.ts`, `packages/core/src/admin/*`, `packages/core/src/audit/redact.ts`, `packages/db/migrations/0021_module_mode.sql`, `packages/db/src/migrate.ts`, `packages/db/src/schema/admin.ts`.
Interfaces: `moduleModeSchema`, `ModuleMode`, `testerModuleCodes`, `moduleTesterRoles`, `canUseModule(subject, code, mode)`, `AdminQueries.moduleModes()`, `AdminService.setModuleMode()`.
- [ ] Failing unit test `module-managers.test.ts` for `canUseModule` and tester roles
- [ ] Failing integration test for `setModuleMode` (audit from/to, locked admin, enabled kept in step)
- [ ] Implement; `pnpm --filter @backoffice/core test`

## Task 2: web gate — proxy, layout, menu
Files: `apps/web/src/lib/module-gate.ts`, `proxy.ts`, `lib/modules.ts`, `components/module-layout.tsx`, `lib/shell-data.ts`, dashboard page.
- [ ] Failing tests in `proxy.test.ts` (DEVELOPMENT refused for others, allowed for tester) and `modules.test.ts` (`usableModules`, planned admin only)
- [ ] Implement

## Task 3: UI — settings three-way control, tester grants, launcher, sidebar, rename
- [ ] Failing tests: `module-settings.test.tsx`, `grants-manager.test.tsx`, `module-launcher` flat grid / dev marker, `sidebar-nav.test.tsx` หน้าหลัก
- [ ] Implement, Thai copy in `packages/i18n/src/th.ts`

## Task 4: docs and verification
- [ ] DESIGN.md, CONTEXT.md, docs/integration/modules.md
- [ ] `pnpm lint && pnpm typecheck && pnpm test`; integration on fresh DB; migrate; `next build`; `git diff --check`; screenshots
