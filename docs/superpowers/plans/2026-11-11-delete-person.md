# ลบบุคลากร — plan
**Spec:** docs/superpowers/specs/2026-11-11-delete-person-design.md
- [ ] Task 1: migration 0035 + schema + migrate test count; `deletePerson` with failing integration test in person-account-service.integration.test.ts; HrDirectory.listPeople and HrProfileService.get skip deleted. Verify: core integration for person-account-service, hr-directory, profile-service.
- [ ] Task 2: DELETE route in apps/web/src/app/api/hr/people/[personId]/route.ts with failing route test (200, 403, 409, 404).
- [ ] Task 3: DeletePersonButton (ActionDialog) on person page; failing component test.
- [ ] Verify: pnpm lint && pnpm typecheck && pnpm test; integration with DATABASE_URL; git diff --check.
