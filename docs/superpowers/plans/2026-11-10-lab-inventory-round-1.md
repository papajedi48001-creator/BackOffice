# รายงานวัสดุคงคลัง Lab — รอบ 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship round 1 of the `lab-inventory` module: settings and members, CSV import + certification of ยอดยกมา, ใบรับเข้า at คลังหลัก, ใบขอเบิก with หัวหน้า Lab approval and FEFO issue, ตัดใช้ with reversal, and balance/ledger pages.

**Architecture:** Same layering as `mass-casualty`: zod contracts in `packages/contracts/src/lab-inventory.ts`, an additive migration plus Drizzle schema, pure rules + services + queries in `packages/core/src/lab-inventory/`, thin route handlers under `apps/web/src/app/api/lab/**`, server-component pages under `apps/web/src/app/(app)/lab/**`. Stock lives in `lab_lot_balance` (current) and `lab_movement` (append-only), always written together under `SELECT … FOR UPDATE`. Fully separate from the `inventory` module: no shared tables, services or permissions.

**Tech Stack:** TypeScript, Next.js App Router, React, zod, MariaDB (mysql2 via `@backoffice/db`), Drizzle schema, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-lab-inventory-design.md` (decisions log `/mnt/project-files/lab-inventory/decisions.md`)

## Global Constraints

- Module code `lab-inventory`, label "รายงานวัสดุคงคลัง Lab", href `/lab`, group `services`, accent `#0F766E`, icon `flask` (or the nearest existing icon name in `modules.ts`).
- Permission `lab.manage` → `permissionModules['lab.manage'] = 'lab-inventory'`; manager role `lab-manager` → `['lab.manage']`; tester role `lab-inventory-tester`; `lineAlertModuleCodes` gains `lab-inventory`.
- Member roles `HEAD | KEEPER | STAFF` = หัวหน้า Lab, ผู้ดูแลคลัง Lab, เจ้าหน้าที่ Lab. STAFF needs ≥ 1 section; HEAD/KEEPER have none.
- Quantities are whole usage units (`INT`, > 0 on input). Price `DECIMAL(12,2)` per receive unit; unit cost `DECIMAL(14,4)` = price ÷ `units_per_receive`, fixed when the lot is created.
- Movement kinds `OPENING | RECEIPT | RECEIPT_VOID | ISSUE_OUT | ISSUE_IN | USE | USE_REVERSAL | ADJUSTMENT` (ADJUSTMENT unused until round 2).
- Requisition status `SUBMITTED | RETURNED | REJECTED | APPROVED | ISSUED | CANCELLED`; opening status `DRAFT | SUBMITTED | CERTIFIED`.
- Doc numbers `LR-<พ.ศ. fiscal year>-<4 digits>` (receipt), `LQ-…` (requisition); Thai fiscal year starts 1 October (2026-11-10 → 2570).
- Seeds: คลังหลัก; sections เคมีคลินิก, โลหิตวิทยา, จุลชีววิทยา, ธนาคารเลือด, ภูมิคุ้มกันวิทยา, จุลทรรศนศาสตร์คลินิก (each with its SECTION store); usage types ตรวจผู้ป่วย, QC, Calibration, ชำรุดระหว่างใช้, อื่น ๆ. Fixed uuids `00000000-0000-4000-b000-0000000000NN` via `INSERT IGNORE`.
- Migration `0034_lab_inventory.sql` (0033 is claimed by attendance; take the next free number on main at implementation time and update this line), additive, idempotent, no `;` inside string literals.
- Every popup is `FormDialog`/`ActionDialog` (closes from its buttons only). Date-range forms: picking the start sets the end to the same day.
- Writes + audit + outbox in one transaction; decision/void/reversal reasons never in audit metadata, URLs, logs, notifications or outbox payloads.
- Self-decision on a requisition: allowed only when `canDecideOwnRequest(subject.activeRole)`; reason required; audit metadata `selfApproval: true` and `actor_role` set; otherwise `CONFLICT_OF_INTEREST`.
- UTC in DB, Asia/Bangkok on screen; `entry_date`/`received_on` are Bangkok calendar dates.

