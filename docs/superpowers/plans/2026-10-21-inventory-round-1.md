# Inventory Round 1 (ทะเบียนและรับเข้า) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** งานพัสดุเปิดระบบด้วยยอดยกมาที่รับรองแล้ว รับของเข้าตามล็อตด้วยการสแกน พิมพ์ฉลาก QR และเห็นยอดคงเหลือจริงตามล็อต

**Architecture:** ตามแบบโมดูลจองห้อง: zod contracts ใน `packages/contracts`, service ที่รับ repository interface + `actor` + `now` ใน `packages/core/src/inventory` (in-memory repo สำหรับ unit test, MariaDB repo สำหรับจริง), read-side เป็น `InventoryQueries` ที่เขียน SQL ตรง, Next.js route handlers ใต้ `/api/inventory` และหน้าใต้ `(app)/inventory` ที่ใช้ `ModuleLayout` ยอดคงเหลือเก็บที่ `inventory_lot.on_hand_quantity` และทุกการเปลี่ยนยอดเขียน `inventory_movement` ในธุรกรรมเดียวกัน

**Tech Stack:** TypeScript, zod, Next.js 16 / React 19, MariaDB 11.8 (mysql2 ผ่าน `@backoffice/db`), Drizzle schema, vitest + Testing Library, `@zxing/browser` (สแกนด้วยกล้อง), `qrcode` (ฉลาก SVG)

**Spec:** `docs/superpowers/specs/2026-10-21-inventory-design.md` (ส่วน "Module-wide model" และ "Round 1 in detail")

## Global Constraints

- Module code `inventory`, route `/inventory`, ตารางขึ้นต้น `inventory_`, migration `0008_inventory.sql`
- Roles: `inventory-officer` → `inventory.item.manage`, `inventory.stock.receive`, `inventory.stock.read`; `inventory-supervisor` → `inventory.opening.certify`, `inventory.stock.read`
- ทุกการกระทำตรวจด้วย `AuthorizationService.canActHospitalWide(subject, permission, 'inventory')`; บทบาทที่ระบุหน่วยงานไม่ให้สิทธิ์
- ยอดเป็นจำนวนเต็มหน่วยเบิก; `line_total` DECIMAL(14,2); `unit_cost` DECIMAL(14,4); คำนวณเงินด้วยจำนวนเต็มสตางค์ ไม่ใช้ float
- เลขอ้างอิง `RC-<พ.ศ.>-NNNN`, `OB-<พ.ศ.>-NNNN`, รหัสล็อต `LT-<พ.ศ.>-NNNNNN`; ปีจากวันที่ไทย
- ค่าจำกัด: บรรทัด 1–200, จำนวน 1–1,000,000, ราคา 0–10,000,000 (ทศนิยมไม่เกิน 2), อัตราแปลง 1–100,000, ฉลากต่อล็อต 1–500, เหตุผล 1–1000 ตัวอักษร
- audit metadata ใช้คีย์ `reference`, `itemId`, `vendorId`, `lineCount`, `status`, `changedFields` เท่านั้น; ไม่มีราคา เหตุผล หรือเลขที่ใบส่งของใน audit/notification/outbox/URL/log
- แจ้งเตือนผ่าน outbox `notification.in_app` ด้วย `moduleCode: 'inventory'`, `targetPath: '/inventory/opening'`, idempotencyKey `notification.in_app:inventory:<historyId>:<recipientPersonId>`
- เปลี่ยนสถานะ + ประวัติ + รายการเคลื่อนไหว + audit + outbox ในธุรกรรมเดียว
- เก็บ UTC แสดง Asia/Bangkok ปี พ.ศ.; ข้อความไทยใน `packages/i18n/src/th.ts` ใช้ prefix `inventory`
- ไม่ใช้ browser alert/confirm/prompt; สถานะมีข้อความประกอบเสมอ

## Review Focus

1. **รหัสจากเครื่องสแกนมีช่องว่างหรือตัวพิมพ์เล็ก** (เช่น `" lt-2569-000001\r"`, รหัสวัสดุ `ab-01`) ควรพบล็อต/วัสดุเดิม → test ใน Task 7 (`resolveScan` trims and upper-cases lot/item codes) และ Task 10 (scan field trims)
2. **ราคาทศนิยมแบบ float** (`0.1 + 0.2`, `33.333`) ไม่ควรทำให้ยอดเงินเพี้ยน ราคาเกิน 2 ตำแหน่งต้องถูกปฏิเสธ → test ใน Task 2
3. **วันที่รับเข้าเป็น "วันนี้" ตามเวลาไทยขณะ UTC ยังเป็นเมื่อวาน** (บันทึกตอน 00:30 น. ไทย) ต้องรับได้ และวันพรุ่งนี้ตามเวลาไทยต้องถูกปฏิเสธ → test ใน Task 5
4. **กดบันทึกใบรับเข้าซ้ำสองครั้ง** ไม่ควรได้สองใบ → ปุ่มปิดระหว่างส่งและ test ใน Task 12
5. **สแกนบาร์โค้ดของวัสดุที่ปิดใช้แล้ว** ต้องแสดงว่าวัสดุปิดใช้ ไม่เพิ่มบรรทัด → test ใน Task 12 และ `ITEM_INACTIVE` ใน Task 5

---

### Task 1: Contracts, permissions and roles

**Files:**
- Create: `packages/contracts/src/inventory.ts`, `packages/contracts/src/inventory.test.ts`
- Modify: `packages/contracts/src/access.ts` (`permissionSchema`), `packages/contracts/src/index.ts`, `packages/core/src/access/policy.ts`, `packages/core/src/access/policy.test.ts` (create if absent)

