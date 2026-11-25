# Plan: เมนูซ้ายลากปรับขนาด + แท็บขอบ

Spec: `docs/superpowers/specs/2026-11-25-sidebar-resize-design.md`

- [x] Task 1: `apps/web/src/lib/sidebar-width.ts` + `sidebar-width.test.ts` — failing tests for clamp (≤170 → 92, >360 → 360), cookie parse/serialize (bad values → defaults), toggle (rail → last wide, wide → rail). Verify: `pnpm --filter @backoffice/web exec vitest run src/lib/sidebar-width.test.ts`
- [x] Task 2: `components/sidebar-edge.tsx` + test — failing tests: tab button labelled ย่อเมนู/ขยายเมนู with aria-expanded, click toggles, separator arrows change width, Ctrl B toggles but not inside an input. Verify: `vitest run src/components/sidebar-edge.test.tsx`
- [x] Task 3: `ShellFrame`/`AppShell`/layout wiring + cookie; `SidebarNav` `.nav-label` + re-place pills on resize. Tests: app-shell renders `--sidebar-w` from prop and `data-sidebar="rail"` for a narrow width. Verify: `vitest run src/components/app-shell.test.tsx src/components/sidebar-nav.test.tsx`
- [x] Task 4: CSS in `styles.css` (grid column from `--sidebar-w`, edge + tab, rail rules, mobile hides edge) + `styles-sidebar.test.ts` assertions. Verify: `vitest run src/app/styles-sidebar.test.ts`
- [x] Task 5: DESIGN.md section for the resizable menu.
- [x] Verify all: `pnpm lint && pnpm typecheck && pnpm test` and `git diff --check`