## Review Focus

1. Two KEEPERs issuing from the same last lot at once → one succeeds, the other gets `INSUFFICIENT_STOCK`, balance never negative (Task 6 integration test).
2. A STAFF member posting ตัดใช้ or reading balances for a section they don't belong to by editing the request body/query → 403 (Tasks 3 and 9).
3. CSV saved by Excel with BOM, CRLF, Buddhist-era dates `31/12/2569`, blank trailing rows, or a duplicate lot row → whole file rejected with row numbers, nothing saved; valid file parses (Task 4).
4. Using or issuing a lot whose expiry is before the entry date, and FEFO ordering with null-expiry lots last → `LOT_EXPIRED` / correct order (Tasks 3 and 7).
5. Any stock write before ยอดยกมา is certified → 409 `OPENING_NOT_CERTIFIED` (Tasks 5–7).

---

### Task 1: Contracts, permission and roles

**Files:**
- Create: `packages/contracts/src/lab-inventory.ts`, `packages/contracts/src/lab-inventory.test.ts`
- Modify: `packages/contracts/src/index.ts`, `access.ts`, `admin.ts`, `line.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/module-manager-scope.ts`, `packages/core/src/access/authorization-service.test.ts`, `apps/web/src/lib/admin-labels.ts`, `apps/web/src/lib/role-choice-labels.ts` (keys needed for exhaustive Records)

**Interfaces (Produces):**
- `LAB_MODULE = 'lab-inventory'`; `labMemberRoleSchema = z.enum(['HEAD','KEEPER','STAFF'])`; `labMovementKindSchema`; `labRequisitionStatusSchema`.
- Inputs (all `.strict()`): `labItemInputSchema { code /^[A-Za-z0-9-]{1,30}$/, name 1–200, receiveUnit 1–30, useUnit 1–30, unitsPerReceive int 1–100000, expiryWarnDays int 0–3650 (default 90), isActive, reorderPoints: {storeId uuid, reorderPoint int ≥ 0}[] max 50 }`; `labSectionInputSchema { code /^[A-Z0-9-]{1,20}$/, name 1–80, sortOrder int, isActive }`; `labVendorInputSchema { name 1–200, phone 0–40, isActive }`; `labUsageTypeInputSchema { name 1–60, sortOrder, isActive }`; `labMemberInputSchema { personId uuid, role, sectionIds uuid[] max 20 }` refined: STAFF ⇒ ≥ 1 section, else 0.
- `labDateSchema` = `YYYY-MM-DD` string.
- `labReceiptInputSchema { receivedOn: labDate, vendorId uuid, invoiceNo 0–60, lines: { itemId, lotNo 1–60, expiryDate labDate|null, quantityReceive int 1–1_000_000, pricePerReceive number 0–9_999_999_999.99 (2 dp) }[] 1–100 }`.
- `labRequisitionInputSchema { sectionId uuid, note 0–500, lines: { itemId, quantity int ≥ 1 }[] 1–100 }` (items unique).
- `labDecisionInputSchema { decision: 'APPROVE'|'RETURN'|'REJECT', reason 0–1000 }` refined: RETURN/REJECT need reason.
- `labIssueInputSchema { note 0–500, lines: { lineId uuid, picks: { lotId uuid, quantity int ≥ 1 }[] max 20 }[] }`.
- `labUsageInputSchema { storeId uuid, itemId uuid, quantity int ≥ 1, usageTypeId uuid, entryDate labDate, note 0–500, picks: { lotId, quantity }[] max 20 | null }` (null = FEFO).
- `labReasonInputSchema { reason 1–1000 }` (void, reverse, return-opening).
- Permission `lab.manage`; `grantableRoleSchema` + `lab-manager`; `testerModuleCodes` + `lab-inventory`; `lineAlertModuleCodes` + `lab-inventory`; policy `'lab-manager': ['lab.manage']`; `moduleManagerRoles['lab-inventory'] = 'lab-manager'`.

