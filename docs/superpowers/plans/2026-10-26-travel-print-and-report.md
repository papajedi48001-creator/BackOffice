# ไปราชการ print form and report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A printable แบบขออนุมัติไปราชการ and a รายงานการไปราชการ the หัวหน้าคณะ files after the trip.

**Architecture:** One new table and service in `packages/core/src/official-travel`, one route, two server pages and one client form in `apps/web`.

**Tech Stack:** TypeScript, MariaDB, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-travel-print-and-report-design.md`

## Global Constraints

- Report save, audit event in one transaction; audit metadata never holds the report text.
- Access decided on the server by `OfficialTravelQueries.detail`.
- "Ended" means end date before today in Asia/Bangkok.

## Review Focus

- A trip that ends today is not yet due.
- A member who is not the หัวหน้าคณะ cannot save a report.
- The print page never shows decision reasons.
- HR's "no report" filter ignores trips that are not APPROVED.

---

### Task 1: Report table, service and queries

**Files:** `packages/db/migrations/0014_official_travel_report.sql`, `packages/db/src/schema/official-travel.ts`, `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `docs/integration/modules.md`, `packages/contracts/src/official-travel.ts`, `packages/core/src/official-travel/travel-report-service.ts` + integration test, `travel-queries.ts` (detail `report`, `canReport`; list `reportStatus`; filter `reportMissing`), `packages/core/src/audit/redact.ts` (`firstSave`).

**Interfaces:** `TravelReportService(database, createId).save(personId, travelId, input, today): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'REPORT_NOT_DUE' }>`; `travelReportInputSchema`; `TravelListItem.reportStatus: 'SUBMITTED' | 'MISSING' | 'NOT_DUE'`.

- [x] Failing tests: due rules, leader only, update keeps one row, audit without text, list/filters.
- [x] Implement; tests pass.
- [x] Commit `feat(travel): post-trip report table, service and queries`.

### Task 2: Report API and screens

- [ ] Failing tests: `PUT /api/travel/<id>/report` maps codes; trip page shows the report and the form for the leader; HR list column and filter; mine shows ยังไม่ส่งรายงาน.
- [ ] Implement; tests pass.
- [ ] Commit `feat(travel): file and read the post-trip report`.

### Task 3: Print form

- [ ] Failing test: print page shows the บันทึกข้อความ, people going, totals, steps without reasons; not found for others.
- [ ] Implement page, print CSS, link from trip page.
- [ ] Commit `feat(travel): printable แบบขออนุมัติไปราชการ`.

Verification: `pnpm lint && pnpm typecheck && pnpm test`, `DATABASE_URL=mysql://backoffice:local-development-only@127.0.0.1:3306/backoffice_fresh pnpm test:integration`, `node --test scripts/*.test.mjs`, `git diff --check origin/main...HEAD`.
