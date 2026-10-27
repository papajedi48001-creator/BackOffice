# User profile chip — plan

Spec: `docs/superpowers/specs/2026-10-27-user-profile-design.md`.

- [x] Contracts: `updateOwnPersonalInputSchema`, `profilePhotoContentTypeSchema`, `MAX_PROFILE_PHOTO_BYTES`, webp attachment type (failing test in `packages/contracts/src/hr.test.ts`, `files.test.ts`).
- [x] Migration `0017_person_photo.sql`, `migrate.ts`, Drizzle `personProfiles.photoAttachmentId`.
- [x] Core: `updateOwnPersonal`, `setOwnPhoto`, `photoAttachmentOf`, `ProfileAccess.editPersonal`, webp signature, `openAttachment(..., { recordDownload: false })` (integration test `profile-service.integration.test.ts`, unit test `attachment-service.test.ts`).
- [x] Web routes: `PUT /api/hr/me/personal`, `POST|DELETE /api/hr/me/photo`, `GET /api/hr/people/[personId]/photo` (route tests).
- [x] Shell: `ShellData.profile`, `ProfileMenu` replaces `NotificationBell` (component + shell-data tests).
- [x] `/hr/me`: personal form and photo form.
- [x] Styles, DESIGN.md / modules.md notes.

Verify: `pnpm lint && pnpm typecheck && pnpm test`; `source /tmp/claude-0/ui.env && pnpm test:integration`; `pnpm --filter @backoffice/db migrate`; `cd apps/web && npx next build`; `git diff --check`.