- [ ] **Step 1: Write failing tests** — contracts: STAFF member with no section rejected, HEAD with a section rejected; REJECT without reason rejected; receipt with 0 lines or `pricePerReceive: 1.234` rejected; unknown key rejected; `permissionModules['lab.manage'] === 'lab-inventory'`. Core: unscoped `lab-manager` → `organizationScope(subject,'lab.manage') === 'all'`; plain staff → `[]`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/contracts test && pnpm --filter @backoffice/core test -- authorization` → FAIL (module missing).
- [ ] **Step 3: Implement** schemas, map and role entries; add label keys so `pnpm typecheck` passes.
- [ ] **Step 4: Run** the same + `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lab): add lab-inventory contracts, lab.manage and lab-manager`

### Task 2: Migration and Drizzle schema

**Files:**
- Create: `packages/db/migrations/0034_lab_inventory.sql`, `packages/db/src/schema/lab-inventory.ts`, `packages/db/src/schema/lab-inventory-schema.integration.test.ts`
- Modify: `packages/db/src/migrate.ts` (append), `packages/db/src/migrate.test.ts`, `packages/db/src/index.ts`

Tables exactly as the spec's "ข้อมูล" section with FKs, plus: `lab_doc_counter (prefix VARCHAR(8), fiscal_year SMALLINT, last_no INT, PK(prefix, fiscal_year))`; `lab_lot_balance` `CHECK (quantity >= 0)`; `lab_lot` unique `(item_id, lot_no, expiry_key, unit_cost)` where `expiry_key` is a generated column `IFNULL(expiry_date,'9999-12-31')` (so null expiry also merges); `lab_store` unique `section_id`; `lab_movement` keys `(store_id, entry_date)`, `(lot_id)`, `(ref_type, ref_id)`; `lab_setting` seeded `opening_status = DRAFT`. Settings tables carry `created_at`, `updated_at`.

- [ ] **Step 1: Write failing integration test**: after migrations, 1 MAIN store, 6 sections each with a SECTION store, 5 usage types, `opening_status` = `DRAFT`; inserting a balance with `quantity = -1` fails; inserting two lots with same item/lot/null expiry/cost fails `ER_DUP_ENTRY`.
- [ ] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/db test:integration -- lab-inventory` → FAIL.
- [ ] **Step 3: Implement** SQL, schema, version list.
- [ ] **Step 4: Run** the integration test and `pnpm --filter @backoffice/db test` → PASS.
- [ ] **Step 5: Commit** `feat(db): add lab inventory tables (0034)`

### Task 3: Pure rules and access

**Files:**
- Create: `packages/core/src/lab-inventory/lab-rules.ts`, `lab-rules.test.ts`, `lab-access.ts`, `lab-access.test.ts`, `lab-db.ts` (audit/outbox helpers copied in shape from `mci-db.ts`)
- Modify: `packages/core/src/index.ts`

