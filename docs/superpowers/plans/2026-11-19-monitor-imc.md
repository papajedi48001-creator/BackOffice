# Monitor IMC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Rename Point ฟื้นฟูผู้พิการ to กองทุนฟื้นฟูสมรรถภาพ and add Monitor IMC (register + REP import, person cards, table, chart, REP table) on top.

**Architecture:** Browser reads the CSV/xlsx into rows (as dp-sheet does) and posts parts; `ImcService` in core parses, encrypts and upserts into
`money_imc_visit` / `money_imc_rep`, and builds the overview (persons, chart lines, totals). The page computes days left and chart buckets in the browser.

**Tech Stack:** Next.js, zod contracts, MariaDB, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-monitor-imc-design.md`

## Global Constraints

- No name, HN or national ID in URL, log, audit metadata; stored only in `record_ciphertext`.
- Migration `0044_money_imc.sql`, additive, listed last in `migrate.ts`; Drizzle schema kept in step.
- Read: managers or `disability` page members; upload: `canManageMoney`.
- Upload UI in `FormDialog`; no `type="date"` inputs.

## Review Focus

- Re-uploading the same register file must not double count (upsert by line key).
- REP lines whose HN is not in the register are counted in totals but not attached to a person.
- A register row with an impossible date or no HN is skipped and counted.
- A person with lines carrying different due dates takes the latest line's values.
- Picking the การให้บริการ IMC CSV gives a clear message, not a crash.

### Task 1: Contract, migration, schema
- [x] `imcUploadSchema` {kind: 'register'|'rep', fileName, uploadId, header: cells[][] (1–2 rows), rows ≤ 1500} in `packages/contracts/src/smart-money.ts`, test in `smart-money.test.ts`.
- [x] `packages/db/migrations/0044_money_imc.sql`, `migrate.ts`, `schema/smart-money.ts`, assertion in `migrate.test.ts`.

### Task 2: Parsers (`packages/core/src/smart-money/imc-report.ts`)
- [x] `parseImcRegister(header, rows)` → `{ ok, lines: ImcLine[], skipped }`; `parseImcRep(header, rows)` → `{ ok, lines: ImcRepLine[], skipped }`; tests with the real column names.

### Task 3: `ImcService` (`packages/core/src/smart-money/imc-service.ts`)
- [x] `upload(subject, input)`, `overview(subject)`; pure `buildImcOverview(lines, reps)` unit-tested; integration test against MariaDB.

### Task 4: API `apps/web/src/app/api/money/disability/imc/route.ts`
- [x] GET overview, POST part; route test for 403 / 400 / ok.

### Task 5: Browser helpers `apps/web/src/lib/money/imc-views.ts`
- [x] `imcRemain(due, status, today)`, `imcGroup`, `imcBuckets(lines, unit)`, `readImcFile(file)`; tests.

### Task 6: UI and rename
- [x] `ImcMonitor` + `ImcUpload` under `app/(app)/money/disability/`, placed above `DpDashboard`; rename labels; component tests.

Verification: `pnpm lint && pnpm typecheck && pnpm test`, integration with `DATABASE_URL`, screenshot of the page.