**Interfaces:**
- Produces (contracts):
  - `INVENTORY_MODULE = 'inventory'`
  - `inventoryLimits = { maxLines: 200, maxQuantity: 1_000_000, maxUnitPrice: 10_000_000, maxFactor: 100_000, maxReorderPoint: 1_000_000, maxLabelsPerLot: 500 } as const`
  - `inventoryCategoryInputSchema` `{ name: trim 1–120, isActive: boolean }`
  - `inventoryItemInputSchema` `{ code: trim → upper-case, /^[A-Z0-9-]{1,30}$/, name: trim 1–200, categoryId, issueUnit: trim 1–30, purchaseUnit: trim 1–30, purchaseUnitFactor: int 1–100000, reorderPoint: int 0–1000000, tracksExpiry: boolean, isActive: boolean }`
  - `inventoryBarcodeInputSchema` `{ barcode: trim, /^[\x21-\x7E]{1,64}$/, not starting with "LT-" (case-insensitive), unitKind: 'ISSUE' | 'PURCHASE' }`
  - `inventoryVendorInputSchema` `{ name: trim 1–200, phone: trim ≤30 default '', address: trim ≤500 default '', isActive: boolean }`
  - `receiptLineInputSchema` `{ itemId, unitKind: 'ISSUE' | 'PURCHASE', quantity: int 1–1000000, unitPrice: number 0–10000000, manufacturerLotNo?: trim ≤60, expiryDate?: YYYY-MM-DD }`
  - `postDeliveryInputSchema` `{ vendorId, documentNo?: trim ≤60, receivedOn: YYYY-MM-DD, lines: 1–200 }`
  - `saveOpeningLinesInputSchema` `{ lines: 0–200 }` (replaces all lines)
  - `decideOpeningInputSchema` `{ decision: 'CERTIFY' | 'RETURN', reason?: trim 1–1000 }`
  - `voidReceiptInputSchema` `{ receiptId, reason: trim 1–1000 }`
  - types `InventoryUnitKind`, `InventoryReceiptKind = 'OPENING' | 'DELIVERY'`, `InventoryReceiptStatus = 'DRAFT' | 'SUBMITTED' | 'CERTIFIED' | 'POSTED' | 'VOIDED'`, `InventoryMovementKind = 'OPENING' | 'RECEIPT' | 'RECEIPT_VOID'`, `InventoryReceiptHistoryAction = 'SUBMITTED' | 'RETURNED' | 'CERTIFIED' | 'POSTED' | 'VOIDED'`, `interface InventoryActor { personId: string; roles: AccessSubject['roles'] }`, and `z.input` types for every schema
- Produces (core): `roleGrantsPermission('inventory-officer', …)` / `('inventory-supervisor', …)` per Global Constraints

- [x] **Step 1: Write failing tests** in `inventory.test.ts`: `it('upper-cases and trims an item code')` → parse `{ code: ' ab-01 ', … }` gives `code: 'AB-01'`; `it('rejects a barcode that looks like a lot code')` → `{ barcode: 'lt-2569-000001' }` fails at path `['barcode']`; `it('rejects a delivery with 201 lines')`; `it('rejects quantity 0 and 1000001')`. In `policy.test.ts`: `expect(roleGrantsPermission('inventory-officer', 'inventory.stock.receive')).toBe(true)`, `expect(roleGrantsPermission('inventory-supervisor', 'inventory.stock.receive')).toBe(false)`, `expect(roleGrantsPermission('inventory-supervisor', 'inventory.opening.certify')).toBe(true)`.
- [x] **Step 2: Run** `pnpm --filter @backoffice/contracts test -- inventory && pnpm --filter @backoffice/core test -- policy` — Expected: FAIL (module not found / permission not in enum)
- [x] **Step 3: Implement** the schemas, add the four permissions to `permissionSchema`, map both roles in `policy.ts`, export from `index.ts`
- [x] **Step 4: Run** the same commands plus `pnpm typecheck` — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): add contracts, permissions and roles`

### Task 2: Quantity, money and lot-order rules

**Files:**
- Create: `packages/core/src/inventory/quantities.ts`, `packages/core/src/inventory/quantities.test.ts`

**Interfaces:**
- Consumes: `buddhistYear(date: Date): number` from `../rooms/booking-days` (Thai-calendar year of a UTC instant)
- Produces:
  - `computeLine(input: { unitKind: InventoryUnitKind; quantity: number; unitPrice: number; purchaseUnitFactor: number }): { unitFactor: number; issueQuantity: number; lineTotal: string; unitCost: string }` — throws `Error('INVALID_LINE')` when `unitPrice` has more than 2 decimals or `issueQuantity` exceeds `Number.MAX_SAFE_INTEGER`
  - `bangkokDate(instant: Date): string` (`YYYY-MM-DD` in Asia/Bangkok)
  - `formatReference(prefix: 'RC' | 'OB' | 'LT', year: number, sequence: number): string` (4 digits for RC/OB, 6 for LT)
  - `issueOrder<T extends { expiryDate: string | null; receivedAt: Date; onHandQuantity: number }>(lots: T[], today: string): T[]` — drops lots with `onHandQuantity === 0` or `expiryDate < today`; sorts by `expiryDate` ascending with `null` last, then `receivedAt` ascending

Money rule: `priceSatang = Math.round(unitPrice * 100)`; reject when `Math.abs(unitPrice * 100 - priceSatang) > 1e-6`. `unitFactor = unitKind === 'PURCHASE' ? purchaseUnitFactor : 1`; `issueQuantity = quantity * unitFactor`; `lineTotalSatang = quantity * priceSatang`; `unitCost` in 1/10000 baht = round-half-up of `lineTotalSatang * 100 / issueQuantity` using `BigInt`; format both with fixed decimals.

- [x] **Step 1: Write failing tests**: `computeLine({ unitKind: 'PURCHASE', quantity: 3, unitPrice: 250, purchaseUnitFactor: 100 })` → `{ unitFactor: 100, issueQuantity: 300, lineTotal: '750.00', unitCost: '2.5000' }`; `unitPrice: 0.1 + 0.2, quantity: 3, ISSUE` → `lineTotal: '0.90', unitCost: '0.3000'`; `unitPrice: 100, quantity: 1, PURCHASE, factor 3` → `unitCost: '33.3333'`; `unitPrice: 33.333` throws `INVALID_LINE`; `unitPrice: 0` gives `'0.00'`/`'0.0000'`; `bangkokDate(new Date('2026-10-21T17:30:00Z'))` → `'2026-10-22'`; `formatReference('LT', 2569, 12)` → `'LT-2569-000012'`, `formatReference('RC', 2569, 7)` → `'RC-2569-0007'`; `issueOrder` with lots (exp 2027-01-01 rec day 2), (exp 2026-12-01 rec day 3), (null rec day 1), (exp 2026-10-01 expired), (on hand 0), today `'2026-10-21'` → order `[2026-12-01, 2027-01-01, null]`
- [x] **Step 2: Run** `pnpm --filter @backoffice/core test -- quantities` — Expected: FAIL
- [x] **Step 3: Implement** the four functions as specified
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): add unit conversion, line cost and lot order rules`