**Interfaces (Produces):**
- `type LotOption = { lotId: string; expiryDate: string | null; createdAt: string; available: number }`
- `pickFefo(lots: readonly LotOption[], quantity: number, entryDate: string): { ok: true; picks: { lotId; quantity }[] } | { ok: false; code: 'INSUFFICIENT_STOCK' }` — skips lots with `expiryDate < entryDate`, orders by expiry asc (null last) then `createdAt`.
- `checkPicks(lots, picks, entryDate): { ok: true } | { ok: false; code: 'LOT_EXPIRED' | 'INSUFFICIENT_STOCK' | 'NOT_FOUND' }`
- `unitCost(pricePerReceive: number, unitsPerReceive: number): string` (4 dp string, rounded half-up)
- `formatQuantity(qty: number, useUnit: string, receiveUnit: string, unitsPerReceive: number): string` → `"25 ขวด (2 กล่อง 5 ขวด)"`; factor 1 or qty < factor → `"5 ขวด"`.
- `fiscalYearBE(date: string): number`; `formatDocNo(prefix: 'LR'|'LQ', fiscalYear: number, n: number): string` → `LR-2570-0001`.
- `nextRequisitionStatus(current, event: 'APPROVE'|'RETURN'|'REJECT'|'RESUBMIT'|'CANCEL'|'ISSUE'): LabRequisitionStatus | null` (null = not allowed).
- `type LabMember = { role: LabMemberRole; sectionIds: string[] } | null`
- `type LabAction = 'manageMembers' | 'manageSettings' | 'editOpening' | 'certifyOpening' | 'receive' | 'request' | 'decide' | 'issue' | 'use' | 'reverseAnyUse' | 'viewStock'`
- `labCan(member: LabMember, manages: boolean, action: LabAction, sectionId?: string | null): boolean` — spec table; `manages` (`lab.manage`) allows everything; STAFF `request`/`use`/`viewStock` only for own sections (`sectionId` null = main store → false).
- `canManageLab(subject: AccessSubject): boolean` via `AuthorizationService.organizationScope(subject,'lab.manage') === 'all'`.
- `loadLabMember(database, personId): Promise<LabMember>`.

- [ ] **Step 1: Write failing tests**: every row of the spec permission table for each role and `manages`; STAFF on another section → false; `pickFefo` over `[{exp 2026-12-01, 5}, {null, 10}, {2026-11-20, 3}]` qty 6 → picks 3 from 11-20 then 3 from 12-01; expired lot skipped; qty 99 → `INSUFFICIENT_STOCK`; `unitCost(1250, 12) === '104.1667'`; `formatQuantity(25,'ขวด','กล่อง',10) === '25 ขวด (2 กล่อง 5 ขวด)'`; `fiscalYearBE('2026-09-30') === 2569`, `('2026-10-01') === 2570`; `nextRequisitionStatus('ISSUED','CANCEL') === null`, `('RETURNED','RESUBMIT') === 'SUBMITTED'`.
- [ ] **Step 2: Run** `pnpm --filter @backoffice/core test -- lab-` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(lab): add FEFO, unit, document and access rules`

### Task 4: Settings, members and CSV import parsing

**Files:**
- Create: `packages/core/src/lab-inventory/lab-settings-service.ts`, `lab-settings-service.integration.test.ts`, `lab-settings-queries.ts`, `lab-csv.ts`, `lab-csv.test.ts`

**Interfaces (Produces):**
- `class LabSettingsService(database, createId?)`: `saveItem(subject, id|null, input)`, `saveSection(subject, id|null, input)` (new section creates its SECTION store), `saveVendor(…)`, `saveUsageType(…)`, `saveMember(subject, input)`, `removeMember(subject, personId)`. Result `{ ok: true; id? } | { ok: false; code: 'FORBIDDEN'|'NOT_FOUND'|'DUPLICATE'|'ITEM_HAS_STOCK'|'PROTECTED' }`. `ITEM_HAS_STOCK`: changing `unitsPerReceive` once a lot exists. `PROTECTED`: deactivating the last active usage type. Members require `manageMembers`; others `manageSettings`. Audit `lab.settings.<kind>.save`, `lab.member.save|remove`.
- `class LabSettingsQueries(database)`: `settings(): Promise<LabSettings>` = `{ mainStoreId; sections: {id; code; name; storeId; isActive}[]; items; vendors; usageTypes; members: {personId; displayName; role; sectionIds}[]; openingStatus }`.
- `lab-csv.ts`: `itemTemplateCsv(): string`, `openingTemplateCsv(): string` (UTF-8 BOM + Thai headers); `parseItemCsv(text): { ok: true; rows: LabItemInput[] } | { ok: false; errors: { row: number; message: string }[] }`; `parseOpeningCsv(text, lookup: { storeIdByCode(code): string|null; itemIdByCode(code): string|null }): { ok: true; rows: OpeningRow[] } | { ok: false; errors }`. Headers ทะเบียน: `รหัส,ชื่อ,หน่วยรับ,หน่วยใช้,อัตราแปลง,จุดสั่งซื้อคลังหลัก`; ยอดยกมา: `คลัง,รหัสวัสดุ,เลขล็อต,วันหมดอายุ,จำนวนหน่วยใช้,ต้นทุนต่อหน่วยใช้` (คลัง = `คลังหลัก` or section code). Dates `YYYY-MM-DD` or `DD/MM/YYYY` with year > 2400 → BE − 543. Uses `parseCsv` from `../hr/csv`.

- [ ] **Step 1: Write failing tests** — unit `lab-csv.test.ts`: BOM + CRLF + trailing blank line parses; `31/12/2569` → `2026-12-31`; unknown item code → error with row 3; duplicate (store,item,lot,expiry) → error; template round-trips through its own parser with zero rows. Integration: add/rename item, duplicate code → `DUPLICATE`, change factor after a lot exists → `ITEM_HAS_STOCK`, new section gets a store, STAFF member saved with sections, non-manager `saveMember` → `FORBIDDEN`, audit row per save.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @backoffice/core test -- lab-csv` and `test:integration -- lab-settings`).
- [ ] **Step 5: Commit** `feat(lab): add settings, members and CSV import parsing`

