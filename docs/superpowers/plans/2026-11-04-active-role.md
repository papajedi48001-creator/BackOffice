# Active role — plan

Spec: `docs/superpowers/specs/2026-11-04-active-role-design.md`.

- [x] 1. Core `access/active-role.ts`: `roleChoices`, `resolveActiveRole`, `EMPLOYEE_ROLE`; test that `AuthorizationService` denies a non-active role's permission. Test: `packages/core/src/access/active-role.test.ts`.
- [x] 2. Migration `0030_active_role.sql` (`user_session.active_role`, `audit_event.actor_role`), Drizzle schema, `migrate.ts`; shared `insertAuditEvent` writes `actor_role`. Test: `packages/db/src/migrate.test.ts`, `packages/core/src/audit/audit-sql.test.ts`.
- [x] 3. `SessionService.resolve` filters roles / flags `roleSelectionRequired`; `chooseRole` validates. Test: `session-service.test.ts`.
- [x] 4. `proxy.ts` redirects/403s while pending. Test: `apps/web/src/proxy.test.ts`.
- [x] 5. `POST /api/auth/role` (+ audit, one transaction). Test: `route.test.ts`.
- [x] 6. `/choose-role` picker page + profile menu role and "เปลี่ยนบทบาท". Test: `choose-role/role-picker.test.tsx`.

Verify: `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, `grep -rn '<<<<<<<'`.