### Task 3: Migration 0008 and Drizzle schema

**Files:**
- Create: `packages/db/migrations/0008_inventory.sql`, `packages/db/src/schema/inventory.ts`
- Modify: `packages/db/src/migrate.ts` (append `'0008_inventory.sql'`), `packages/db/src/index.ts`, `packages/db/src/schema/schema.integration.test.ts`, `infra/backup/restore-verify.sh` (`required_tables` += `inventory_item inventory_lot inventory_movement inventory_receipt`)

**Interfaces:**
- Produces: tables exactly as the spec's Data table, plus: every table `DEFAULT CHARSET=utf8mb4`, `CREATE TABLE IF NOT EXISTS`; `id CHAR(36)`; `created_at`/`updated_at DATETIME NOT NULL` on category/item/vendor/receipt; unique keys `inventory_category_name_unique`, `inventory_item_code_unique`, `inventory_item_barcode_unique (barcode)`, `inventory_vendor_name_unique`, `inventory_receipt_reference_unique`, `inventory_lot_code_unique`; indexes `inventory_lot_item (item_id, on_hand_quantity)`, `inventory_movement_item_time (item_id, occurred_at)`, `inventory_movement_lot (lot_id)`, `inventory_receipt_kind_time (kind, created_at)`; FKs to `person(id)` for person columns and between inventory tables; `inventory_movement.occurred_at` and `inventory_receipt_history.created_at` are `DATETIME(6)`; `inventory_sequence (kind VARCHAR(8), buddhist_year INT, last_value INT, PRIMARY KEY (kind, buddhist_year))`; `inventory_receipt.document_no VARCHAR(60) NULL`, `received_on DATE NOT NULL`, `posted_at DATETIME NULL`; `inventory_lot.expiry_date DATE NULL`, `received_at DATETIME NOT NULL`. CHECK `on_hand_quantity >= 0` on `inventory_lot`.
- Drizzle exports: `inventoryCategories`, `inventoryItems`, `inventoryItemBarcodes`, `inventoryVendors`, `inventoryReceipts`, `inventoryReceiptLines`, `inventoryLots`, `inventoryMovements`, `inventoryReceiptHistory`, `inventorySequences`

- [x] **Step 1: Write failing test** in `schema.integration.test.ts`: after `runMigrations`, `SHOW TABLES LIKE 'inventory_%'` returns the 10 tables, and inserting a lot with `on_hand_quantity = -1` is rejected
- [x] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/db test:integration` — Expected: FAIL (tables missing)
- [x] **Step 3: Write** the migration, Drizzle schema, register in `migrate.ts`, export, update `restore-verify.sh`
- [x] **Step 4: Run** the integration test, `bash infra/backup/restore-verify.test.sh`, `pnpm --filter @backoffice/db typecheck` — Expected: PASS
- [x] **Step 5: Commit** `feat(db): add inventory tables (migration 0008)`

### Task 4: Catalog service (categories, items, barcodes, vendors)

**Files:**
- Create: `packages/core/src/inventory/catalog-service.ts`, `packages/core/src/inventory/in-memory-inventory-catalog-repository.ts`, `packages/core/src/inventory/catalog-service.test.ts`, `packages/core/src/inventory/inventory-access.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/audit/redact.ts` (allowlist += `reference`, `itemId`, `vendorId`, `lineCount`), `packages/core/src/audit/audit-service.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas and `InventoryActor`
- Produces:
  - `requireInventoryPermission(authorizer: AuthorizationService, actor: InventoryActor, permission: Permission): void` — throws `Error('FORBIDDEN')` unless `canActHospitalWide({ authenticated: true, personId, roles, dataOwnerModules: [] }, permission, 'inventory')`
  - records `InventoryCategoryRecord { id; name; isActive }`, `InventoryItemRecord { id; code; name; categoryId; issueUnit; purchaseUnit; purchaseUnitFactor; reorderPoint; tracksExpiry; isActive }`, `InventoryBarcodeRecord { id; itemId; barcode; unitKind }`, `InventoryVendorRecord { id; name; phone; address; isActive }`
  - `interface InventoryCatalogRepository { transaction; findCategory(id); findCategoryByName(name); saveCategory(c); findItem(id); findItemByCode(code); saveItem(i); itemHasLots(itemId): Promise<boolean>; findBarcode(barcode): Promise<(InventoryBarcodeRecord & { itemCode: string }) | null>; findBarcodeById(id); insertBarcode(b); deleteBarcode(id); findVendor(id); findVendorByName(name); saveVendor(v); appendAudit(e) }` (`save*` upserts by id)
  - `class InventoryCatalogService(repository, authorizer = new AuthorizationService(), createId = randomUUID)` with `createCategory(actor, input)`, `updateCategory(actor, id, input)`, `createItem(actor, input)`, `updateItem(actor, id, input)`, `addBarcode(actor, itemId, input)`, `removeBarcode(actor, barcodeId)`, `createVendor(actor, input)`, `updateVendor(actor, id, input)`; all need `inventory.item.manage`
  - errors: `FORBIDDEN`, `CATEGORY_NOT_FOUND`, `ITEM_NOT_FOUND`, `VENDOR_NOT_FOUND`, `BARCODE_NOT_FOUND`, `DUPLICATE_NAME`, `DUPLICATE_CODE`, `DuplicateBarcodeError extends Error('DUPLICATE_BARCODE') { itemCode: string }`, `ITEM_HAS_LOTS`, `CATEGORY_INACTIVE` (new/updated item in an inactive category)
  - audit: `inventory.category.created|updated`, `inventory.item.created|updated` (barcode add/remove = `inventory.item.updated` with `changedFields: ['barcodes']`), `inventory.vendor.created|updated`; metadata `{ itemId }` / `{ vendorId }` / `{ changedFields }`

