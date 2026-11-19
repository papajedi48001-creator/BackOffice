# Smart Money vertical charts Implementation Plan

**Goal:** every Smart Money chart draws upright bars with a value axis, gridlines and slanted labels.
**Spec:** docs/superpowers/specs/2026-11-19-smart-money-vertical-charts-design.md

### Task 1: value scale
- [x] Test `apps/web/src/components/chart-scale.test.ts`: `niceScale(8_000_000)` → ticks 0, 2, 4, 6, 8 ล.; `niceScale(2_750_000)` → step 500,000, top 3,000,000; `niceScale(0)` → top 1; `axisLabel(2_500_000)` = `2.5 ล.`, `axisLabel(500_000)` = `500,000`.
- [x] Implement `niceScale(max: number): { top: number; ticks: number[] }` and `axisLabel(value: number): string` in `chart-scale.ts`.

### Task 2: BarChart and GroupedBarChart upright with axis
- [x] Update component tests: no `data-orientation`; fills sized against axis top; axis ticks rendered `aria-hidden`; values stay as hidden text; alert text visible; `axisTitle` shown.
- [x] Shared `ChartFrame` (`chart-frame.tsx`) renders axis, gridlines and the scrolling bars area; both charts use it. Remove `orientation` from callers.
- [x] CSS in `styles.css`; DESIGN.md Smart Money line updated.

### Verify
`pnpm lint && pnpm typecheck && pnpm test`; screenshots of nhso, dental, fdh, disability, ttm, herb at 1280 and 390.
