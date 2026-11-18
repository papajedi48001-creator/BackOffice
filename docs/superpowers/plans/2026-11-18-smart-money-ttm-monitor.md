# monitor แพทย์แผนไทย Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Port the legacy `ttm_monitor` module to `/money/ttm` and `/money/ttm/mapping`, read live from HOSxP.

**Architecture:** Pure rules and summary in `packages/core/src/smart-money/ttm-*.ts` (port of TtmSummary), a read-only HOSxP reader
and `TtmService` like dental, a server page that summarises and hands the result to a client dashboard; Excel built in the browser.

**Tech Stack:** TypeScript, Next.js 16, vitest, MariaDB (mysql2), `@e965/xlsx`.

**Spec:** `docs/superpowers/specs/2026-11-18-smart-money-ttm-monitor-design.md`

## Global Constraints
- HOSxP is only read: SELECT text check + `READ ONLY` transaction; no write path.
- Client components import only types from `@backoffice/core`.
- Dates entered with `ThaiDateInput`; never `type="date"`.
- Same rule values as legacy (47 procedure icodes, 62 herb icodes, 3015968, 16:00, keywords, group order).

## Review Focus
- `service_time` formats "9:5", "16.00", empty → after-hours false unless strictly later than cutoff.
- A service row with no vn → keyed `hn:<hn>:<date>`; items of unknown vn ignored.
- Money with fractions shown with 2 decimals, whole numbers without.
- HOSxP down / not configured → Thai message, no stack trace, driver code only in the log.
- Range: unreadable, B.E., reversed or > 1,830 days fixed the legacy way (today, swap, cut) before any query.

---

### Task 1: read-only transactions on the database client
**Files:** `packages/db/src/client.ts`, test `packages/db/src/client.integration.test.ts` (or existing db test)
- [x] Failing test: a write inside `transaction(..., { readOnly: true })` is refused by MariaDB.
- [x] `TransactionOptions.readOnly?: true` → `SET TRANSACTION READ ONLY` before `beginTransaction`.
- [x] Commit `feat(db): read-only transactions`.

### Task 2: `ttm` page tick
**Files:** `packages/contracts/src/smart-money.ts`, `packages/core/src/smart-money/money-access.test.ts`, contracts test
- [x] Failing test: `moneyVisiblePages(null, true)` ends with `'ttm'`; `moneyCan({pages:['ttm']}, false, 'ttm')`.
- [x] Add `'ttm'` to `moneyPageSchema`.

### Task 3: rules (`ttm-rules.ts`)
**Produces:** `TTM_RIGHT_GROUPS`, `TTM_CATEGORIES`, `TTM_KINDS`, `TTM_PROCEDURES`, `TTM_HERB_ICODES`, `ttmRules(custom)`,
`classifyTtmItem(item, rules)`, `ttmKind(item, category, rules)`, `ttmRightGroup(pttype, name, hipdata, rules)`,
`isTtmIpd(service, visitAn)`, `isTtmAfterHours(service, rules)`, `ttmFiscalYear(date)`.
- [x] Port every rules/classify/kind/right/IPD/after-hours assertion of `TtmSummaryTest.php` to `ttm-rules.test.ts`; watch fail.
- [x] Implement; pass.

### Task 4: summary (`ttm-summary.ts`)
**Produces:** `summarizeTtm(services, visits, items, rules): TtmSummary` with legacy fields in camelCase.
- [x] Port the summarize assertions; add `fixtures/make-ttm-legacy.php` → `ttm-legacy.json` (PHP output on generated input) and a
      parity test; watch fail; implement; pass.

### Task 5: range (`ttm-range.ts`)
- [x] Tests: default today, 1,830-day limit, B.E. year refused, 7 presets for 2026-11-18. Implement.

### Task 6: reader and service
**Files:** `ttm-reader.ts`, `ttm-service.ts`, `fixtures/fake-hosxp.ts` (add ttm tables/columns), integration test.
- [x] `isTtmReadOnlySql` unit test (legacy cases). Integration test against fake HOSxP (TIS-620 text, grouping). Implement.

### Task 7: web pages
**Files:** `lib/money/ttm-config.ts`, `lib/hosxp.ts`, `app/(app)/money/ttm/{page,ttm-dashboard,ttm-filter,ttm-load}.tsx`,
`mapping/{page,ttm-item-table}.tsx`, `lib/money/ttm-export.ts`, registry (`modules.ts`, `money-pages.ts`, i18n), styles.
- [x] Tests: env rules parsing, export sheets, dashboard render (report table, single-day hides periods, search), mapping page.

### Task 8: docs, verification, screenshots
- [x] CONTEXT.md and DESIGN.md; lint, typecheck, test, integration, `git diff --check`; screenshots at 1280 and 390.

## Rulings
- Range is fixed the legacy way (today / swap / cut to 1,830 days), not refused; a B.E. year reads as unset.
- Labels (`TTM_KINDS`, `TTM_RIGHT_GROUPS`, `TTM_CATEGORIES`) live in contracts so client components can show them.
- The period chart is a stacked `GroupedBarChart`; people go in each bar's label and the table instead of a line.
- `TTM_KIND_MAP` on the code-check page is listed in hospital-list order (legacy put custom codes first).

## Final review fixes (each with a test that failed first)
- Date boxes, period tab and search now reset when the range changes (filter and body keyed by the range).
- An old HOSxP server that cannot parse `SET TRANSACTION READ ONLY` falls back to a plain transaction (legacy carried on too);
  the SELECT guard still applies (`withReadOnlyFallback`).
- `TTM_RIGHT_MAP` / `TTM_KIND_MAP` values and lookups use `Object.hasOwn`, so `constructor` and the like cannot crash the page.

## Deferred minors
- Rounding of exact halves like 1.005 can differ from PHP `round`.
- Digit-only names tie-break as text, not as numbers.
- The whole summary (incl. item and income stats) goes to the browser, as legacy embedded the visits.
- The parity fixture does not cover custom icode/income lists or keyword-named procedure items.
