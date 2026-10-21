# Module Sections Implementation Plan

**Goal:** one launcher tile and one sidebar item per module; sub-pages appear as a section bar inside the module.

**Spec:** docs/superpowers/specs/2026-10-21-module-sections-design.md

## Global Constraints
- Server pages keep their own authorization checks; visibility only hides links.
- Thai copy lives in `packages/i18n/src/th.ts`.

### Task 1: Registry sections
- [x] Failing tests in `apps/web/src/lib/modules.test.ts`: navigation shows `/hr` (not `/hr/people`) for hr-reader, `/access` for hr-manager, nothing for a user without roles; `moduleSections('hr', hrReader)` returns people and organizations only; import section only for hospital-wide hr data owners.
- [x] Implement `ModuleSection`, `sections`, `moduleSections(code, subject)`; module `visible` = any section visible.
- [x] Update launcher test fixture code `hr-people` → `hr`.
- [x] `pnpm --filter @backoffice/web test` passes; commit.

### Task 2: Section bar and module layouts
- [x] Failing test `apps/web/src/components/module-subnav.test.tsx`: renders given sections as links, marks the current one `aria-current="page"` for nested paths.
- [x] Implement `ModuleSubnav`; `hr/layout.tsx`, `access/layout.tsx` render it from `moduleSections`; `hr/page.tsx`, `access/page.tsx` redirect to the first visible section or show `hrNoAccess`.
- [x] Update `docs/integration/modules.md` section 1.
- [x] `pnpm lint && pnpm typecheck && pnpm test`; commit.
