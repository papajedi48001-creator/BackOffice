# Monitor Instrument OFC (round 1: HOSxP) Implementation Plan

**Goal:** A Smart Money page that lists OFC outpatients given ADP 8610 instruments in a date range, read live from HOSxP.

**Spec:** docs/superpowers/specs/2026-11-24-monitor-ofc-instrument-design.md

## Global Constraints

- Read only: SELECT guard + READ ONLY transaction; params bound (`8610`, `OFC`, dates), never inlined.
- No new HOSxP table (grants test must stay green).
- Dates `16 พ.ย. 2569`; ranges via `TtmFilter` (ThaiDateInput only).
- Client components import only types from `@backoffice/core`.

## Tasks

- [x] **Task 1: reader** `packages/core/src/smart-money/ofc-reader.ts` — `OFC_SQL`, `ofcQuery(start, end): {sql, params}`, `readOfc: OfcReader`. Tests: `ofc-reader.test.ts` (params, guard), `ofc-reader.integration.test.ts` (fake HOSxP: only OFC + 8610 lines in range, grouped by vn+icode, with name). Fixture: `nondrugitems.nhso_adp_code`.
- [x] **Task 2: summary + service** `ofc-summary.ts` `summarizeOfc(rows): OfcSummary` (totals people/visits/qty/claim, items, persons with lines, newest first); `ofc-service.ts` `OfcService.load(start, end)` → rows or NOT_CONFIGURED / HOSXP_FAILED. Tests: `ofc-summary.test.ts`, `ofc-service.test.ts`.
- [x] **Task 3: page** `moneyPageSchema` + `ofc`, `MONEY_PAGES.ofc`, i18n `moneyOfc`, modules section, `lib/hosxp.ts ofcService`, `app/(app)/money/ofc/{page,ofc-load}.ts(x)`, `ofc-monitor.tsx`. Tests: `ofc-monitor.test.tsx` (KPIs, row expands lines, error states), contracts enum test.

## Verification

`pnpm lint && pnpm typecheck && pnpm test`, integration with `DATABASE_URL`/`DATABASE_ADMIN_URL`, `git diff --check`.
