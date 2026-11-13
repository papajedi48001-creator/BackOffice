# Smart Money — รอบ 1 (โครงโมดูล + สิทธิ์ + ลูกหนี้ทันตกรรม) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `smart-money` module shell with its own member list (page-level access), and the ลูกหนี้ทันตกรรม dashboard that reads HOSxP live and shows the same numbers as the legacy PHP page.

**Architecture:** Same layering as `lab-inventory`: zod contracts in `packages/contracts/src/smart-money.ts`, additive migration + Drizzle schema, access rules + member service + dental logic in `packages/core/src/smart-money/`, thin route handlers under `apps/web/src/app/api/money/**`, server-component pages under `apps/web/src/app/(app)/money/**`. The dental page reads HOSxP through the existing `HosxpSettingsService.resolve()` connection (read-only SELECT) and summarises on the server; nothing from HOSxP is stored.

**Tech Stack:** TypeScript, Next.js App Router, React, zod, MariaDB (mysql2 via `@backoffice/db`), Drizzle schema, Vitest. No new dependency (charts are SVG/CSS).

**Spec:** `docs/superpowers/specs/2026-11-13-smart-money-design.md` (decisions `/mnt/project-files/smart-money/decisions.md`). Legacy source: `/home/user/smart_money_waritchaphum/modules/dental_claims/` (clone `ongrx25/Smart_Money_Waritchaphum` there if missing).

## Global Constraints

- Module code `smart-money`, label "Smart Money", description "ติดตามการเงินและการเรียกเก็บค่ารักษาพยาบาล", href `/money`, group `services`, status `live`, new icon `coins`.
- Permission `money.manage` → `permissionModules['money.manage'] = 'smart-money'`; manager role `money-manager` ("ผู้จัดการโมดูล Smart Money") → `['money.manage']`; `moduleManagerRoles['smart-money'] = 'money-manager'`; `testerModuleCodes` gains `smart-money` (tester role `smart-money-tester` follows the existing pattern).
- Pages: `moneyPageSchema = z.enum(['dental'])` in round 1 (rounds 2–4 add `nhso`, `fdh`, `disability`). Member needs ≥ 1 page.
- Tables `money_member (person_id PK FK person, created_at, created_by)` and `money_member_page (person_id FK money_member ON DELETE CASCADE, page VARCHAR(16), PK(person_id, page))`. Migration `0038_smart_money.sql` (take the next free number on main at implementation time).
- Dental filters: `start`/`end` ISO `YYYY-MM-DD`, default = current month in Asia/Bangkok; `group` ∈ `pttype` (สิทธิการรักษา) | `paccount` (ผังบัญชี), default `pttype`; `period` ∈ `day` (รายวัน) | `month` (รายเดือน), default `day`. Range > 366 days or end < start → message at the filter, no HOSxP query.
- Presets: เดือนนี้, เดือนที่แล้ว, ปีงบประมาณนี้ (1 ต.ค. – 30 ก.ย., Bangkok today).
- Money values: 2 decimals, right-aligned; dates shown via `lib/bangkok-time.ts` / Thai short date; date inputs only `ThaiDateInput`.
- CSV: UTF-8 with BOM, header exactly `VN,วันที่รับบริการ,HN,ชื่อ-สกุล,ICD-10,ชื่อโรค,รหัสสิทธิ,ชื่อสิทธิ,ผังบัญชี,ค่ารักษารวม,ชำระแล้ว,ยอดเรียกเก็บ`, filename `dental_claims_<start>_<end>.csv`. Audit `money.dental.export` metadata `{ start, end, rows }` only.
- Audit metadata never holds HN, names, or HOSxP connection details. Logs carry error codes only.
- Popups: `FormDialog` / `ActionDialog`, close from buttons only.
- Look (spec 7.5): BackOffice shell + legacy dashboard content (4 KPI cards, accent card for ลูกหนี้, preset chips, segmented toggles, rounded bars with value labels, two tables side by side, scrolling detail table) in BackOffice tokens; 390px → KPI 2×2, tables scroll inside their frame.

## Review Focus

