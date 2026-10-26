# Hospital head shown as ผู้อำนวยการ — plan

Spec: `docs/superpowers/specs/2026-10-26-hr-director-label-design.md`

## Task 1: head labels follow the unit type

Files: `apps/web/src/lib/organization-unit-type.ts` (`headLabelKeys(unitType)`), `packages/i18n/src/th.ts` (director keys), the two organization pages and `organization-forms.tsx`, their tests, `CONTEXT.md`.

Interface: `headLabelKeys(unitType: OrganizationUnitType | null | undefined)` returns the i18n keys `{ head, none, inactive, newHead, startDate, assign, history, noHistory }`.

- [x] Failing tests: the list page shows `ผู้อำนวยการ นพ.สมชาย ใจดี` and `ผู้อำนวยการพ้นสภาพ` for a hospital; the detail page shows ผู้อำนวยการ labels and the `ตั้งเป็นผู้อำนวยการ` button for a hospital while a division keeps หัวหน้า.
  Run: `pnpm --filter @backoffice/web exec vitest run src/app/\(app\)/hr/organizations` — Expected: FAIL on the new texts.
- [x] Implement the helper and keys and use them in the pages and form.
  Run the same command — Expected: PASS.
- [x] Verify: `pnpm lint && pnpm typecheck && pnpm test` and `git diff --check`.
- [x] Commit: `feat(hr): show the hospital head as ผู้อำนวยการ`.
