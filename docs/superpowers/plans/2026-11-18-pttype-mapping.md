# Mapping สิทธิค่ารักษาพยาบาล Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** โมดูล `pttype-mapping` ให้ผู้ดูแลระบบ/ผู้จัดการโมดูลผูกผังบัญชี OPD/IPD กับสิทธิการรักษาใน HOSxP ผ่านตาราง + popup (แบบ B) พร้อมประวัติการแก้ไข

**Architecture:** contracts (schema + permission/role) → core (`pttype-mapping/`: access, HOSxP reader/writer, service ที่ทำ audit) → web (route handlers, หน้า server + client component, registry) อ่าน/เขียน HOSxP ผ่าน `HosxpSettingsService.resolve()` เหมือน `dental-reader.ts` แต่ละการบันทึกเป็น transaction เดียวใน HOSxP แล้วเขียน audit ใน BackOffice

**Tech Stack:** TypeScript, zod, mariadb driver (`createDatabase`), Next.js 16 app router, React 19, vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-18-pttype-mapping-design.md`

## Global Constraints

- รหัสโมดูล `pttype-mapping`, path `/pttype-mapping`, permission `pttype-mapping.manage`, role `pttype-mapping-manager`, tester `pttype-mapping-tester`
- รหัส pttype/paccount: `^[A-Za-z0-9._-]{1,20}$`
- เขียน HOSxP: `DELETE FROM paccountopd|paccountipd WHERE pttype = ?` แล้ว `INSERT (pttype, paccount, iclaim_status, paccount_year, last_modify) VALUES (?, ?, 1, 2017, NOW())` เฉพาะฝั่งที่เปลี่ยน
- ผังบัญชีปัจจุบัน = แถว `last_modify` ล่าสุด (NULL ถือว่าเก่าสุด) เท่ากันเลือก `paccount` น้อยสุด
- ชื่อผังบัญชี = แถว `paccount` ของรหัสนั้นที่ `paccount_year` มากสุด; ตัวเลือก OPD: `LOWER(type) IN ('opd','all')`, IPD: `('ipd','all')`
- audit action `pttype_mapping.update`, targetType `pttype`, metadata `{ pttype, opd: { from, to }, ipd: { from, to } }`; export action `pttype_mapping.export` metadata `{ exportKind: 'pttype-mapping', rows }`
- `last_modify` เป็นเวลาท้องถิ่นของ HOSxP (Asia/Bangkok) แสดงตรง ๆ แบบ "13 พ.ย. 2569 14:05" ไม่แปลงโซน
- popup ปิดได้จากปุ่มเท่านั้น (FormDialog), การ์ดค้นหา `SearchCard`, วันที่ `ThaiDateInput`
- ห้ามรหัสผ่าน HOSxP ใน log/response; log เฉพาะ error code

## Review Focus

1. สิทธิที่มีหลายแถวใน `paccountopd` (ข้อมูลเก่าจากหลายปี) → แสดงแถว `last_modify` ล่าสุด และการบันทึกลบทุกแถวของฝั่งนั้น (ทดสอบใน Task 3)
2. บัญชี HOSxP ไม่มีสิทธิ์เขียน (errno 1142) → ตอบ `NO_WRITE_PERMISSION` ข้อความไทย ไม่ใช่ 500 (Task 3, 5)
3. สองคนแก้สิทธิเดียวกันพร้อมกัน → คนหลังได้ `STALE` 409 ไม่ทับ (Task 3)
4. ผังบัญชีที่ผูกอยู่แต่ไม่มีใน `paccount` แล้ว → แสดงรหัสพร้อม "(ไม่พบในผังบัญชี)" และยังเปิด popup ได้ (Task 3, 6)
5. ชื่อไทย TIS-620 ใน `pttype.name`/`paccount.name` → อ่านผ่าน `fixThaiText` (Task 3)

---

### Task 1: Contracts, permission และ role

**Files:**
- Create: `packages/contracts/src/pttype-mapping.ts`, `packages/contracts/src/pttype-mapping.test.ts`
- Modify: `packages/contracts/src/access.ts`, `packages/contracts/src/admin.ts`, `packages/contracts/src/index.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/module-manager-scope.ts`, `packages/core/src/access/authorization-service.test.ts`, `apps/web/src/lib/admin-labels.ts`, `apps/web/src/lib/role-choice-labels.ts`, `packages/i18n/src/th.ts`

**Interfaces — Produces:**
- `PTTYPE_MAPPING_MODULE = 'pttype-mapping'`
- `hosxpCodeSchema` (string regex above), `pttypeMappingInputSchema` = `{ opd: code|null, ipd: code|null, expected: { opd: code|null, ipd: code|null } }` strict; type `PttypeMappingInput`

- [x] Step 1: test `pttype-mapping.test.ts`: permissionModules['pttype-mapping.manage'] === 'pttype-mapping'; grantableRoleSchema accepts `pttype-mapping-manager` and `pttype-mapping-tester`; input schema accepts `{opd:'1102050101.301', ipd:null, expected:{opd:null, ipd:null}}`, rejects `opd:'x y'`, `opd:''`, extra key; authorization table row `{ role: 'pttype-mapping-manager', module: 'pttype-mapping', own: ['pttype-mapping.manage'], other: 'money.manage' }`
- [x] Step 2: `pnpm --filter @backoffice/contracts test` → FAIL (module missing)
- [x] Step 3: implement; i18n keys `modulePttypeMapping: 'Mapping สิทธิ'`, `modulePttypeMappingDescription: 'ผูกผังบัญชี OPD/IPD กับสิทธิการรักษาใน HOSxP'`, `adminRolePttypeMappingManager: 'ผู้จัดการโมดูล Mapping สิทธิ'`, `roleDescPttypeMappingManager`, `pttypeMappingBoard: 'ผูกผังบัญชี'`, `pttypeMappingHistory: 'ประวัติการแก้ไข'`; labels in admin-labels/role-choice-labels
- [x] Step 4: `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization-service` → PASS
- [x] Step 5: commit `feat(pttype-mapping): contracts, permission and manager role`

### Task 2: Access check

**Files:** Create `packages/core/src/pttype-mapping/pttype-mapping-access.ts` + `.test.ts`; Modify `packages/core/src/index.ts`

**Produces:** `canManagePttypeMapping(subject: AccessSubject): boolean` (= `organizationScope(subject, 'pttype-mapping.manage') === 'all'`)

- [x] Step 1: test admin → true, `pttype-mapping-manager` → true, `money-manager` → false, no roles → false
- [x] Step 2: run → FAIL; Step 3: implement; Step 4: run → PASS; Step 5: commit `feat(pttype-mapping): access check`

### Task 3: HOSxP reader and writer

**Files:**
- Create: `packages/core/src/pttype-mapping/pttype-mapping-hosxp.ts`, `packages/core/src/pttype-mapping/fixtures/fake-hosxp-mapping.ts`, `packages/core/src/pttype-mapping/pttype-mapping-hosxp.integration.test.ts`

**Produces:**
- types `MappingSide = 'opd' | 'ipd'`; `MappedAccount = { code: string; name: string | null; modifiedAt: string | null }` (`modifiedAt` = `'YYYY-MM-DD HH:mm:ss'` HOSxP local); `PttypeRight = { code: string; name: string; opd: MappedAccount | null; ipd: MappedAccount | null }`; `AccountOption = { code: string; name: string }`; `MappingSnapshot = { rights: PttypeRight[]; opdAccounts: AccountOption[]; ipdAccounts: AccountOption[] }`
- `readPttypeMappings(connection: HosxpConnection): Promise<MappingSnapshot>`
- `writePttypeMapping(connection, pttype: string, input: PttypeMappingInput): Promise<MappingWrite>` where `MappingWrite = { ok: true; from: { opd: string | null; ipd: string | null } } | { ok: false; code: 'NOT_FOUND' | 'STALE' | 'INVALID_ACCOUNT' | 'NO_CHANGE' }`; throws driver errors (service maps them)
- `seedFakeMappingHosxp(db, data)` creating `pttype(pttype, name, isuse)`, `paccount(paccount, paccount_year, name, type)`, `paccountopd`/`paccountipd(pttype, paccount, iclaim_status, paccount_year, last_modify DATETIME NULL)` latin1, InnoDB

- [x] Step 1: integration tests (skip without `DATABASE_ADMIN_URL`, fresh database per suite like `dental-reader.integration.test.ts`):
  - reads only `isuse='Y'`, ordered by code, Thai names repaired
  - pttype with rows 2016 (last_modify 2020-01-01) and 2017 (2026-11-01) → opd.code = the 2026 row; modifiedAt `'2026-11-01 09:00:00'`
  - account names from max year; options split by type with `all` in both
  - mapped code missing from `paccount` → `name: null`
  - write OPD only: all OPD rows replaced by one row `(pttype, code, 1, 2017, NOW())`, IPD rows untouched, returns `from`
  - write `opd: null` → OPD rows deleted, none inserted
  - expected ≠ current → `STALE`, nothing changed
  - account of wrong type or unknown → `INVALID_ACCOUNT`; `isuse='N'` or unknown pttype → `NOT_FOUND`; same as current → `NO_CHANGE`
- [x] Step 2: `DATABASE_ADMIN_URL=… pnpm --filter @backoffice/core exec vitest run src/pttype-mapping` → FAIL
- [x] Step 3: implement; write = one `transaction`: `SELECT … FROM pttype WHERE pttype = ? AND isuse = 'Y' FOR UPDATE`, current per side with `SELECT … FOR UPDATE`, validate, delete/insert changed sides
- [x] Step 4: run → PASS; Step 5: commit `feat(pttype-mapping): HOSxP reader and writer`

### Task 4: Service with audit, history and export audit

**Files:** Create `packages/core/src/pttype-mapping/pttype-mapping-service.ts`, `.test.ts`, `.integration.test.ts`; Modify `packages/core/src/audit/redact.ts` (allow `pttype`, `opd`, `ipd`), `packages/core/src/index.ts`

**Produces:** `class PttypeMappingService(database: Database, resolveConnection: () => Promise<HosxpConnection | null>, io = { read: readPttypeMappings, write: writePttypeMapping }, createId = randomUUID)`:
- `load(): Promise<{ ok: true; snapshot: MappingSnapshot; editors: Record<string, { name: string | null; at: string }> } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' }>` (editors = latest `pttype_mapping.update` per target_id with actor display_name, `at` ISO UTC)
- `save(subject: AccessSubject & { personId: string }, pttype: string, input: PttypeMappingInput): Promise<{ ok: true } | { ok: false; code: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'HOSXP_FAILED' | 'NO_WRITE_PERMISSION' | MappingWrite['code'] }>`; errno 1142/1044/1045 → `NO_WRITE_PERMISSION`, other errors → `HOSXP_FAILED` (log `[pttype-mapping]` + code only); audit after a successful write; audit failure logged, still ok
- `history(limit = 200): Promise<MappingHistoryRow[]>` with `MappingHistoryRow = { id; at; actorName: string | null; pttype: string; opd: { from: string | null; to: string | null } | null; ipd: … | null }` (side `null` when unchanged)
- `recordExport(personId: string, rows: number): Promise<void>`

