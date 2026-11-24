# Sticky table headers — plan

Spec: `docs/superpowers/specs/2026-11-24-sticky-table-headers-design.md`

## Task 1 — pure helpers `apps/web/src/lib/sticky-table-head.ts`
- [ ] Failing test `sticky-table-head.test.ts`: `headShift` (0 above chrome, follows page, clamps at table/box bottom), `findScrollContainer` (null without overflow ancestor; finds overflow-x auto / hidden wrapper; table itself), `stickyChromeBottom` (max of sticky top + height).
- [ ] Implement; `pnpm --filter @backoffice/web exec vitest run src/lib/sticky-table-head.test.ts`

## Task 2 — CSS pattern `apps/web/src/app/styles.css`
- [ ] Failing test `app/styles-tables.test.ts`: `thead` sticky with shift transform, page variant uses `--table-sticky-top`, `table` never `overflow: hidden`, no per-th sticky top in `.money-table-wrap`, print resets.
- [ ] Implement CSS.

## Task 3 — `components/sticky-table-headers.tsx` mounted in `app/layout.tsx`
- [ ] Failing test: marks a page-level table `page`, a wrapped table `box`, sets `--table-sticky-top`; root layout renders `<StickyTableHeaders />`.
- [ ] Implement.

## Task 4 — DESIGN.md rule + real-browser check
- [ ] DESIGN.md กฎตาราง
- [ ] Playwright screenshots (page scroll and box scroll, 1280 and 390) with real `styles.css` + compiled helper

## Verify
`pnpm lint && pnpm typecheck && pnpm test`, `git diff --check`
