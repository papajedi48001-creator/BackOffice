# Plan: สวิตช์การเข้าสู่ระบบด้วยรหัสผ่าน

Spec: `docs/superpowers/specs/2026-11-16-password-sign-in-switch-design.md`

## Task 1: core — โหมดรหัสผ่านใน SignInSettingsService
Files: `packages/core/src/identity/sign-in-settings-service.ts`, `.test.ts`
Interface: `type PasswordSignInMode = 'AUTO' | 'ON' | 'OFF'`; `routes()` adds `passwordMode`; `view()` adds `password: { mode, updatedAt: string | null, updatedByName: string | null }`; `savePasswordMode(mode, actorPersonId): Promise<SignInSettingSaveResult>`.
- [x] Failing tests: default AUTO; save ON/OFF + audit `{method:'PASSWORD',fromMode,toMode}` in one transaction; OFF refused with LAST_SIGN_IN_ROUTE when no route ready; PASSWORD row does not count as `configured`.
- [x] Implement, `pnpm --filter @backoffice/core test sign-in-settings`

## Task 2: web lib — passwordSignInOpen follows the mode
Files: `apps/web/src/lib/password-sign-in.ts`, `.test.ts`, `password-sign-in-env.test.ts`, `sign-in-settings.ts`
- [x] Failing tests: ON opens with SSO ready; OFF closes with no SSO; override on beats OFF; AUTO unchanged.
- [x] Implement.

## Task 3: contracts + API `PUT /api/admin/sign-in-settings/password`
Files: `packages/contracts/src/admin.ts`, `apps/web/src/app/api/admin/sign-in-settings/password/route.ts`, `.test.ts`
- [x] Failing tests: non-admin 403; bad mode 400; LAST_SIGN_IN_ROUTE 409; ok clears cache.
- [x] Implement.

## Task 4: admin UI card (mode-switch + ActionDialog)
Files: `apps/web/src/app/(app)/admin/sign-in/sign-in-settings.tsx`, `page.tsx`, `.test.tsx`, `packages/i18n/src/th.ts`
- [x] Failing tests: shows three buttons with current pressed; reason text; confirm dialog shows from → to; date shown as `16 พ.ย. 2569 15:20`.
- [x] Implement.

## Task 5: related features follow the effective state
Files: `apps/web/src/app/api/auth/password/route.ts`, `apps/web/src/app/api/hr/people/[personId]/password/route.ts`, `apps/web/src/app/change-password/page.tsx`, `apps/web/src/app/(app)/hr/me/page.tsx`, `apps/web/src/app/(app)/hr/people/[personId]/page.tsx`, `apps/web/src/components/hr-account-forms.tsx` + tests
- [x] Failing tests: both APIs 403 `password_sign_in_off` when closed; AccountForm hides reset/change when `passwordOpen=false`.
- [x] Implement.

## Verification
`pnpm lint && pnpm typecheck && pnpm test` · `git diff --check`