1. HOSxP text that arrives as TIS-620 bytes read as latin1 (mojibake like `¡ÒÃ`) → shown as Thai; already-correct Thai untouched (Task 3 `fixThaiText` tests).
2. A person who is a member but lacks the `dental` page opening `/money/dental` or `/api/money/dental/export` directly → forbidden page / 403 (Tasks 2 and 5).
3. HOSxP not configured, unreachable, or query error → friendly Thai message, no host/user/password in page or log (Task 3 service test, Task 5 page test).
4. A visit with several K-codes → shown as several detail rows but money counted once; a visit whose pttype has no ผังบัญชี → `(ไม่ระบุผังบัญชี)` (Task 3 parity fixture).
5. Range edits by hand in the URL (`start=2569-01-01`, `end` before `start`, 400-day span, garbage) → message, no query (Task 3 range tests).

---

### Task 1: Contracts, permission and roles

**Files:**
- Create: `packages/contracts/src/smart-money.ts`, `packages/contracts/src/smart-money.test.ts`
- Modify: `packages/contracts/src/index.ts`, `access.ts`, `admin.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/module-manager-scope.ts`, `packages/core/src/access/authorization-service.test.ts`, `apps/web/src/lib/admin-labels.ts`, `apps/web/src/lib/role-choice-labels.ts`, `packages/i18n/src/th.ts` (keys for the exhaustive Records: `moduleSmartMoney`, `moduleSmartMoneyDescription`, `adminRoleMoneyManager`, `roleDescMoneyManager`)

**Interfaces (Produces):**
- `MONEY_MODULE = 'smart-money'`; `moneyPageSchema`, `type MoneyPage`; `moneyMemberInputSchema = { personId: uuid, pages: MoneyPage[] min 1 max 4 }.strict()`.
- `dentalGroupSchema = z.enum(['pttype','paccount'])`, `dentalPeriodSchema = z.enum(['day','month'])`.

- [ ] **Step 1: Failing tests** — member with `pages: []` rejected; unknown page `'x'` rejected; extra key rejected; `permissionModules['money.manage'] === 'smart-money'`. Core: unscoped `money-manager` → `organizationScope(subject,'money.manage') === 'all'`; plain staff → `[]`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization` → FAIL.
- [ ] **Step 3: Implement** schemas, permission map, role entries, labels.
- [ ] **Step 4: Run** same + `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(money): contracts, permission and manager role`

### Task 2: Migration, access rules and member service

**Files:**
- Create: `packages/db/migrations/0038_smart_money.sql`, `packages/db/src/schema/smart-money.ts`, `packages/db/src/schema/smart-money-schema.integration.test.ts`, `packages/core/src/smart-money/money-access.ts`, `money-access.test.ts`, `money-member-service.ts`, `money-member-service.integration.test.ts`, `money-queries.ts`
- Modify: `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/index.ts`, `packages/core/src/index.ts`

**Interfaces (Produces):**
- `canManageMoney(subject: AccessSubject): boolean` — `organizationScope(subject,'money.manage') === 'all'`.
- `type MoneyMember = { pages: MoneyPage[] } | null`; `loadMoneyMember(db, personId): Promise<MoneyMember>`.
- `moneyCan(member: MoneyMember, manages: boolean, page: MoneyPage | 'manage'): boolean` — manages ⇒ true; `'manage'` ⇒ only manages; else member has page.
- `moneyVisiblePages(member, manages): MoneyPage[]`.
- `class MoneyMemberService { saveMember(subject, input): Promise<{ok:true}|{ok:false;code:'FORBIDDEN'|'NOT_FOUND'}>; removeMember(subject, personId): same }` — audit `money.member.save` `{ pages: n }` / `money.member.remove` `{}` in the same transaction (use the `labAudit` pattern via a `moneyAudit` helper in `money-db.ts`).
- `class MoneyQueries { members(): Promise<{ personId; name; position; pages: MoneyPage[] }[]> }` (sorted by name).

- [ ] **Step 1: Failing tests** — unit `moneyCan`: manager → all; member with `['dental']` → dental true, manage false; `null` → false. Integration: save then load gives pages; re-save replaces pages; remove cascades pages; non-manager → `FORBIDDEN` and no row; unknown person → `NOT_FOUND`; one audit row per write with no names in metadata.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core test -- money` (+ `DATABASE_URL=… pnpm test:integration -- money`) → FAIL.
- [ ] **Step 3: Implement** migration (additive, idempotent, `DEFAULT CHARSET=utf8mb4`), Drizzle tables, access, service, queries.
- [ ] **Step 4: Run** same + `pnpm --filter @backoffice/db test` → PASS.
- [ ] **Step 5: Commit** `feat(money): member list and page access`