- [x] Step 1: unit tests with fake io: non-manager → FORBIDDEN and io.write not called; NOT_CONFIGURED; errno 1142 → NO_WRITE_PERMISSION; STALE passes through; success records audit with metadata `{ pttype:'34', opd:{from:null,to:'P1'}, ipd:{from:'P2',to:'P2'} }` → only changed side kept; integration test: history returns that row with actor name
- [x] Step 2: run → FAIL; Step 3: implement; Step 4: run → PASS; Step 5: commit `feat(pttype-mapping): service, audit and history`

### Task 5: API routes

**Files:** Create `apps/web/src/app/api/pttype-mapping/[pttype]/route.ts`, `apps/web/src/app/api/pttype-mapping/export/route.ts`, `apps/web/src/app/api/pttype-mapping/route.test.ts`; Modify `apps/web/src/lib/hosxp.ts` (`pttypeMappingService(database)`), `packages/core/src/pttype-mapping/mapping-csv.ts` (+test: `mappingCsv(rights)` BOM-less UTF-8, header `รหัสสิทธิ,สิทธิการรักษา,รหัสผังบัญชี OPD,ผังบัญชี OPD,รหัสผังบัญชี IPD,ผังบัญชี IPD`)

- PUT: `withSessionAndDatabase`; `readInput(request, pttypeMappingInputSchema)`; pttype param must match `hosxpCodeSchema` else 400; status map: FORBIDDEN 403, NOT_FOUND 404, STALE 409, INVALID_ACCOUNT/NO_CHANGE 422, NOT_CONFIGURED/HOSXP_FAILED/NO_WRITE_PERMISSION 503
- GET export `?pttype=a,b,…` (codes currently shown, max 2000): manager only, audit, `text/csv; charset=utf-8`, filename `pttype_mapping.csv`