- [x] **Step 1: Write failing tests**: officer creates an item and an audit `inventory.item.created` with `metadata: { itemId }` is appended; supervisor-only actor and an officer role scoped to an organization both get `FORBIDDEN`; duplicate code (case-insensitive via schema) → `DUPLICATE_CODE`; barcode already on item `AB-01` → `DuplicateBarcodeError` with `itemCode: 'AB-01'`; toggling `tracksExpiry` when `itemHasLots` → `ITEM_HAS_LOTS`, but other edits pass; duplicate vendor name → `DUPLICATE_NAME`; redact test: `redactAuditMetadata({ reference: 'RC-2569-0001', lineCount: 2, unitPrice: 5 })` keeps the first two only
- [x] **Step 2: Run** `pnpm --filter @backoffice/core test -- catalog-service audit-service` — Expected: FAIL
- [x] **Step 3: Implement** access helper, service, in-memory repository, allowlist change, exports
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): add catalog service for items, barcodes, categories and vendors`

### Task 5: Receipt service (opening balance and deliveries)

**Files:**
- Create: `packages/core/src/inventory/inventory-repository.ts`, `packages/core/src/inventory/in-memory-inventory-repository.ts`, `packages/core/src/inventory/receipt-service.ts`, `packages/core/src/inventory/receipt-service.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 schemas/types, Task 2 `computeLine`, `bangkokDate`, `formatReference`, `buddhistYear`, Task 4 `requireInventoryPermission`
- Produces:
  - `InventoryReceiptRecord { id; reference; kind; vendorId: string | null; documentNo: string | null; receivedOn: string; status; createdByPersonId; postedAt: Date | null }`
  - `InventoryReceiptLineRecord { id; receiptId; itemId; enteredUnitKind; enteredQuantity; enteredUnitPrice: string; unitFactor; issueQuantity; unitCost: string; lineTotal: string; manufacturerLotNo: string | null; expiryDate: string | null }`
  - `InventoryLotRecord { id; lotCode; itemId; receiptLineId; manufacturerLotNo; expiryDate; unitCost: string; receivedQuantity; onHandQuantity; receivedAt: Date }`
  - `InventoryMovementRecord { id; lotId; itemId; kind: InventoryMovementKind; quantity; unitCost: string; sourceType: 'inventory_receipt'; sourceId; actorPersonId; occurredAt: Date }`
  - `interface InventoryRepository { transaction; findOpeningForUpdate(): Promise<InventoryReceiptRecord | null>; lockReceipt(id); insertReceipt(r); updateReceipt(id, patch: { status; postedAt?; receivedOn? }); replaceLines(receiptId, lines); listLines(receiptId); findItems(ids): Promise<InventoryItemRecord[]>; findVendor(id): Promise<InventoryVendorRecord | null>; nextSequence(kind: 'RC' | 'OB' | 'LT', buddhistYear): Promise<number>; insertLots(lots); lockLotsOfReceipt(receiptId); setLotOnHand(lotId, quantity); appendMovements(movements); appendHistory({ id; receiptId; action; actorPersonId; reason }); findHospitalWideRoleHolders(roleName): Promise<string[]>; saveOutbox(e); appendAudit(e) }`
  - `class InventoryReceiptService(repository, authorizer = new AuthorizationService(), createId = randomUUID, now = () => new Date())`:
    - `openOpening(actor): Promise<InventoryReceiptRecord>` — `inventory.stock.receive` or `inventory.opening.certify`; creates `OB-…` `DRAFT` once (`receivedOn` = today Bangkok)
    - `saveOpeningLines(actor, input)` — `inventory.stock.receive`, `DRAFT` else `OPENING_NOT_EDITABLE`
    - `submitOpening(actor)` — `DRAFT` with ≥1 line else `EMPTY_RECEIPT`; notifies supervisors except actor
    - `decideOpening(actor, input)` — `inventory.opening.certify`, `SUBMITTED` else `OPENING_NOT_SUBMITTED`; RETURN needs reason (`REASON_REQUIRED`) → `DRAFT`; CERTIFY → `CERTIFIED`, `postedAt = now`, `receivedOn = today`, creates lots + `OPENING` movements; notifies submitter (latest `SUBMITTED` history actor)
    - `postDelivery(actor, input)` — `inventory.stock.receive`; `OPENING_NOT_CERTIFIED`, `VENDOR_INACTIVE`/`VENDOR_NOT_FOUND`, `INVALID_RECEIVED_DATE` (after today Bangkok or before opening's `receivedOn`), per-line rules; creates `RC-…` `POSTED`, lines, lots, `RECEIPT` movements, history `POSTED`; no notification
    - `voidDelivery(actor, input)` — `inventory.stock.receive`; `RECEIPT_NOT_FOUND`; `POSTED` and every lot `onHand === received` else `RECEIPT_NOT_VOIDABLE`; `RECEIPT_VOID` movements of `-onHand`, lots → 0, `VOIDED`, history with reason
  - line rules (shared by opening and delivery): `ITEM_NOT_FOUND`, `ITEM_INACTIVE`, `EXPIRY_REQUIRED`, `EXPIRY_NOT_ALLOWED`, `EXPIRY_IN_PAST` (delivery only: expiry ≤ receivedOn), `INVALID_LINE` from `computeLine`
  - audit `inventory.opening.submitted|returned|certified`, `inventory.receipt.posted|voided`, targetType `inventory_receipt`, metadata `{ reference, status, lineCount }`

- [x] **Step 1: Write failing tests** (one `it` each): opening DRAFT→SUBMITTED→RETURNED(reason)→DRAFT→SUBMITTED→CERTIFIED creates lots `LT-2569-000001…` with `onHandQuantity` = `issueQuantity` and movements summing to it; second `openOpening` returns the same receipt; `saveOpeningLines` after submit → `OPENING_NOT_EDITABLE`; RETURN without reason → `REASON_REQUIRED`; officer without supervisor role deciding → `FORBIDDEN`; submit notifies every hospital-wide supervisor except the submitter with `{ moduleCode: 'inventory', targetPath: '/inventory/opening', subject: 'มียอดยกมารอรับรอง (OB-2569-0001)' }` and the return reason appears in no outbox payload or audit metadata; `postDelivery` before certification → `OPENING_NOT_CERTIFIED`; delivery of 2 boxes × 100 at 250 baht gives lot on hand 200, `unitCost '2.5000'`, reference `RC-2569-0001`; **Bangkok date edge** with `now = 2026-10-21T17:30:00Z`: `receivedOn '2026-10-22'` accepted and `'2026-10-23'` → `INVALID_RECEIVED_DATE`; expiry rules (`EXPIRY_REQUIRED`, `EXPIRY_NOT_ALLOWED`, `EXPIRY_IN_PAST` when expiry equals receivedOn); inactive item → `ITEM_INACTIVE`; void restores on hand to 0 with a `RECEIPT_VOID` movement and `VOIDED`; void when a lot's on hand was changed (set directly in the in-memory repo) → `RECEIPT_NOT_VOIDABLE`; void without reason fails schema
- [x] **Step 2: Run** `pnpm --filter @backoffice/core test -- receipt-service` — Expected: FAIL
- [x] **Step 3: Implement** repository interface, in-memory repository (same observable behaviour as MariaDB), service
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): add opening balance and delivery receipt service`

### Task 6: MariaDB repositories

**Files:**
- Create: `packages/core/src/inventory/database-inventory-repository.ts` (implements both `InventoryRepository` and `InventoryCatalogRepository` as `DatabaseInventoryRepository` and `DatabaseInventoryCatalogRepository`), `packages/core/src/inventory/database-inventory-repository.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 4 and 5 interfaces; `toMariaDbDatetime`, `fromMariaDbDatetime`, `fromMariaDbDate` from `../rooms/database-room-booking-repository`; `roleGrantsPermission` is not used — `findHospitalWideRoleHolders(roleName)` selects `role_assignment` rows with `organization_id IS NULL` joined to `role.name = ?`
- Produces: `new DatabaseInventoryRepository(database: Database)`, `new DatabaseInventoryCatalogRepository(database: Database)`; transactions use `{ isolationLevel: 'READ COMMITTED' }`; `findOpeningForUpdate`, `lockReceipt`, `lockLotsOfReceipt` and `nextSequence` use `FOR UPDATE`; duplicate-key errors (`ER_DUP_ENTRY`) on item code/vendor name/category name/barcode are rethrown as the Task 4 errors

