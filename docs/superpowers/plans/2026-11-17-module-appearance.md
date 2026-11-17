# Plan: สีและไอคอนของโมดูล

Spec: `docs/superpowers/specs/2026-11-17-module-appearance-design.md`

- [x] **1. Contracts:** add `moduleIconNames`, `moduleIconSchema`, `moduleAccentPalette`, `moduleAccentSchema` and `adminModuleAppearanceInputSchema` to `packages/contracts/src/admin.ts`.
  - Test: `admin.test.ts` accepts a palette colour and a known icon, and rejects `#123456`, `red;}` and an unknown icon.
- [x] **2. Migration and Drizzle schema:** add `0040_module_appearance.sql` (ADD COLUMN IF NOT EXISTS), list it in `migrate.ts`, and add the columns to `schema/admin.ts`.
- [x] **3. Core:** add `AdminService.setModuleAppearance` and `AdminQueries.moduleAppearance`.
  - Test: `admin-service.integration.test.ts` checks the upsert, the audit metadata, no change when nothing changed, the reset to null, and that bad stored values are dropped. It runs with `DATABASE_URL`.
- [x] **4. API:** add `PUT /api/admin/modules/[code]/appearance`.
  - Test: `route.test.ts`-style cases for 403 for a non-admin, 404 for an unknown module, 400 for an off-palette colour, and 200 calling the service.
- [x] **5. Web read and apply:** add `lib/module-appearance.ts` with `readModuleAppearance`, `withAppearance(modules, appearance)` and `appearanceCss(appearance)`. Wire them into the layout, `shell-data`, the dashboard and the admin modules page.
  - Test: `module-appearance.test.ts` checks that the CSS only names palette colours and that icons are replaced.
- [x] **6. Dialog:** add the palette button and a `ModuleAppearanceDialog` in `module-settings.tsx`, with the preview, the "เดิม" options and save.
  - Test: `module-settings.test.tsx` opens the dialog, picks a colour and an icon, saves, and checks the PUT body.
- [x] **7. Audit label, DESIGN.md and CSS tests.**
- [x] **8. Verify:** run `pnpm lint && pnpm typecheck && pnpm test` and `git diff --check`. The integration suites run in CI, which has MariaDB.
