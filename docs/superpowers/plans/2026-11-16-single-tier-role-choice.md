# Single-tier role choice — plan

Spec: `docs/superpowers/specs/2026-11-16-single-tier-role-choice-design.md`

- [ ] Task 1 (core): `resolveActiveRole` requires a choice for one tier too. Failing test in
      `packages/core/src/access/active-role.test.ts`. Verify: `pnpm --filter @backoffice/core test -- active-role`.
- [ ] Task 2 (web): `/choose-role` serves one tier; shell offers "เปลี่ยนบทบาท" for one tier. Failing tests in
      `apps/web/src/app/choose-role/page.test.tsx` and a new `apps/web/src/lib/shell-role.test.ts` for the extracted
      `shellRole(session)`. Verify: `pnpm --filter @backoffice/web test -- choose-role shell-role`.
- [ ] Task 3: full `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`.
