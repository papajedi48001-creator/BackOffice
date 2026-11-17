# Plan: people export and search box

Spec: `docs/superpowers/specs/2026-11-17-people-export-design.md`

- [x] Task 1: `apps/web/src/lib/people-filter.ts` `filterPeople(people, criteria)`; PeopleTable uses it. Test: `pnpm --filter @backoffice/web exec vitest run src/lib/people-filter.test.ts`.
- [x] Task 2: `packages/core/src/hr/people-export.ts` `peopleCsv`, `exportPeople` (audit `hr.people.export` in a transaction). Test: `pnpm --filter @backoffice/core exec vitest run src/hr/people-export.test.ts`.
- [x] Task 3: `POST /api/hr/people/export` with `canActHospitalWide(session, 'data.export', 'hr')` and the `hr.person.read` scope. Test: `pnpm --filter @backoffice/web exec vitest run src/app/api/hr/people/export`.
- [x] Task 4: ส่งออกข้อมูล button in PeopleTable (shown when `canExport`), downloads via fetch + blob. Test: people-table and page tests.
- [x] Task 5: search box in the design the user picks.
- [x] Task 6: verify `pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`, screenshots 1280/390.
