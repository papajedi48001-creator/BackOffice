# Smart Money round 6: การจ่ายยาสมุนไพร Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `modules/herb_dispense` to `/money/herb` with the same numbers and screens.

**Architecture:** Rules and summary are pure functions in `packages/core/src/smart-money/herb-*.ts`, pinned to the PHP by a generated
fixture. A reader runs the one legacy SELECT on HOSxP in a READ ONLY transaction; `FdhDocumentService.herbRep` hands the stored REP
Data Drug rows (no PID) to the summary. The web page reuses the TTM filter and renders with BackOffice CSS charts.

**Tech Stack:** TypeScript, Vitest, Next.js app router, MariaDB (mysql2), SheetJS export as round 5.

**Spec:** `docs/superpowers/specs/2026-11-18-smart-money-herb-dispense-design.md`

## Global Constraints
- HOSxP is read only: SELECT text guard plus `withReadOnlyFallback`; log only the driver code.
- Page tick `herb` in `moneyPageSchema`; checked on the server for the page.
- No PID or patient name in the herb REP view.
- Dates through `ThaiDateInput` (the TTM filter); popups only from buttons; Thai terms from CONTEXT.md.

## Review Focus
- A REP case whose seq has spaces, or a sub_fund in lower case: legacy trims seq and upper-cases sub_fund.
- The same vn|icode on two rxdates: received counted once; ontop once per visit.
- stdprice given as string '0.00' or null: falls back to sum_price.
- `HERB_POINT_BAHT` as '0', '-1', 'abc': unset.
- A REP with no HERB_FS cases at all: received is 0 (not null) once any REP exists.

---

### Task 1: page tick `herb`
**Files:** `packages/contracts/src/smart-money.ts` (+test), `packages/core/src/smart-money/money-access.test.ts`, `apps/web/src/lib/money-pages.ts`
- [x] Test: `moneyPageSchema.parse('herb')` passes; page list includes herb → fail, add, pass. Commit `feat(money): herb page tick`.

### Task 2: rules
**Files:** create `packages/core/src/smart-money/herb-rules.ts` (+test)
**Produces:** `HERB_ONTOP: readonly [icode, name, unit, stdQty, baht|null, points|null][]` (38), `HerbOntopRate`, `HerbRules
{herbIcodes, ontopRates: Record<string,HerbOntopRate>, rightMap, pointBaht: number|null}`, `herbRules(custom: {point_baht?: string}, ttm: TtmRules)`.
- [x] Port the legacy rules checks (38 rates, 92 baht, 264.5 point, no 1560027/1630008, point_baht '0.5'/'abc', every ontop icode in the herb list, baht xor points); watch fail; implement; pass; commit.

### Task 3: summary + parity
**Files:** create `herb-summary.ts` (+test), `fixtures/make-herb-legacy.php`, `fixtures/herb-legacy.json`
**Produces:** `HerbRow`, `HerbRepDoc`, `herbValue(row)`, `isHerbFund(subFund)`, `herbReceivedFromRep(docs)`, `summarizeHerb(rows, rules, received|null): HerbSummary`
(totals with receivedVisits, groups with drugs, drugs, days; received null without REP).
- [x] Port every legacy summary/receivedFromRep/value test plus parity on default and point_baht settings; watch fail; implement; pass; commit.

### Task 4: reader + service + REP view
**Files:** create `herb-reader.ts` (+unit and integration tests), `herb-service.ts` (+test); modify `fdh-document-service.ts` (+test), `fixtures/fake-hosxp.ts`
**Produces:** `HERB_SQL`, `herbQueryParams(start,end,icodes)`, `readHerb: HerbReader`, `HerbService.load(start,end,icodes)`, `FdhDocumentService.herbRep(subject)` → `{ok:true, docs: HerbRepDoc[]}`.
- [x] Tests: query de-dupes icodes, refuses empty, SQL read-only and not inlined; integration reads fake HOSxP (ipt pttype wins); herbRep strips PID and is denied without herb/fdh/manager; fail → implement → pass; commit.

### Task 5: web page
**Files:** create `apps/web/src/app/(app)/money/herb/{page.tsx,herb-load.ts,herb-dashboard.tsx,herb-dashboard.test.tsx}`, `apps/web/src/lib/money/{herb-views.ts,herb-views.test.ts,herb-export.ts}`; modify `lib/hosxp.ts`, `lib/modules.ts`(+test), i18n, search-cards exemptions, styles.css, CONTEXT.md, DESIGN.md.
- [x] Tests: views (Excel sheets and columns, file name, visible groups, ontop cell text, search); dashboard renders KPIs, รอ REP, opens a group, empty text; fail → implement → pass; commit.

### Task 6: verify, review, screens, PR
- [ ] `pnpm lint && pnpm typecheck && pnpm test`, integration with MariaDB, `git diff --check`; whole-branch review and fixes; screens 1280/390; PR.

## Rulings
- The REP view checks `herb` (or `fdh`, or manager) on the server and returns only the six fields the summary reads.
- The legacy stale-REP warning is dropped: BackOffice REP documents always carry `drugs`.
