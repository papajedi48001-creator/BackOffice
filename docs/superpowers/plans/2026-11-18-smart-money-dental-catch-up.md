# Smart Money dental catch-up (round 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Make `/money/dental` behave like the latest legacy page.
**Spec:** `docs/superpowers/specs/2026-11-18-smart-money-dental-catch-up-design.md`

## Global Constraints
- HOSxP is read-only; constants (icodes) may be inlined, dates are bound parameters.
- Money once per visit; ลูกหนี้ never negative.

## Review Focus
1. Visit with no main diagnosis → row with empty Diag หลัก, counted under "" in Top 10 like legacy.
2. Paid more than total → ลูกหนี้ 0, not negative.
3. ผังบัญชี "UC-OP นอก CUP" → still in forecast, bar not red.
4. "PP" inside a word (e.g. "APPLE") → not PP.
5. Filters + search together → info line counts each visit once.

### Task 1: core summary, rules, CSV, reader
- [x] Failing tests: `dental-rules.test.ts` (isUcInCup, isExcludedFromForecast incl. focus 3–4), parity test against regenerated `dental-expected.json`, CSV header test, reader integration test (dtmain, denture, diag หลัก, claim = total − paid).
- [x] Implement `dental-rules.ts`, extend `DentalRow`/`summarizeDental`, new SQL in `dental-reader.ts`, CSV columns, fake HOSxP tables `dtmain`, `doctor`, `opitemrece`, `diagtype`.
- [x] `cd packages/core && npx vitest run src/smart-money` → PASS; commit `feat(money): dental follows the latest legacy rules`.

### Task 2: web dashboard
- [ ] Failing tests in `dental-dashboard.test.tsx`: five KPI cards incl. คาดการณ์; group chart stacked denture + red; detail filters and info line; ทันตแพทย์ column.
- [ ] Implement; BarChart gains per-bar colour and a stacked second series.
- [ ] `cd apps/web && npx vitest run src/app/\(app\)/money src/components/bar-chart` → PASS; commit `feat(money): dental dashboard forecast, denture stack and detail filters`.

### Task 3: verify, review, PR
- [ ] `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:integration` with DATABASE_URL; screenshots; review; PR.