### Task 5: Opening balances (ยอดยกมา)

**Files:**
- Create: `packages/core/src/lab-inventory/lab-opening-service.ts`, `lab-opening-service.integration.test.ts`, `lab-stock-writer.ts`

**Interfaces (Produces):**
- `lab-stock-writer.ts` (used by Tasks 5–7, inside a transaction): `lockBalances(tx, storeId, itemId): Promise<LotOption[]>` (`FOR UPDATE`, joins lot); `move(tx, m: { lotId; storeId; quantity: number; kind; entryDate; usageTypeId?; refType; refId; note?; actorPersonId }): Promise<void>` — upserts `lab_lot_balance` (+/−; a negative result throws `INSUFFICIENT_STOCK`) and inserts `lab_movement`; `findOrCreateLot(tx, { itemId; lotNo; expiryDate; unitCost; source; receiptLineId? }): Promise<string>`; `requireCertified(tx): Promise<void>` throws `OPENING_NOT_CERTIFIED`; `nextDocNo(tx, prefix, fiscalYear): Promise<string>` (locks `lab_doc_counter`).
- `class LabOpeningService(database, createId?)`: `importItems(subject, csv)`, `importOpening(subject, csv)` (replaces draft lines; only in DRAFT), `saveLine(subject, id|null, row)`, `deleteLine(subject, id)`, `submit(subject)`, `decide(subject, { decision: 'CERTIFY'|'RETURN', reason })`. Results `{ ok: true } | { ok: false; code: 'FORBIDDEN'|'INVALID_CSV'|'WRONG_STATUS'|'REASON_REQUIRED'; errors? }`. Certify: per line `findOrCreateLot(source OPENING)` + `move(kind OPENING, entryDate = today Bangkok)`, set `opening_status = CERTIFIED`, `opening_certified_at`. Notices: submit → HEAD members (`notification.in_app`, `targetPath '/lab/opening'`); decide → submitter. Audit `lab.opening.import|submit|certify|return` with line counts only.

