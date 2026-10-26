# Visual Refresh Implementation Plan

**Spec:** docs/superpowers/specs/2026-10-26-visual-refresh-design.md

### Task 1: Module theme from path
- [x] Failing tests in `apps/web/src/lib/modules.test.ts`: `moduleCodeForPath('/dashboard')` → 'home'; '/hr/people/1' → 'hr'; '/rooms/bookings/new' → 'room-booking'; '/' → 'home'; navigation items carry `module`.
- [x] Failing test `apps/web/src/components/app-shell.test.tsx`: shell has `data-module="leave"` on a /leave path; sidebar links carry `data-module`.
- [x] Failing test in `module-launcher.test.tsx`: live tile has `data-module` of its code.
- [x] Implement; `pnpm --filter @backoffice/web test` green; commit.

### Task 2: Tokens and styling
- [x] Replace hard-coded colours in `apps/web/src/app/styles.css` with tokens; add module palette, sidebar, cards, launcher, sign-in styling.
- [x] Update `DESIGN.md` colours and module palette; `docs/integration/modules.md` note.
- [x] Screenshot dashboard, an HR page, a leave page and sign-in with Playwright against a seeded local app.
- [x] `pnpm lint && pnpm typecheck && pnpm test`, `next build`, `git diff --check`; commit.