- [x] Step 1: route tests (mock service like `api/money/route.test.ts`): 403 for non-manager, 400 bad body, 409 STALE, 503 NO_WRITE_PERMISSION, 200 ok; export 403/200 with CSV header
- [x] Step 2: FAIL; Step 3: implement; Step 4: PASS; Step 5: commit `feat(pttype-mapping): save and export API`

### Task 6: หน้า "ผูกผังบัญชี"

**Files:** Create `apps/web/src/app/(app)/pttype-mapping/layout.tsx`, `page.tsx`, `mapping-context.ts`, `mapping-board.tsx`, `mapping-dialog.tsx`, `mapping-board.test.tsx`, `apps/web/src/lib/pttype-mapping-client.ts`; Modify `apps/web/src/lib/modules.ts` (+test), `apps/web/src/lib/module-gate.test.ts`, `apps/web/src/app/styles.css` (`[data-module="pttype-mapping"] { --accent: #9a3412; }` + `.mapping-*` classes)

- registry: `withSections({ code: 'pttype-mapping', href: '/pttype-mapping', labelKey: 'modulePttypeMapping', descriptionKey: 'modulePttypeMappingDescription', icon: 'link', group: 'services', status: 'live' }, [{ href: '/pttype-mapping', … 'pttypeMappingBoard' }, { href: '/pttype-mapping/history', … 'pttypeMappingHistory' }])`, available = `canManagePttypeMapping`
- `MappingBoard({ snapshot, editors })`: tiles (สิทธิที่ใช้งาน / ผูกครบแล้ว / ยังไม่ผูก OPD / ยังไม่ผูก IPD) set filter `all|complete|missing-opd|missing-ipd`; SearchCard query matches code, name, account code/name; filters สถานะการผูก and ผังบัญชี; table; button "ผูกผังบัญชี" opens `MappingDialog`
- `MappingDialog({ right, opdAccounts, ipdAccounts, open, onOpenChange, onSaved })`: FormDialog wide, two selects with "— ยังไม่ผูก —", "เดิม: …", note, submit "บันทึกลง HOSxP" ready only when changed; PUT then `router.refresh()`; STALE → message and refresh
- [x] Step 1: component tests: tiles counts and filter; search by account code; dialog submit disabled until change; sends `{opd, ipd, expected}`; shows Thai STALE copy; registry test (manager sees module, others don't); gate test `moduleForPath('/pttype-mapping/history') === 'pttype-mapping'`
- [x] Step 2: FAIL; Step 3: implement; Step 4: PASS; Step 5: commit `feat(pttype-mapping): mapping board and dialog`

### Task 7: หน้าประวัติการแก้ไข

**Files:** Create `apps/web/src/app/(app)/pttype-mapping/history/page.tsx`, `history-table.tsx`, `history-table.test.tsx`

- SearchCard: query (รหัสสิทธิ/ชื่อผู้แก้) + ตั้งแต่วันที่/ถึงวันที่ `ThaiDateInput` (start sets end via `endFollowingStart`); columns วันเวลา · ผู้แก้ · สิทธิ · OPD เดิม → ใหม่ · IPD เดิม → ใหม่ ("—" when unchanged, "ยังไม่ผูก" for null)
- [x] Step 1: tests filter by query and date range (Bangkok date of `at`); Step 2: FAIL; Step 3: implement; Step 4: PASS; Step 5: commit `feat(pttype-mapping): change history page`

### Task 8: รายงานลูกหนี้ทันตกรรมใช้แถวล่าสุด

**Files:** Modify `packages/core/src/smart-money/dental-reader.ts`, `packages/core/src/smart-money/fixtures/fake-hosxp.ts` (paccountopd gains `last_modify DATETIME NULL`, seed tuple gains optional modifiedAt), `dental-reader.integration.test.ts`, `seed-demo-hosxp.ts` if it seeds paccountopd

- [x] Step 1: integration test: pttype 89 rows `P89OLD` (2025, 2020-01-01), `P89NEW` (2017, 2026-11-01) → name of `P89NEW` from its max-year paccount row regardless of visit year; Step 2: FAIL; Step 3: subquery `ORDER BY pa.last_modify IS NULL, pa.last_modify DESC, pa.paccount LIMIT 1` and name from `paccount` max year; Step 4: PASS; Step 5: commit `fix(money): dental ผังบัญชี follows the latest mapping row`

### Task 9: Docs, full verification, screenshots, PR

- [x] CONTEXT.md section "Mapping สิทธิ" (terms: ผูกผังบัญชี, ผังบัญชีปัจจุบัน, ผู้จัดการโมดูล Mapping สิทธิ); update Smart Money "ผังบัญชี (ลูกหนี้ทันตกรรม)" rule; DESIGN.md one line for the module accent
- [x] `pnpm lint && pnpm typecheck && pnpm test`; `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm test:integration`; `git diff --check`
- [x] Screenshots 1280/390 of the real pages against a seeded fake HOSxP → `/mnt/project-files/claim-mapping/screens/real-*.png`
- [ ] Code review, PR, merge on green CI