### Task 3: Dental logic and HOSxP reader (parity with legacy)

**Files:**
- Create in `packages/core/src/smart-money/`: `dental-range.ts`, `dental-range.test.ts`, `dental-summary.ts`, `dental-summary.test.ts`, `dental-csv.ts`, `dental-csv.test.ts`, `dental-reader.ts`, `dental-service.ts`, `dental-service.test.ts`, `thai-text.ts`, `thai-text.test.ts`, `fixtures/dental-rows.json`, `fixtures/dental-expected.json`, `fixtures/make-expected.php`

**Interfaces (Produces):**
- `type DentalRow = { vn: string; vstdate: string; hn: string; patientName: string; diagCode: string; diagName: string; pttypeCode: string; pttypeName: string; paccountName: string | null; totalAmount: number; paidMoney: number; claimAmount: number }`.
- `dentalRange(input: { start?: string; end?: string }, today: string): { ok: true; start: string; end: string } | { ok: false; code: 'INVALID_DATE' | 'END_BEFORE_START' | 'RANGE_TOO_LONG'; start: string; end: string }` — missing → current month; max 366 days.
- `dentalPresets(today: string): { label: 'เดือนนี้'|'เดือนที่แล้ว'|'ปีงบประมาณนี้'; start: string; end: string }[]`.
- `summarizeDental(rows: DentalRow[], group: DentalGroup, period: DentalPeriod): DentalSummary` where `DentalSummary = { rows; visits; patients; total; paid; claim; byPeriod: {key; visits; patients; total; paid; claim}[]; byGroup: {code; name; visits; patients; total; paid; claim}[]; byDiag: {code; name; count}[] }` — port of `DentalClaimsRepository::summarize` line for line (money once per VN, patients by distinct HN, byGroup sorted by total desc, byDiag by count desc, byPeriod by key asc, paccount blank → `(ไม่ระบุผังบัญชี)`).
- `dentalCsv(rows: DentalRow[]): string` (BOM + header from Global Constraints, RFC 4180 quoting).
- `fixThaiText(value: string): string` — if no char in U+0E00–U+0E7F and some char in U+00A1–U+00FB, re-decode `Buffer.from(value,'latin1')` with `new TextDecoder('windows-874')`; else unchanged.
- `type DentalReader = (connection: HosxpConnection, start: string, end: string) => Promise<DentalRow[]>`; `readDentalClaims: DentalReader` — the legacy SQL with `?` params, read-only, `fixThaiText` on text columns, numbers via `Number()`. ผังบัญชี rule: prefer `paccount_year = YEAR(vstdate)`, else the latest year, then lowest `paccount` (e.g. correlated subquery choosing one `paccount` per visit) — never rely on `ONLY_FULL_GROUP_BY` being off for that column.
- `class DentalService { constructor(resolveConnection: () => Promise<HosxpConnection | null>, reader: DentalReader); load(start, end): Promise<{ ok: true; rows: DentalRow[] } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' }> }` — catches reader errors, logs only the code.