- [x] **Step 1: Write failing integration tests**: run Task 5's happy path (certify opening, post delivery, void) through the real repository and assert `SELECT SUM(quantity) FROM inventory_movement WHERE lot_id = ?` equals `on_hand_quantity` for every lot after each step; 5 concurrent `postDelivery` calls produce 5 distinct `RC-…` references and distinct lot codes; 2 concurrent `voidDelivery` calls → one resolves, one rejects `RECEIPT_NOT_VOIDABLE`; concurrent `addBarcode` with the same barcode → one `DuplicateBarcodeError`
- [x] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/core test:integration -- inventory` — Expected: FAIL
- [x] **Step 3: Implement** both repositories
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): store catalog, receipts and lots in MariaDB`

### Task 7: Read-side queries

**Files:**
- Create: `packages/core/src/inventory/inventory-queries.ts`, `packages/core/src/inventory/inventory-queries.integration.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 2 `issueOrder`, `bangkokDate`; Task 6 tables
- Produces `class InventoryQueries(database: Pick<Database, 'query'>)`:
  - `listStock(filter: { search?: string; categoryId?: string }, today: string): Promise<StockRow[]>` — `StockRow { itemId; code; name; categoryName; issueUnit; onHand: number; value: string; nearestExpiry: string | null; belowReorder: boolean; isActive: boolean }`; `onHand` counts lots not expired; `belowReorder = onHand < reorderPoint`; search matches code or name (LIKE) or an exact barcode
  - `itemDetail(itemId: string, today: string): Promise<ItemDetail | null>` — item + category name, barcodes, `lots` (`issueOrder` + separately `expiredLots`), last 100 movements with receipt reference and actor display name
  - `resolveScan(code: string): Promise<ScanResult | null>` — `ScanResult = { kind: 'lot'; item: ScanItem; lot: { id; lotCode; expiryDate; onHandQuantity } } | { kind: 'barcode'; item: ScanItem; unitKind: InventoryUnitKind } | { kind: 'item'; item: ScanItem }`, `ScanItem { id; code; name; issueUnit; purchaseUnit; purchaseUnitFactor; tracksExpiry; isActive }`; input is trimmed; lot and item codes compared upper-cased; barcode compared exactly after trim; order lot → barcode → item
  - `listReceipts(limit = 100): Promise<ReceiptSummary[]>` (kind `DELIVERY` only; reference, vendor name, receivedOn, status, lineCount, total)
  - `receiptDetail(receiptId): Promise<ReceiptDetail | null>` (lines with item code/name/units, lots with codes, history with actor names and reasons)
  - `opening(): Promise<ReceiptDetail | null>`
  - `listCategories()`, `listItems()` (with barcodes), `listVendors()`
  - `labelLots(receiptId): Promise<LabelLot[]>` — `LabelLot { lotCode; itemCode; itemName; expiryDate; receivedOn }` (no price, no vendor)

- [x] **Step 1: Write failing integration tests**: `resolveScan(' lt-2569-000001\r')` → `kind: 'lot'`; a box barcode → `kind: 'barcode', unitKind: 'PURCHASE'`; `'ab-01'` → `kind: 'item'`; unknown → `null`; `listStock` excludes an expired lot from `onHand` and flags `belowReorder`; `itemDetail` lists lots in issue order; `labelLots` result objects have exactly the five keys
- [x] **Step 2: Run** `DATABASE_URL=… pnpm --filter @backoffice/core test:integration -- inventory-queries` — Expected: FAIL
- [x] **Step 3: Implement** the queries
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(inventory): add stock, item, receipt and scan queries`

