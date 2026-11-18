# monitor แพทย์แผนไทย Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

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
- [ ] Failing test: a write inside `transaction(..., { readOnly: true })` is refused by MariaDB.
- [ ] `TransactionOptions.readOnly?: true` → `SET TRANSACTION READ ONLY` before `beginTransaction`.
- [ ] Commit `feat(db): read-only transactions`.

### Task 2: `ttm` page tick
**Files:** `packages/contracts/src/smart-money.ts`, `packages/core/src/smart-money/money-access.test.ts`, contracts test
- [ ] Failing test: `moneyVisiblePages(null, true)` ends with `'ttm'`; `moneyCan({pages:['ttm']}, false, 'ttm')`.
- [ ] Add `'ttm'` to `moneyPageSchema`.

### Task 3: rules (`ttm-rules.ts`)
**Produces:** `TTM_RIGHT_GROUPS`, `TTM_CATEGORIES`, `TTM_KINDS`, `TTM_PROCEDURES`, `TTM_HERB_ICODES`, `ttmRules(custom)`,
`classifyTtmItem(item, rules)`, `ttmKind(item, category, rules)`, `ttmRightGroup(pttype, name, hipdata, rules)`,
`isTtmIpd(service, visitAn)`, `isTtmAfterHours(service, rules)`, `ttmFiscalYear(date)`.
- [ ] Port every rules/classify/kind/right/IPD/after-hours assertion of `TtmSummaryTest.php` to `ttm-rules.test.ts`; watch fail.
- [ ] Implement; pass.

### Task 4: summary (`ttm-summary.ts`)
**Produces:** `summarizeTtm(services, visits, items, rules): TtmSummary` with legacy fields in camelCase.
- [ ] Port the summarize assertions; add `fixtures/make-ttm-legacy.php` → `ttm-legacy.json` (PHP output on generated input) and a
      parity test; watch fail; implement; pass.

### Task 5: range (`ttm-range.ts`)
- [ ] Tests: default today, 1,830-day limit, B.E. year refused, 7 presets for 2026-11-18. Implement.

### Task 6: reader and service
**Files:** `ttm-reader.ts`, `ttm-service.ts`, `fixtures/fake-hosxp.ts` (add ttm tables/columns), integration test.
- [ ] `isTtmReadOnlySql` unit test (legacy cases). Integration test against fake HOSxP (TIS-620 text, grouping). Implement.

### Task 7: web pages
**Files:** `lib/money/ttm-config.ts`, `lib/hosxp.ts`, `app/(app)/money/ttm/{page,ttm-dashboard,ttm-filter,ttm-period,ttm-visits}.tsx`,
`mapping/{page,ttm-items}.tsx`, `lib/money/ttm-export.ts`, registry (`modules.ts`, `money-pages.ts`, i18n), styles.
- [ ] Tests: env rules parsing, export sheets, dashboard render (report table, single-day hides periods, search), mapping page.

### Task 8: docs, verification, screenshots
- [ ] CONTEXT.md and DESIGN.md; lint, typecheck, test, integration, `git diff --check`; screenshots at 1280 and 390.