- [ ] **Step 1: Write failing integration tests**: KEEPER imports CSV → draft lines; invalid CSV → `INVALID_CSV` with row errors and no rows written; HEAD certifies → balances equal CSV, one OPENING movement per line, status CERTIFIED; second certify → `WRONG_STATUS`; import after certification → `WRONG_STATUS`; STAFF submit → `FORBIDDEN`; RETURN without reason → `REASON_REQUIRED`; outbox payload has no reason text.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(lab): import and certify opening balances`

### Task 6: Receipts and requisitions

**Files:**
- Create: `packages/core/src/lab-inventory/lab-receipt-service.ts`, `lab-requisition-service.ts`, `lab-receipt-service.integration.test.ts`, `lab-requisition-service.integration.test.ts`

**Interfaces (Produces):**
- `class LabReceiptService(database, createId?)`: `create(subject, input: LabReceiptInput): Promise<{ ok: true; receiptId; docNo } | { ok: false; code: 'FORBIDDEN'|'OPENING_NOT_CERTIFIED'|'NOT_FOUND'|'FUTURE_DATE'|'EXPIRY_BEFORE_RECEIPT' }>` — RECEIPT into main store, quantity = `quantityReceive × unitsPerReceive`, `unitCost()` from Task 3. `void(subject, receiptId, { reason })` → codes `NOT_FOUND|WRONG_STATUS|RECEIPT_LOT_IN_USE`; `RECEIPT_LOT_IN_USE` when any lot of the receipt has a movement other than its RECEIPT. Audit `lab.receipt.create|void` `{ docNo, lines }`.
- `class LabRequisitionService(database, createId?)`: `create(subject, input)` → `{ ok: true; requisitionId; docNo }`; `resubmit(subject, id, input)`; `cancel(subject, id)`; `decide(subject, id, input: LabDecisionInput)`; `issue(subject, id, input: LabIssueInput)`. Codes `FORBIDDEN|NOT_FOUND|WRONG_STATUS|OPENING_NOT_CERTIFIED|CONFLICT_OF_INTEREST|REASON_REQUIRED|OVER_REQUESTED|NOTE_REQUIRED|LOT_EXPIRED|INSUFFICIENT_STOCK`. Issue: per line picks (empty picks = 0 issued), sum ≤ requested else `OVER_REQUESTED`, any short line needs `note` else `NOTE_REQUIRED`; `checkPicks` against locked main-store lots; ISSUE_OUT main + ISSUE_IN section store per pick; status ISSUED. Self-decision per Global Constraints. Notices: create/resubmit → HEADs and `lab.manage` holders; decision → requester (+ KEEPERs on APPROVE); issue → requester. Audit `lab.requisition.<event>` with `{ docNo, status, selfApproval? }`.
- Requisition queries for the issue dialog: `LabQueries.fefoSuggestion(requisitionId)` lives in Task 8; the service only validates picks.

- [ ] **Step 1: Write failing integration tests**: receipt of 2 กล่อง × 10 at 1,250 → main balance 20, unit cost 125.0000, docNo `LR-2570-0001` then `-0002`; void untouched receipt → balance 0; void after an issue → `RECEIPT_LOT_IN_USE`; STAFF requests for another section → `FORBIDDEN`; HEAD decides own request in employee tier → `CONFLICT_OF_INTEREST`, in manager tier with reason → ok and audit `selfApproval: true`; issue more than requested → `OVER_REQUESTED`; short without note → `NOTE_REQUIRED`; two concurrent issues of the last 5 units → one `INSUFFICIENT_STOCK`, balance 0 not negative; expired lot pick → `LOT_EXPIRED`; before certification → `OPENING_NOT_CERTIFIED`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(lab): receive stock and issue approved requisitions`

### Task 7: Usage (ตัดใช้) and reversal

**Files:**
- Create: `packages/core/src/lab-inventory/lab-usage-service.ts`, `lab-usage-service.integration.test.ts`

**Interfaces (Produces):**
- `class LabUsageService(database, createId?)`: `record(subject, input: LabUsageInput): Promise<{ ok: true; usageId; picks: { lotId; quantity }[] } | { ok: false; code: 'FORBIDDEN'|'OPENING_NOT_CERTIFIED'|'NOT_FOUND'|'MAIN_STORE'|'FUTURE_DATE'|'LOT_EXPIRED'|'INSUFFICIENT_STOCK' }>` — section stores only (`MAIN_STORE` otherwise); picks null → `pickFefo`, else `checkPicks`; one USE movement per pick. `reverse(subject, usageId, { reason })` → `NOT_FOUND|FORBIDDEN|WRONG_STATUS`; STAFF may reverse only their own record; USE_REVERSAL per original movement, same entry date. Audit `lab.usage.record|reverse` `{ itemId, quantity, usageTypeId }`.