### Task 8: API routes

**Files:**
- Create under `apps/web/src/app/api/inventory/`: `inventory-error-response.ts` (+ `.test.ts`), `scan/route.ts`, `categories/route.ts`, `categories/[categoryId]/route.ts`, `items/route.ts`, `items/[itemId]/route.ts`, `items/[itemId]/barcodes/route.ts`, `items/[itemId]/barcodes/[barcodeId]/route.ts`, `vendors/route.ts`, `vendors/[vendorId]/route.ts`, `receipts/route.ts` (+ `.test.ts`), `receipts/[receiptId]/void/route.ts` (+ `.test.ts`), `opening/route.ts` (GET opens/returns), `opening/lines/route.ts` (PUT), `opening/submission/route.ts` (POST), `opening/decision/route.ts` (POST, + `.test.ts`), `scan/route.test.ts`
- Reuse: `requireActor` (`apps/web/src/lib/actor.ts`), database via `roomDatabase()` pattern → create `inventory-database.ts`

**Interfaces:**
- Consumes: Task 4/5 services, Task 6 repositories, Task 7 queries
- Produces: `inventoryErrorResponse(error: unknown): Response` — 400: `INVALID_INPUT` (zod/SyntaxError), `INVALID_LINE`, `EXPIRY_REQUIRED`, `EXPIRY_NOT_ALLOWED`, `EXPIRY_IN_PAST`, `INVALID_RECEIVED_DATE`, `REASON_REQUIRED`, `EMPTY_RECEIPT`; 403 `FORBIDDEN`; 404 `*_NOT_FOUND`, `CODE_NOT_FOUND`; 409 `DUPLICATE_*` (barcode adds `itemCode`), `ITEM_HAS_LOTS`, `ITEM_INACTIVE`, `VENDOR_INACTIVE`, `CATEGORY_INACTIVE`, `OPENING_NOT_EDITABLE`, `OPENING_NOT_SUBMITTED`, `OPENING_NOT_CERTIFIED`, `RECEIPT_NOT_VOIDABLE`; 503 `SERVICE_UNAVAILABLE`; anything else logs `backoffice.inventory_failed` with the error class only and returns 500
- `GET /api/inventory/scan?code=` checks `inventory.stock.read` or `inventory.stock.receive` (403 otherwise), returns `ScanResult` or 404 `CODE_NOT_FOUND`
- `POST /api/inventory/receipts` returns 201 `{ id, reference }`

- [x] **Step 1: Write failing route tests** (mock `requireActor` and services as `apps/web/src/app/api/rooms/bookings/route.test.ts` does): 401 before touching the service; receipts POST passes the signed-in actor and body, returns 201 `{ id, reference }`; scan 403 for an actor with no inventory role, 404 `CODE_NOT_FOUND`; decision route maps `OPENING_NOT_SUBMITTED` to 409; error response maps `DuplicateBarcodeError` to 409 with `itemCode` and never echoes an unknown error message
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- api/inventory` — Expected: FAIL
- [x] **Step 3: Implement** the routes
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(web): add inventory API routes`

### Task 9: Module registry, layout, i18n and audit labels

**Files:**
- Modify: `apps/web/src/lib/modules.ts` (replace the `planned('inventory', …)` entry), `apps/web/src/lib/modules.test.ts` (or existing registry test), `packages/i18n/src/th.ts`, `apps/web/src/app/(app)/access/audit/page.tsx`, `apps/web/src/app/(app)/access/audit/audit-event-table.tsx` (+ tests)
- Create: `apps/web/src/app/(app)/inventory/layout.tsx`, `apps/web/src/app/(app)/inventory/page.tsx`, `apps/web/src/app/(app)/inventory/inventory-access.ts`

