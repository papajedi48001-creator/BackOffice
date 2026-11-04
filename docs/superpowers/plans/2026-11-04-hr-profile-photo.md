# HR profile photo upload — plan

**Spec:** docs/superpowers/specs/2026-11-04-hr-profile-photo-design.md

- [ ] Task 1: `HrProfileService.setPersonPhoto` — failing integration test in `packages/core/src/hr/profile-service.integration.test.ts` (HR sets/removes, audit actor is HR; refuses reader, file by someone else, PDF), then implement. Verify: `pnpm --filter @backoffice/core test:integration -- profile-service`.
- [ ] Task 2: POST/DELETE `apps/web/src/app/api/hr/people/[personId]/photo/route.ts` — failing tests in `route.test.ts` (401, 503 without storage, 415 type, 201 upload calls setPersonPhoto with actor, DELETE passes null, 403 mapping). Verify: `pnpm --filter @backoffice/web test -- people/\[personId\]/photo`.
- [ ] Task 3: ProfileForm photo picker — failing test in the profile view test (picker at top of popup; save uploads to `/api/hr/people/<id>/photo` then PUTs profile; remove checkbox sends DELETE). Verify: `pnpm --filter @backoffice/web test -- hr-profile`.
- [ ] Verify all: `pnpm lint && pnpm typecheck && pnpm test`, integration with DATABASE_URL, `git diff --check`.