- [ ] **Step 1: Write failing integration tests**: STAFF uses 6 from own section with FEFO → picks oldest expiry first and balances drop; other section → `FORBIDDEN`; main store → `MAIN_STORE`; `entryDate` tomorrow → `FUTURE_DATE`; manual pick of an expired lot → `LOT_EXPIRED`; reverse restores balances and keeps the USE rows; STAFF reversing another person's record → `FORBIDDEN`, KEEPER → ok; second reverse → `WRONG_STATUS`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(lab): record and reverse usage`

### Task 8: Queries

**Files:**
- Create: `packages/core/src/lab-inventory/lab-queries.ts`, `lab-queries.integration.test.ts`

**Interfaces (Produces):**
- `class LabQueries(database)`:
  - `balances(storeId: string | 'ALL'): Promise<{ itemId; code; name; useUnit; receiveUnit; unitsPerReceive; quantity; value: string; nearestExpiry: string|null; belowReorder: boolean }[]>` (`'ALL'` sums every store, `belowReorder` false).
  - `lots(itemId, storeId|'ALL')`, `ledger(itemId, storeId|'ALL', from: string, to: string)` (movements with running balance, kind, ref doc no, usage type name, actor display name).
  - `lotOptions(storeId, itemId)` → `LotOption[]`; `fefoSuggestion(requisitionId, entryDate)` → per line `pickFefo` result over main store.
  - `requisitions(filter: { status?; sectionIds?: string[]; mine?: string })`, `requisition(id)`, `receipts(from, to)`, `receipt(id)`, `usages(filter: { storeIds; from; to })`, `openingLines()`.
  - Badge counts: `pendingDecisionCount()`, `pendingIssueCount()`.

- [ ] **Step 1: Write failing integration test**: after opening + receipt + issue + use, `balances(section)` and `balances('ALL')` match, value = Σ qty × unit cost (2 dp), ledger running balance ends at the balance, below-reorder flag set when quantity < reorder point, `fefoSuggestion` matches `pickFefo`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(lab): add balance, ledger and document queries`

### Task 9: API routes

**Files:**
- Create under `apps/web/src/app/api/lab/`: `lab-route.ts` (service factories, `labResult` map: NOT_FOUND 404; FORBIDDEN 403; WRONG_STATUS, OPENING_NOT_CERTIFIED, CONFLICT_OF_INTEREST, RECEIPT_LOT_IN_USE, ITEM_HAS_STOCK, DUPLICATE, PROTECTED, INSUFFICIENT_STOCK, LOT_EXPIRED 409; else 400), `settings/[kind]/route.ts` (POST) + `settings/[kind]/[id]/route.ts` (PUT) for items|sections|vendors|usage-types, `members/route.ts` (PUT), `members/[personId]/route.ts` (DELETE), `opening/import/route.ts` (POST text/csv `?kind=items|opening`), `opening/template/route.ts` (GET `?kind=`), `opening/lines/route.ts` + `[id]/route.ts`, `opening/submission/route.ts`, `opening/decision/route.ts`, `receipts/route.ts`, `receipts/[id]/void/route.ts`, `requisitions/route.ts`, `requisitions/[id]/route.ts` (PUT resubmit), `requisitions/[id]/cancel|decision|issue/route.ts`, `requisitions/[id]/fefo/route.ts` (GET), `usages/route.ts`, `usages/[id]/reversal/route.ts`, `stock/route.ts` (GET `?store=`; STAFF limited to own section stores server-side), `stock/[itemId]/ledger/route.ts`; `route.test.ts`.

- [ ] **Step 1: Write failing route tests** (mock services like `api/mci/route.test.ts`): 401 signed out on every write; 403 for a non-member; STAFF `GET stock?store=<other section>` → 403; invalid body → 400 listing field names only; `INSUFFICIENT_STOCK` → 409; template GET returns `text/csv; charset=utf-8` starting with BOM; reasons never echoed in responses of list endpoints.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @backoffice/web test -- api/lab`).
- [ ] **Step 5: Commit** `feat(web): add Lab stock API`