- [ ] **Step 1: Build the parity fixture** — `fixtures/dental-rows.json`: ~25 rows covering: one VN with 3 K-codes; two VNs same HN; rows over 2 months; blank and null paccount; 11+ distinct diag codes; two pttypes with same name. `make-expected.php` requires the legacy `DentalClaimsRepository.php`, runs `summarize` for all 4 group×period combos on the fixture (keys mapped snake→camel), writes `dental-expected.json`. Run `php packages/core/src/smart-money/fixtures/make-expected.php` and commit both outputs.
- [ ] **Step 2: Failing tests** — `summarizeDental` equals `dental-expected.json` for all 4 combos (`toBeCloseTo` 2 dp for money); `dentalRange` cases: none → `2026-11-01..2026-11-30` for today `2026-11-13`; `end<start` → `END_BEFORE_START`; 367-day span → `RANGE_TOO_LONG`; `2569-13-40` → `INVALID_DATE`; presets for today `2026-11-13` → `2026-11-01..30`, `2026-10-01..31`, `2026-10-01..2027-09-30`; `fixThaiText('¡ÒÃ')` → `'การ'`, `'การ'` unchanged, `'K02.1'` unchanged; CSV starts with `﻿` + exact header, a name with `"` and `,` quoted; `DentalService`: null connection → `NOT_CONFIGURED` (reader not called); reader throws → `HOSXP_FAILED`, `console.error` not called with the password.
- [ ] **Step 3: Run** `pnpm --filter @backoffice/core test -- dental thai-text` → FAIL.
- [ ] **Step 4: Implement** the files above.
- [ ] **Step 5: Run** same → PASS.
- [ ] **Step 6: Commit** `feat(money): dental claims summary, range, CSV and HOSxP reader`

### Task 4: Module shell, overview and member settings (web)

**Files:**
- Create: `apps/web/src/app/(app)/money/layout.tsx`, `money-page.tsx` (context helper like `lab-page.tsx`: `moneyContext({ page? })` → `{ ok, session, database, member, manages, pages }` | `{ ok:false; reason }`, plus `MoneyPageMessage`), `page.tsx` (overview: one tile per visible page with icon, title, description), `settings/page.tsx`, `settings/member-form.tsx`, `settings/member-form.test.tsx`; `apps/web/src/app/api/money/money-route.ts`, `api/money/members/route.ts` (POST), `api/money/members/[personId]/route.ts` (DELETE), `api/money/people/route.ts` (GET, manager only), `api/money/route.test.ts`; `apps/web/src/lib/money-client.ts`
- Modify: `apps/web/src/lib/modules.ts`, `modules.test.ts`, `module-gate.test.ts`, `apps/web/src/components/module-icon.tsx` (`coins`), `packages/i18n/src/th.ts` (`moneyOverview: 'ภาพรวม'`, `moneyDental: 'ลูกหนี้ทันตกรรม'`, `moneySettings: 'ตั้งค่า'`)

**Interfaces:**
- Consumes: Task 2 `canManageMoney`, `loadMoneyMember`, `moneyCan`, `moneyVisiblePages`, `MoneyMemberService`, `MoneyQueries`.
- Produces: `moneyContext({ page?: MoneyPage | 'manage' })`; `MONEY_PAGES: Record<MoneyPage, { href; title; description; icon }>` (dental → `/money/dental`, "ลูกหนี้ทันตกรรม", "ลูกหนี้ผู้รับบริการทันตกรรม (K00–K11) แยกตามสิทธิ/ผังบัญชี รายวัน/รายเดือน") in `apps/web/src/lib/money-pages.ts`.
- Sections: `/money` ภาพรวม (visible to anyone available), `/money/dental` (available `moneyMay('dental')`), `/money/settings` (available `moneyMay('manage')`); module `available` = manages or member with ≥1 page.