**Interfaces:**
- Produces:
  - registry: `withSections({ code: 'inventory', href: '/inventory', labelKey: 'moduleInventory', descriptionKey: 'moduleInventoryDescription', icon: 'package', group: 'services', status: 'live' }, [stock, receipts, opening, items, vendors])` with visibility per the spec's Screens table, using `canInventory(subject, permission)` from `inventory-access.ts` (wraps `canActHospitalWide(…, 'inventory')`)
  - i18n keys (prefix `inventory`): section labels `inventoryStock: 'ยอดคงเหลือ'`, `inventoryReceipts: 'รับเข้า'`, `inventoryOpening: 'ยอดยกมา'`, `inventoryItems: 'ทะเบียนวัสดุ'`, `inventoryVendors: 'ผู้ขาย'`; `moduleInventory: 'คลังพัสดุ'`, `moduleInventoryDescription: 'ทะเบียนวัสดุ รับเข้า และยอดคงเหลือ'`; status labels for `DRAFT`/`SUBMITTED`/`CERTIFIED`/`POSTED`/`VOIDED` (`ร่าง`, `รอรับรอง`, `รับรองแล้ว`, `บันทึกแล้ว`, `ยกเลิกแล้ว`); `inventoryBelowReorder: 'ต่ำกว่าจุดสั่งซื้อ'`; one `inventoryError<CODE>` per error code in Task 8
  - audit page: accepts the 11 inventory actions with result `SUCCESS`, shows `metadata.reference` in the reference column (falls back to `requestReference`); Thai labels e.g. `inventory.receipt.posted: 'บันทึกใบรับเข้า'`, `inventory.opening.certified: 'รับรองยอดยกมา'`

- [x] **Step 1: Write failing tests**: registry — an `inventory-officer` sees sections stock, receipts, opening, items, vendors; an `inventory-supervisor` sees stock and opening only; a person with no inventory role does not see the tile; an officer role scoped to an organization does not see it; audit table renders `บันทึกใบรับเข้า` and `RC-2569-0001` for an `inventory.receipt.posted` row
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- modules audit` — Expected: FAIL
- [x] **Step 3: Implement** registry entry, layout (`<ModuleLayout code="inventory">`), index (`<ModuleIndex code="inventory" />`), i18n, audit labels
- [x] **Step 4: Run** same plus `pnpm typecheck` — Expected: PASS
- [x] **Step 5: Commit** `feat(web): open the inventory module with its section bar`

### Task 10: Scan field (scanner + camera)

**Files:**
- Create: `apps/web/src/app/(app)/inventory/scan-field.tsx`, `apps/web/src/app/(app)/inventory/scan-field.test.tsx`, `apps/web/src/app/(app)/inventory/camera-scanner.tsx`
- Modify: `apps/web/package.json` (add `@zxing/browser` and `@zxing/library`, exact versions pinned by `pnpm add`)

**Interfaces:**
- Produces: `<ScanField onResult={(result: ScanResult) => void} onNotFound?={(code: string) => void} label?: string />` — client component; text input with `autoFocus`, `enterKeyHint="done"`; on Enter trims the value, ignores empty, calls `GET /api/inventory/scan?code=<encoded>`, clears and refocuses the input; shows Thai errors for 404 (`inventoryErrorCODE_NOT_FOUND`) and 403; button "สแกนด้วยกล้อง" lazy-loads `camera-scanner.tsx` (dynamic import, `ssr: false`), which uses `BrowserMultiFormatReader.decodeFromVideoDevice` with the back camera (`facingMode: 'environment'`), formats EAN_13, EAN_8, UPC_A, CODE_128, CODE_39, QR_CODE, stops the stream after the first read or on close, and shows `inventoryCameraUnavailable` when `getUserMedia` is missing or denied

- [x] **Step 1: Write failing tests** (mock `fetch`): typing `"  8851234567890 "` then Enter calls fetch with `code=8851234567890` and `onResult` with the JSON; the input is empty afterwards; Enter on whitespace makes no request; 404 shows `ไม่พบรหัสนี้ในระบบ` and calls `onNotFound('X1')`; clicking the camera button when `navigator.mediaDevices` is undefined shows the camera-unavailable message
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- scan-field` — Expected: FAIL
- [x] **Step 3: Implement** both components and add the dependencies
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(web): add inventory scan field with scanner and camera input`

### Task 11: Catalog pages (items, categories, vendors) and stock pages

**Files:**
- Create: `apps/web/src/app/(app)/inventory/items/page.tsx`, `items/item-forms.tsx` (+ `.test.tsx`), `vendors/page.tsx`, `vendors/vendor-forms.tsx` (+ `.test.tsx`), `stock/page.tsx`, `stock/stock-table.tsx` (+ `.test.tsx`), `stock/[itemId]/page.tsx`, `inventory-format.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 7 queries, Task 8 routes, Task 9 `canInventory`, Task 10 `ScanField`
- Produces: `inventory-format.ts` — `formatQuantity(n: number, unit: string): string` (`th-TH` grouping, e.g. `'1,200 ชิ้น'`), `formatBaht(decimal: string): string` (`'1,234.50'`), `formatThaiDate(isoDate: string): string` (พ.ศ., e.g. `'22 ต.ค. 2569'`)
- Pages call `notFound()` when the actor lacks the section permission; items page lists items with category, units, factor, reorder point, barcodes; item form validates nothing the server does not and shows server error text; adding a barcode can use `ScanField` (`onNotFound` fills the barcode input); stock page has search, category filter, `ScanField` that navigates to `/inventory/stock/<itemId>`, badge text `ต่ำกว่าจุดสั่งซื้อ`

