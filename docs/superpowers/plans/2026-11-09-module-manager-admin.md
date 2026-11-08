# Module manager = admin within own module — plan

Spec: `docs/superpowers/specs/2026-11-09-module-manager-admin-design.md`.

- [x] Task 1 — contracts `permissionModules` map (`packages/contracts/src/access.ts`); test: every permission mapped (`packages/contracts/src/access.test.ts`).
- [x] Task 2 — core `access/module-manager-scope.ts` (`moduleManagerRoles`, `managedModules`, `managesModule`, `managesPermission`) used in `AuthorizationService`; failing table test per module in `authorization-service.test.ts`.
- [x] Task 3 — `canGrantRole` (`admin/module-managers.ts`) + web routes POST/DELETE single role use it; tests in `module-managers.test.ts`, `apps/web/src/app/api/admin/route.test.ts`.
- [x] Task 4 — `profileAccess` treats the hr ผู้จัดการ as owning HR data; update tests that asserted the old gate.
- [x] Task 5 — CONTEXT.md, DESIGN.md, CLAUDE.md.

Verify: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, `git grep -nE '^(<<<<<<<|>>>>>>>)'`.
