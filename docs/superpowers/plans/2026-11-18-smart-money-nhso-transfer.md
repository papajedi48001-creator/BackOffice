# Smart Money round 2: เงินโอน สปสช. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the legacy `modules/nhso_transfer` page into BackOffice at `/money/nhso`, with the same numbers and screens.

**Architecture:** The browser reads Excel files with SheetJS and posts each sheet as an array of rows. The server checks the
table with a TypeScript port of `NhsoReport::parse` and keeps one row per (หน่วยบริการ, ปีงบ) in `money_nhso_dataset`. The
dashboard loads every dataset and computes everything in the browser with a TypeScript port of `nhso-core.js`.

**Tech Stack:** Next.js App Router, zod contracts, MariaDB with Drizzle schema, vitest, `@e965/xlsx@0.20.3` (browser only).

**Spec:** `docs/superpowers/specs/2026-11-18-smart-money-nhso-transfer-design.md`. Legacy source: `ongrx25/Smart_Money_Waritchaphum`
`modules/nhso_transfer/*` and `tests/nhso/*`.

## Global Constraints
- Upload and delete need `money.manage`, checked on the server. Viewing needs the `nhso` page tick (or manage).
- The server never runs SheetJS. A posted table is at most 20,000 rows and 80 columns, with each cell at most 1,000 characters and of type number, string, boolean or null. Files over 10 MB and `~$` files are refused in the browser.
- Audit events:
  - `money.nhso.upload` {fy, rows}
  - `money.nhso.remove` {fy}
  - `money.nhso.remove_all` {count}
  - No hospital rows go into audit.
- Client components import only types from `@backoffice/core` (`client-imports.test.ts`).
- Confirmations use `ActionDialog`, which closes only from its buttons. Dates display as `13 พ.ย. 2569`.
- Pin `@e965/xlsx` at exactly `0.20.3`, and keep `pnpm audit --prod --audit-level high` clean.

## Review Focus
1. A report whose header line has no 5-digit code is refused with a Thai message, never stored under the file name.
2. Re-uploading the same (hcode, fy) replaces the stored rows and keeps one row in the table.
3. A member without the `nhso` tick gets 403 from GET datasets, and a non-manager gets 403 from POST and DELETE.
4. Excel date cells arrive as `dd/mm/yyyy` พ.ศ., so `monthOf` gives the same fiscal month as legacy.
5. An oversized or malformed posted table returns 400 before anything is parsed or stored.

---

### Task 1: Contracts, migration, registry
**Files:**
- `packages/contracts/src/smart-money.ts`: add `'nhso'` to `moneyPageSchema`, plus `nhsoUploadSchema`.
- `packages/db/migrations/0041_money_nhso_dataset.sql`, `packages/db/src/migrate.ts` (+ test), `packages/db/src/schema/*`.
- `apps/web/src/lib/money-pages.ts`, `apps/web/src/lib/modules.ts`, `packages/i18n/src/th.ts` (and en), and the settings page ticks.

**Produces:**
- `nhsoUploadSchema = z.object({ fileName: z.string().min(1).max(255), aoa: z.array(z.array(cell).max(80)).max(20000) }).strict()`, where `cell = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])`.
- Table `money_nhso_dataset`:
  - hcode CHAR(5), fy SMALLINT, name VARCHAR(255), region VARCHAR(255)
  - date_from, date_to VARCHAR(10) NULL
  - file_name VARCHAR(255), row_count INT, transfer_total DECIMAL(15,2)
  - header_json TEXT, rows_json LONGTEXT
  - uploaded_at DATETIME, uploaded_by CHAR(36) FK person
  - PK (hcode, fy)

- [ ] Write failing tests:
  - contracts: `nhsoUploadSchema` rejects 81 columns and a 1,001-char cell; `moneyPageSchema` accepts `nhso`.
  - migrate.test: lists 0041.
  - money-pages: the nhso entry exists.
- [ ] Run them and confirm they fail.
- [ ] Implement the changes.
- [ ] Run the tests and confirm they pass.
- [ ] Commit `feat(money): nhso page, upload contract and dataset table`.

### Task 2: Report parser (port of `NhsoReport::parse`)
**Files:** `packages/core/src/smart-money/nhso-report.ts` and its test.

**Produces:** `parseNhsoReport(fileName: string, aoa: unknown[][]): { ok: true; report: NhsoReport } | { ok: false; message: string }`, where `NhsoReport = { hcode, name, region, fy, dateFrom, dateTo, header: string[], rows: Cell[][], rowCount, transferTotal }`.

- [ ] Port every case from `NhsoReportTest.php` as a failing test:
  - the header row is the first row with at least 3 filled cells
  - missing columns are named in the message
  - hcode and name come from the "หน่วยบริการ" line
  - fy comes from the "วันที่โอนตั้งแต่" line, otherwise from the first วันที่โอน
  - total and empty rows are dropped