- [x] **Step 1: Write failing tests**: `formatQuantity(1200, 'ชิ้น')` → `'1,200 ชิ้น'`; `formatBaht('1234.5')` → `'1,234.50'`; `formatThaiDate('2026-10-22')` → `'22 ต.ค. 2569'`; stock table shows the below-reorder label as text and a value column; item form posts `purchaseUnitFactor` as a number and shows `รหัสวัสดุนี้มีอยู่แล้ว` on 409 `DUPLICATE_CODE`; barcode duplicate shows the owning item code
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- inventory/items inventory/vendors inventory/stock inventory-format` — Expected: FAIL
- [x] **Step 3: Implement** the pages and forms
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(web): add inventory catalog and stock pages`

### Task 12: Receipt and opening pages

**Files:**
- Create: `apps/web/src/app/(app)/inventory/receipt-lines-editor.tsx` (+ `.test.tsx`), `receipts/page.tsx`, `receipts/new/page.tsx`, `receipts/new/delivery-form.tsx` (+ `.test.tsx`), `receipts/[receiptId]/page.tsx`, `receipts/[receiptId]/void-form.tsx`, `opening/page.tsx`, `opening/opening-actions.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: Task 7–11
- Produces: `<ReceiptLinesEditor lines onChange items requireFutureExpiry? />` — shared by delivery and opening; adds a line when `ScanField` returns an item not yet in the list (unit from barcode `unitKind`, `ISSUE` for item/lot code), adds 1 to the last line of that item on a repeated scan, refuses a scan of an inactive item with `inventoryErrorITEM_INACTIVE` text, shows a lot-code scan as `ของชิ้นนี้รับเข้าแล้ว (LT-…)`; shows computed line total per line (display only); expiry input only for `tracksExpiry` items
- Delivery form keeps an unsent draft in `sessionStorage` (wrapped in try/catch), disables the submit button while the request is in flight, and on 201 navigates to `/inventory/receipts/<id>` with a link to print labels
- Opening page: officer edits lines when `DRAFT` (save + "ส่งรับรอง"), supervisor sees "รับรองยอดยกมา" / "ส่งกลับแก้ไข" with a required reason field and "ยืนยัน" (no browser dialogs), history list shows reasons; after `CERTIFIED` read-only with a labels link

- [x] **Step 1: Write failing tests**: scanning the same barcode twice yields one line with quantity 2; a PURCHASE barcode line shows `กล่อง`; scanning an inactive item adds no line and shows `วัสดุนี้ปิดใช้แล้ว`; double-clicking "บันทึกรับเข้า" sends one request; opening actions show certify/return only for the supervisor and return requires a reason before "ยืนยัน" is enabled
- [x] **Step 2: Run** `pnpm --filter @backoffice/web test -- inventory/receipts inventory/opening receipt-lines-editor` — Expected: FAIL
- [x] **Step 3: Implement** the components and pages
- [x] **Step 4: Run** same — Expected: PASS
- [x] **Step 5: Commit** `feat(web): add delivery receipt and opening balance pages`

### Task 13: QR label printing

**Files:**
- Create: `apps/web/src/app/(app)/inventory/receipts/[receiptId]/labels/page.tsx`, `apps/web/src/app/(app)/inventory/opening/labels/page.tsx`, `apps/web/src/app/(app)/inventory/label-sheet.tsx` (+ `.test.tsx`), `apps/web/src/app/(app)/inventory/label-sheet.css`
- Modify: `apps/web/package.json` (add `qrcode` and `@types/qrcode`)

**Interfaces:**
- Consumes: Task 7 `labelLots`
- Produces: pages render `QRCode.toString(lotCode, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })` per lot on the server and pass `{ lot: LabelLot; svg: string }[]` to `<LabelSheet>`; `LabelSheet` lets the user pick layout `a4-3x8` (default) or `thermal-50x30`, copies per lot (1–500, default 1), and a "พิมพ์ฉลาก" button calling `window.print()`; CSS `@media print` hides the app shell; A4 grid 3 × 8 cells of 70 × 37 mm, thermal `@page { size: 50mm 30mm }` one per page

- [ ] **Step 1: Write failing tests**: rendering two lots with copies 3 and 1 yields 4 labels; each label shows lot code, item code and name, Thai expiry date; the rendered HTML contains no `฿`, `ราคา` or vendor name; switching layout sets `data-layout="thermal-50x30"`; copies above 500 are clamped to 500
- [ ] **Step 2: Run** `pnpm --filter @backoffice/web test -- label-sheet` — Expected: FAIL
- [ ] **Step 3: Implement** pages, sheet and CSS; add the dependencies
- [ ] **Step 4: Run** same — Expected: PASS
- [ ] **Step 5: Commit** `feat(web): print QR labels for received lots`

### Task 14: Docs, runbook and full verification

**Files:**
- Create: `docs/runbooks/inventory-roles.md` (how to assign `inventory-officer` / `inventory-supervisor` hospital-wide, same mechanism as `room-booking-roles.md`, and the first-day order: items → vendors → opening → certify → receive)
- Modify: `docs/integration/modules.md` (0008 row status), `README` module list if one exists

- [ ] **Step 1: Run** `pnpm lint && pnpm typecheck && pnpm test` — Expected: all pass
- [ ] **Step 2: Run** `DATABASE_URL=mysql://backoffice:<password>@127.0.0.1:3306/backoffice pnpm test:integration` — Expected: all pass (report as skipped if no MariaDB is available)
- [ ] **Step 3: Run** `bash infra/backup/restore-verify.test.sh && git diff --check` — Expected: pass, no output from diff check
- [ ] **Step 4: Run the app** with demo data and capture desktop and mobile screenshots of stock, receipt form, opening and labels into `/mnt/project-files/screenshots/<date>/inventory-*.png`
- [ ] **Step 5: Commit** `docs: add inventory role runbook`