### Task 10: Registry, labels and styles

**Files:**
- Modify: `apps/web/src/lib/modules.ts` (entry with sections `/lab` ภาพรวม member-or-manager, `/lab/usage` ตัดใช้ STAFF/HEAD/KEEPER, `/lab/requisitions` members, `/lab/receipts` KEEPER/manager, `/lab/stock` members, `/lab/opening` KEEPER/HEAD/manager, `/lab/settings` KEEPER/manager; badges `pendingDecisionCount` for HEAD/manager, `pendingIssueCount` for KEEPER), `packages/i18n/src/th.ts` (`lab*` keys), `apps/web/src/app/styles.css` (`[data-module="lab-inventory"] { --accent: #0f766e; }`), `apps/web/src/lib/lab-labels.ts` (role, status, movement-kind Thai labels); tests `modules.test.ts`, `module-gate.test.ts`.
- [ ] **Step 1: Failing tests**: registry has `lab-inventory` href `/lab`; `moduleForPath('/lab/stock') === 'lab-inventory'`; a non-member subject sees no `/lab/receipts` section; label maps cover every enum value.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): register the Lab stock module`

### Task 11: Pages

**Files:**
- Create under `apps/web/src/app/(app)/lab/`: `layout.tsx`, `lab-page.tsx` (context: subject, member, manages, settings; non-member → "ยังไม่ได้รับสิทธิ์ใช้งานระบบนี้ ติดต่อผู้จัดการโมดูล"), `page.tsx` (ภาพรวม: not-certified banner, pending lists, big ตัดใช้ button), `usage/page.tsx` + `usage-form.tsx` (FormDialog; auto section when one; FEFO preview from `GET /api/lab/stock`-backed lot options; "เปลี่ยนล็อต" split editor) + `reverse-usage-button.tsx`, `requisitions/page.tsx` + `requisition-form.tsx` + `requisitions/[id]/page.tsx` + `decision-buttons.tsx` + `issue-form.tsx`, `receipts/page.tsx` + `receipt-form.tsx` + `receipts/[id]/page.tsx` + `void-receipt-button.tsx`, `stock/page.tsx` (store picker incl. รวมทั้ง Lab) + `stock/[itemId]/page.tsx` + `ledger-range.tsx` (date range: start change sets end = start), `opening/page.tsx` + `opening-import.tsx` + `opening-actions.tsx`, `settings/page.tsx` + forms per tab + `member-form.tsx` (person search reuses the existing person picker).
- Tests: `usage-form.test.tsx`, `issue-form.test.tsx`, `receipt-form.test.tsx`, `ledger-range.test.tsx`.

- [ ] **Step 1: Failing component tests**: usage form posts `{ storeId, itemId, quantity, usageTypeId, entryDate, note, picks: null }` and shows the FEFO lots; Esc and backdrop click do not close it; issue form flags `ต้องระบุหมายเหตุ` when a line is short and blocks over-issue; receipt form shows `20 ขวด` and `2,500.00 บาท` for 2 กล่อง × 10 at 1,250; ledger range sets end = start after picking start.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @backoffice/web test -- lab`).
- [ ] **Step 5: Commit** `feat(web): add Lab stock pages`

### Task 12: Docs and verification

**Files:** `CONTEXT.md` (new section "วัสดุคงคลัง Lab" with the spec glossary and _Avoid_ lines), `DESIGN.md` (module colour row), plan checkboxes.
- [ ] Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`; `DATABASE_URL=… DATABASE_ADMIN_URL=… pnpm test:integration`; `pnpm --filter @backoffice/web build`; `git diff --check` — all exit 0 (report skipped suites honestly).
- [ ] Screenshots 1280/390 of `/lab`, `/lab/usage` dialog, `/lab/requisitions/[id]`, `/lab/stock` into `/mnt/project-files/lab-inventory/screens/`.
- [ ] Commit `docs: record Lab stock vocabulary and design rules`