- [ ] Run them and confirm they fail.
- [ ] Implement, with the same regexes and Thai messages as the PHP.
- [ ] Run the tests and confirm they pass.
- [ ] Commit `feat(money): parse NHSO transfer reports like the legacy page`.

### Task 3: Dataset service
**Files:** `packages/core/src/smart-money/nhso-dataset-service.ts`, its unit and integration tests, and the `redact.ts` allowlist if needed.

**Produces:** `NhsoDatasetService(database)` with:
- `upload(subject, input)` → `{ ok, hcode, name, fy, rows, replaced }`
- `list(subject)`
- `all(subject)` → datasets with rows
- `remove(subject, hcode, fy)`
- `removeAll(subject)`

The service checks `canManageMoney` and the page member. The write and its audit go in one transaction.

- [ ] Write failing tests:
  - forbidden for a non-manager upload
  - replace keeps one row and returns `replaced: true`
  - audit metadata has only fy/rows/count
  - list is ordered by fy, then hcode
- [ ] Run them and confirm they fail.
- [ ] Implement.
- [ ] Run the tests, including the integration test with `DATABASE_URL`, and confirm they pass.
- [ ] Commit.

### Task 4: Browser calculations (port of `nhso-core.js`)
**Files:** `apps/web/src/lib/money/nhso-core.ts` and its test.

**Produces:** the same functions as legacy, as typed exports: `monthOf`, `allocateTransfer`, `buildDatasets`, `defaultSettings`, `runCompare`, `dashboardMetrics`, `sumByFy`, `commonColumns`.

- [ ] Port the 4 tests from `core.test.js`, and add a test for the year-compare and dashboard metrics on the fixture.
- [ ] Run them and confirm they fail.
- [ ] Port the code.
- [ ] Run the tests and confirm they pass.
- [ ] Commit.

### Task 5: API routes
**Files:**
- `apps/web/src/app/api/money/nhso/datasets/route.ts` (GET, POST, DELETE all)
- `.../datasets/[hcode]/[fy]/route.ts` (DELETE)
- `route.test.ts`

- [ ] Write failing tests for status codes: 401 without a session, 403 for the wrong role, 400 for a bad table, 200 with the result line data.
- [ ] Run them and confirm they fail.
- [ ] Implement.
- [ ] Run the tests and confirm they pass.
- [ ] Commit.

### Task 6: Files page and upload
**Files:** `apps/web/src/app/(app)/money/nhso/files/{page.tsx,nhso-files.tsx,nhso-upload.tsx}`, its tests, and `@e965/xlsx@0.20.3` in apps/web.

- [ ] Write failing tests:
  - the table has the 8 columns
  - ลบ opens an ActionDialog
  - the result lines read "นำเข้าแล้ว … — แทนที่ข้อมูลเดิม"
  - a 10 MB+ file and a `~$` file are refused without a request
  - the workbook-to-aoa conversion turns date cells into dd/mm/yyyy พ.ศ.
- [ ] Run them and confirm they fail.
- [ ] Implement. Load SheetJS with a dynamic `import('@e965/xlsx')` and read .zip files through `XLSX.CFB`.
- [ ] Run the tests and `pnpm audit --prod --audit-level high`, and confirm both pass.
- [ ] Commit.

### Task 7: Dashboard
**Files:**
- `apps/web/src/app/(app)/money/nhso/{page.tsx,nhso-dashboard.tsx,nhso-overview.tsx,nhso-details.tsx,nhso-reports.tsx,nhso-settings.tsx}`
- a grouped bar chart component, its tests, and styles

- [ ] Write failing tests on the fixture:
  - the status line
  - the year chips default to the latest two
  - the hero shows วาริชภูมิ's total
  - there are 13 fund cards
  - the fund×hospital table shows the totals
  - the report tabs and search are capped at 2,000 rows
  - settings are stored under `nhso.settings`
  - the messages for fewer than 2 hospitals and for no hospitals
- [ ] Run them and confirm they fail.
- [ ] Implement, in the same section order as legacy `index.php` and `dashboard.js`. The Excel export uses SheetJS `writeFile`.
- [ ] Run the tests and confirm they pass.
- [ ] Commit.

### Task 8: Docs, screenshots, verification
- [ ] Update CONTEXT.md (เงินโอน สปสช., ชุดข้อมูล สปสช.) and the parent spec status.
- [ ] Take screenshots at 1280 and 390 px into `/mnt/project-files/smart-money/screens/`.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test`, the integration tests with MariaDB, and `git diff --check`.
- [ ] Do the whole-branch review, then open the PR.
