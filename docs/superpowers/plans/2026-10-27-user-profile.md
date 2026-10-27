# User profile chip — plan

Spec: `docs/superpowers/specs/2026-10-27-user-profile-design.md`.

- [ ] Contracts: `updateOwnPersonalInputSchema`, `profilePhotoContentTypeSchema`, `MAX_PROFILE_PHOTO_BYTES`, webp attachment type (failing test in `packages/contracts/src/hr.test.ts`, `files.test.ts`).
- [ ] Migration `0017_person_photo.sql`, `migrate.ts`, Drizzle `personProfiles.photoAttachmentId`.
- [ ] Core: `updateOwnPersonal`, `setOwnPhoto`, `photoAttachmentOf`, `ProfileAccess.editPersonal`, webp signature, `openAttachment(..., { recordDownload: false })` (integration test `profile-service.integration.test.ts`, unit test `attachment-service.test.ts`).
- [ ] Web routes: `PUT /api/hr/me/personal`, `POST|DELETE /api/hr/me/photo`, `GET /api/hr/people/[personId]/photo` (route tests).
- [ ] Shell: `ShellData.profile`, `ProfileMenu` replaces `NotificationBell` (component + shell-data tests).
- [ ] `/hr/me`: personal form and photo form.
- [ ] Styles, DESIGN.md / modules.md notes.

Verify: `pnpm lint && pnpm typecheck && pnpm test`; `source /tmp/claude-0/ui.env && pnpm test:integration`; `pnpm --filter @backoffice/db migrate`; `cd apps/web && npx next build`; `git diff --check`.