- [ ] **Step 1: Failing tests** — `modules.test`: registry has `smart-money` with the three sections; non-member subject → module unavailable; member with dental → available, settings hidden. Route tests: POST `/api/money/members` as non-manager → 403; as manager → 200; DELETE unknown → 404; GET people as member → 403. `member-form.test`: dialog requires a person and ≥1 page ticked before save; Esc does not close.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- money modules module-gate` → FAIL.
- [ ] **Step 3: Implement** — settings page: member table (ชื่อ, ตำแหน่ง, หน้าที่เห็นได้ as chips, แก้ไข/ถอด); "เพิ่มเจ้าหน้าที่"/"แก้ไข" in `FormDialog` with the people search used by Lab's member form and one checkbox per `MONEY_PAGES` entry; "ถอด" in `ActionDialog`.
- [ ] **Step 4: Run** same + `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(money): module shell, overview and member settings`

### Task 5: Dental dashboard, charts and export (web)

**Files:**
- Create: `apps/web/src/components/bar-chart.tsx`, `bar-chart.test.tsx`; `apps/web/src/app/(app)/money/dental/page.tsx`, `dental-filters.tsx` (client: `ThaiDateInput` ×2, preset chips, segmented group/period links, CSV link), `dental-detail-table.tsx` (client: search box filters rows in the browser), `dental-page.test.tsx`; `apps/web/src/app/api/money/dental/export/route.ts`
- Modify: `apps/web/src/app/styles.css` (`.money-*` rules), `apps/web/src/lib/hosxp.ts` (export `dentalService(database)` wiring `hosxpSettings(database).resolve()` + `readDentalClaims`), `DESIGN.md` (Smart Money paragraph: KPI cards allowed on its dashboards, chart rules), `CONTEXT.md` (Smart Money vocabulary from spec §9)

**Interfaces:**
- Consumes: Task 3 `dentalRange`, `dentalPresets`, `summarizeDental`, `dentalCsv`, `DentalService`; Task 4 `moneyContext({ page: 'dental' })`.
- Produces: `BarChart({ bars: { label: string; sublabel?: string; value: number; note?: string }[]; orientation?: 'auto' | 'vertical' | 'horizontal'; valueFormat: (n: number) => string; ariaLabel: string })` — SVG, rounded bars, value text on each bar, `auto` = horizontal when > 8 bars, `<title>` per bar for the tooltip text; reused by rounds 2–4.

- [ ] **Step 1: Failing tests** — `bar-chart.test`: 9 bars render horizontal, 3 vertical; each bar's formatted value is visible text; zero/empty data renders "ไม่มีข้อมูล". `dental-page.test` (with injected fake service): renders 4 KPI values from the fixture summary; group chart labels include `(n คน)`; Top 10 table has 10 rows; detail note text present; `RANGE_TOO_LONG` shows "ช่วงวันที่ยาวเกิน 366 วัน" and service not called; `NOT_CONFIGURED` shows "ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP" (plus a link to `/admin/connections` only for ผู้ดูแลระบบ); `HOSXP_FAILED` shows "ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง"; empty → "ไม่พบข้อมูลในช่วงวันที่ที่เลือก". Export route: non-member → 403; member without `dental` → 403; member → 200 `text/csv; charset=utf-8`, body starts with BOM, one audit row `money.dental.export`. `date-fields.test.ts` still passes.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- money bar-chart date-fields` → FAIL.
- [ ] **Step 3: Implement** — page layout per spec 7.3/7.5: filter bar → period line ("ช่วงวันที่ … ถึง … · รหัสโรค K00–K11 · เฉพาะลูกหนี้") → 4 KPI cards (ผู้รับบริการทันตกรรม คน + visit · ค่ารักษารวม · ชำระเงินแล้ว · มูลค่าลูกหนี้/เรียกเก็บ accent) → group chart → trend chart (byPeriod: ค่ารักษารวม and ลูกหนี้ per day/month) → two-column (สรุปตามกลุ่ม with รวม footer | Top 10 ICD) → detail table with search and note.
- [ ] **Step 4: Run** same + `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(money): dental claims dashboard, charts and CSV export`

### Task 6: Verification and screenshots

- [ ] **Step 1:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` → all green (report real output).
- [ ] **Step 2:** `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm test:integration` against a local MariaDB (say so if skipped) and `git diff --check`.
- [ ] **Step 3:** Run the app with a fake HOSxP (a local MariaDB `hos` schema seeded from `dental-rows.json` via the needed tables) and capture `/money`, `/money/dental` (both group modes), `/money/settings` + member dialog at 1280 and 390 into `/mnt/project-files/smart-money/screens/`.
- [ ] **Step 4:** Code review (`superpowers:requesting-code-review`), fix findings, open PR.
