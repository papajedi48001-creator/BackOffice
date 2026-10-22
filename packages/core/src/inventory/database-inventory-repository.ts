import type { AuditEvent, InventoryReceiptHistoryAction, OutboxEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { fromMariaDbDate, fromMariaDbDatetime, toMariaDbDatetime } from '../rooms/database-room-booking-repository';
import { DuplicateBarcodeError, type InventoryBarcodeRecord, type InventoryCatalogRepository, type InventoryCategoryRecord, type InventoryItemRecord, type InventoryVendorRecord } from './catalog-service';
import type { InventoryLotRecord, InventoryMovementRecord, InventoryReceiptHistoryEntry, InventoryReceiptLineRecord, InventoryReceiptRecord, InventoryRepository } from './inventory-repository';

const itemColumns = 'id, code, name, category_id AS categoryId, issue_unit AS issueUnit, purchase_unit AS purchaseUnit, purchase_unit_factor AS purchaseUnitFactor, reorder_point AS reorderPoint, tracks_expiry AS tracksExpiry, is_active AS isActive';
const vendorColumns = 'id, name, phone, address, is_active AS isActive';
const receiptColumns = 'id, reference, kind, vendor_id AS vendorId, document_no AS documentNo, received_on AS receivedOn, status, created_by_person_id AS createdByPersonId, posted_at AS postedAt';
const lineColumns = 'id, receipt_id AS receiptId, line_no AS lineNo, item_id AS itemId, entered_unit_kind AS enteredUnitKind, entered_quantity AS enteredQuantity, entered_unit_price AS enteredUnitPrice, unit_factor AS unitFactor, issue_quantity AS issueQuantity, unit_cost AS unitCost, line_total AS lineTotal, manufacturer_lot_no AS manufacturerLotNo, expiry_date AS expiryDate';
const lotColumns = 'l.id, l.lot_code AS lotCode, l.item_id AS itemId, l.receipt_line_id AS receiptLineId, l.manufacturer_lot_no AS manufacturerLotNo, l.expiry_date AS expiryDate, l.unit_cost AS unitCost, l.received_quantity AS receivedQuantity, l.on_hand_quantity AS onHandQuantity, l.received_at AS receivedAt';

type Row = Record<string, unknown>;

export function toItem(row: Row): InventoryItemRecord {
  return { id: String(row.id), code: String(row.code), name: String(row.name), categoryId: String(row.categoryId), issueUnit: String(row.issueUnit), purchaseUnit: String(row.purchaseUnit), purchaseUnitFactor: Number(row.purchaseUnitFactor), reorderPoint: Number(row.reorderPoint), tracksExpiry: Boolean(row.tracksExpiry), isActive: Boolean(row.isActive) };
}
const toVendor = (row: Row): InventoryVendorRecord => ({ id: String(row.id), name: String(row.name), phone: String(row.phone), address: String(row.address), isActive: Boolean(row.isActive) });
const optionalDate = (value: unknown) => (value === null || value === undefined ? null : fromMariaDbDate(value as Date | string));
const toReceipt = (row: Row): InventoryReceiptRecord => ({
  id: String(row.id), reference: String(row.reference), kind: row.kind as InventoryReceiptRecord['kind'], vendorId: (row.vendorId as string | null) ?? null, documentNo: (row.documentNo as string | null) ?? null,
  receivedOn: fromMariaDbDate(row.receivedOn as Date | string), status: row.status as InventoryReceiptRecord['status'], createdByPersonId: String(row.createdByPersonId), postedAt: row.postedAt ? fromMariaDbDatetime(row.postedAt as Date | string) : null
});
const toLine = (row: Row): InventoryReceiptLineRecord => ({
  id: String(row.id), receiptId: String(row.receiptId), lineNo: Number(row.lineNo), itemId: String(row.itemId), enteredUnitKind: row.enteredUnitKind as InventoryReceiptLineRecord['enteredUnitKind'], enteredQuantity: Number(row.enteredQuantity),
  enteredUnitPrice: String(row.enteredUnitPrice), unitFactor: Number(row.unitFactor), issueQuantity: Number(row.issueQuantity), unitCost: String(row.unitCost), lineTotal: String(row.lineTotal),
  manufacturerLotNo: (row.manufacturerLotNo as string | null) ?? null, expiryDate: optionalDate(row.expiryDate)
});
export const toLot = (row: Row): InventoryLotRecord => ({
  id: String(row.id), lotCode: String(row.lotCode), itemId: String(row.itemId), receiptLineId: String(row.receiptLineId), manufacturerLotNo: (row.manufacturerLotNo as string | null) ?? null, expiryDate: optionalDate(row.expiryDate),
  unitCost: String(row.unitCost), receivedQuantity: Number(row.receivedQuantity), onHandQuantity: Number(row.onHandQuantity), receivedAt: fromMariaDbDatetime(row.receivedAt as Date | string)
});

async function appendAudit(database: Database, event: AuditEvent): Promise<void> {
  await database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]);
}

export class DatabaseInventoryRepository implements InventoryRepository {
  constructor(private readonly database: Database) {}

  transaction<T>(work: (repository: InventoryRepository) => Promise<T>): Promise<T> {
    // Lots and sequence rows are locked after other receipts commit; READ COMMITTED lets this transaction see them.
    return this.database.transaction((database) => work(new DatabaseInventoryRepository(database)), { isolationLevel: 'READ COMMITTED' });
  }

  async findOpeningForUpdate(): Promise<InventoryReceiptRecord | null> {
    // The OPENING sequence row is a mutex: without it two first visits could both find nothing and create two drafts.
    // INSERT IGNORE would take a shared lock on an existing row and deadlock two callers upgrading it; ON DUPLICATE KEY UPDATE takes the exclusive lock at once.
    await this.database.execute("INSERT INTO inventory_sequence (kind, buddhist_year, last_value) VALUES ('OPENING', 0, 0) ON DUPLICATE KEY UPDATE last_value = last_value");
    const row = (await this.database.query<Row>(`SELECT ${receiptColumns} FROM inventory_receipt WHERE kind = 'OPENING' FOR UPDATE`))[0];
    return row ? toReceipt(row) : null;
  }

  async lockReceipt(receiptId: string): Promise<InventoryReceiptRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${receiptColumns} FROM inventory_receipt WHERE id = ? FOR UPDATE`, [receiptId]))[0];
    return row ? toReceipt(row) : null;
  }

  async insertReceipt(receipt: InventoryReceiptRecord): Promise<void> {
    await this.database.execute(
      'INSERT INTO inventory_receipt (id, reference, kind, vendor_id, document_no, received_on, status, created_by_person_id, posted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
      [receipt.id, receipt.reference, receipt.kind, receipt.vendorId, receipt.documentNo, receipt.receivedOn, receipt.status, receipt.createdByPersonId, receipt.postedAt ? toMariaDbDatetime(receipt.postedAt) : null]
    );
  }

  async updateReceipt(receiptId: string, patch: { status: InventoryReceiptRecord['status']; postedAt?: Date; receivedOn?: string }): Promise<void> {
    await this.database.execute(
      'UPDATE inventory_receipt SET status = ?, posted_at = COALESCE(?, posted_at), received_on = COALESCE(?, received_on), updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [patch.status, patch.postedAt ? toMariaDbDatetime(patch.postedAt) : null, patch.receivedOn ?? null, receiptId]
    );
  }

  async replaceLines(receiptId: string, lines: InventoryReceiptLineRecord[]): Promise<void> {
    await this.database.execute('DELETE FROM inventory_receipt_line WHERE receipt_id = ?', [receiptId]);
    for (const line of lines) {
      await this.database.execute(
        'INSERT INTO inventory_receipt_line (id, receipt_id, line_no, item_id, entered_unit_kind, entered_quantity, entered_unit_price, unit_factor, issue_quantity, unit_cost, line_total, manufacturer_lot_no, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [line.id, receiptId, line.lineNo, line.itemId, line.enteredUnitKind, line.enteredQuantity, line.enteredUnitPrice, line.unitFactor, line.issueQuantity, line.unitCost, line.lineTotal, line.manufacturerLotNo, line.expiryDate]
      );
    }
  }

  async listLines(receiptId: string): Promise<InventoryReceiptLineRecord[]> {
    return (await this.database.query<Row>(`SELECT ${lineColumns} FROM inventory_receipt_line WHERE receipt_id = ? ORDER BY line_no`, [receiptId])).map(toLine);
  }

  async findItems(itemIds: string[]): Promise<InventoryItemRecord[]> {
    if (itemIds.length === 0) return [];
    return (await this.database.query<Row>(`SELECT ${itemColumns} FROM inventory_item WHERE id IN (${itemIds.map(() => '?').join(', ')})`, itemIds)).map(toItem);
  }

  async findVendor(vendorId: string): Promise<InventoryVendorRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${vendorColumns} FROM inventory_vendor WHERE id = ?`, [vendorId]))[0];
    return row ? toVendor(row) : null;
  }

  async nextSequence(kind: 'RC' | 'OB' | 'LT', buddhistYear: number): Promise<number> {
    await this.database.execute('INSERT INTO inventory_sequence (kind, buddhist_year, last_value) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE last_value = last_value', [kind, buddhistYear]);
    const row = (await this.database.query<{ lastValue: number }>('SELECT last_value AS lastValue FROM inventory_sequence WHERE kind = ? AND buddhist_year = ? FOR UPDATE', [kind, buddhistYear]))[0]!;
    const next = Number(row.lastValue) + 1;
    await this.database.execute('UPDATE inventory_sequence SET last_value = ? WHERE kind = ? AND buddhist_year = ?', [next, kind, buddhistYear]);
    return next;
  }

  async insertLots(lots: InventoryLotRecord[]): Promise<void> {
    for (const lot of lots) {
      await this.database.execute(
        'INSERT INTO inventory_lot (id, lot_code, item_id, receipt_line_id, manufacturer_lot_no, expiry_date, unit_cost, received_quantity, on_hand_quantity, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [lot.id, lot.lotCode, lot.itemId, lot.receiptLineId, lot.manufacturerLotNo, lot.expiryDate, lot.unitCost, lot.receivedQuantity, lot.onHandQuantity, toMariaDbDatetime(lot.receivedAt)]
      );
    }
  }

  async lockLotsOfReceipt(receiptId: string): Promise<InventoryLotRecord[]> {
    return (await this.database.query<Row>(`SELECT ${lotColumns} FROM inventory_lot l JOIN inventory_receipt_line rl ON rl.id = l.receipt_line_id WHERE rl.receipt_id = ? ORDER BY rl.line_no FOR UPDATE`, [receiptId])).map(toLot);
  }

  async setLotOnHand(lotId: string, quantity: number): Promise<void> {
    await this.database.execute('UPDATE inventory_lot SET on_hand_quantity = ? WHERE id = ?', [quantity, lotId]);
  }

  async appendMovements(movements: InventoryMovementRecord[]): Promise<void> {
    for (const movement of movements) {
      await this.database.execute(
        'INSERT INTO inventory_movement (id, lot_id, item_id, kind, quantity, unit_cost, source_type, source_id, actor_person_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [movement.id, movement.lotId, movement.itemId, movement.kind, movement.quantity, movement.unitCost, movement.sourceType, movement.sourceId, movement.actorPersonId, movement.occurredAt.toISOString().slice(0, 23).replace('T', ' ')]
      );
    }
  }

  async appendHistory(entry: InventoryReceiptHistoryEntry): Promise<void> {
    await this.database.execute('INSERT INTO inventory_receipt_history (id, receipt_id, action, actor_person_id, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))', [entry.id, entry.receiptId, entry.action, entry.actorPersonId, entry.reason]);
  }

  async findLastHistoryActor(receiptId: string, action: InventoryReceiptHistoryAction): Promise<string | null> {
    const row = (await this.database.query<{ actorPersonId: string }>('SELECT actor_person_id AS actorPersonId FROM inventory_receipt_history WHERE receipt_id = ? AND action = ? ORDER BY created_at DESC, id DESC LIMIT 1', [receiptId, action]))[0];
    return row?.actorPersonId ?? null;
  }

  async findHospitalWideRoleHolders(roleName: string): Promise<string[]> {
    const rows = await this.database.query<{ personId: string }>('SELECT DISTINCT a.person_id AS personId FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE r.name = ? AND a.organization_id IS NULL ORDER BY a.person_id', [roleName]);
    return rows.map((row) => row.personId);
  }

  async saveOutbox(event: OutboxEvent): Promise<void> {
    await this.database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, ?, NULL)', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload), toMariaDbDatetime(new Date(event.occurredAt))]);
  }

  async appendAudit(event: AuditEvent): Promise<void> { await appendAudit(this.database, event); }
}

/** MariaDB's unique keys are the last word on duplicates when two people save at the same moment. */
function isDuplicate(error: unknown, key: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ER_DUP_ENTRY' && String((error as { message?: string }).message).includes(key);
}

export class DatabaseInventoryCatalogRepository implements InventoryCatalogRepository {
  constructor(private readonly database: Database) {}

  transaction<T>(work: (repository: InventoryCatalogRepository) => Promise<T>): Promise<T> {
    return this.database.transaction((database) => work(new DatabaseInventoryCatalogRepository(database)), { isolationLevel: 'READ COMMITTED' });
  }

  async findCategory(id: string): Promise<InventoryCategoryRecord | null> {
    const row = (await this.database.query<Row>('SELECT id, name, is_active AS isActive FROM inventory_category WHERE id = ?', [id]))[0];
    return row ? { id: String(row.id), name: String(row.name), isActive: Boolean(row.isActive) } : null;
  }

  async findCategoryByName(name: string): Promise<InventoryCategoryRecord | null> {
    const row = (await this.database.query<Row>('SELECT id FROM inventory_category WHERE name = ?', [name]))[0];
    return row ? this.findCategory(String(row.id)) : null;
  }

  async saveCategory(category: InventoryCategoryRecord): Promise<void> {
    try {
      await this.database.execute('INSERT INTO inventory_category (id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active), updated_at = UTC_TIMESTAMP()', [category.id, category.name, category.isActive ? 1 : 0]);
    } catch (error) {
      if (isDuplicate(error, 'inventory_category_name_unique')) throw new Error('DUPLICATE_NAME');
      throw error;
    }
  }

  async findItem(id: string): Promise<InventoryItemRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${itemColumns} FROM inventory_item WHERE id = ? FOR UPDATE`, [id]))[0];
    return row ? toItem(row) : null;
  }

  async findItemByCode(code: string): Promise<InventoryItemRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${itemColumns} FROM inventory_item WHERE code = ?`, [code]))[0];
    return row ? toItem(row) : null;
  }

  async saveItem(item: InventoryItemRecord): Promise<void> {
    try {
      await this.database.execute(
        `INSERT INTO inventory_item (id, code, name, category_id, issue_unit, purchase_unit, purchase_unit_factor, reorder_point, tracks_expiry, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), category_id = VALUES(category_id), issue_unit = VALUES(issue_unit), purchase_unit = VALUES(purchase_unit), purchase_unit_factor = VALUES(purchase_unit_factor), reorder_point = VALUES(reorder_point), tracks_expiry = VALUES(tracks_expiry), is_active = VALUES(is_active), updated_at = UTC_TIMESTAMP()`,
        [item.id, item.code, item.name, item.categoryId, item.issueUnit, item.purchaseUnit, item.purchaseUnitFactor, item.reorderPoint, item.tracksExpiry ? 1 : 0, item.isActive ? 1 : 0]
      );
    } catch (error) {
      if (isDuplicate(error, 'inventory_item_code_unique')) throw new Error('DUPLICATE_CODE');
      throw error;
    }
  }

  async itemHasLots(itemId: string): Promise<boolean> {
    return (await this.database.query<Row>('SELECT 1 AS found FROM inventory_lot WHERE item_id = ? LIMIT 1', [itemId])).length > 0;
  }

  async findBarcode(barcode: string): Promise<(InventoryBarcodeRecord & { itemCode: string }) | null> {
    const row = (await this.database.query<Row>('SELECT b.id, b.item_id AS itemId, b.barcode, b.unit_kind AS unitKind, i.code AS itemCode FROM inventory_item_barcode b JOIN inventory_item i ON i.id = b.item_id WHERE b.barcode = ?', [barcode]))[0];
    return row ? { id: String(row.id), itemId: String(row.itemId), barcode: String(row.barcode), unitKind: row.unitKind as InventoryBarcodeRecord['unitKind'], itemCode: String(row.itemCode) } : null;
  }

  async findBarcodeById(id: string): Promise<InventoryBarcodeRecord | null> {
    const row = (await this.database.query<Row>('SELECT id, item_id AS itemId, barcode, unit_kind AS unitKind FROM inventory_item_barcode WHERE id = ?', [id]))[0];
    return row ? { id: String(row.id), itemId: String(row.itemId), barcode: String(row.barcode), unitKind: row.unitKind as InventoryBarcodeRecord['unitKind'] } : null;
  }

  async insertBarcode(barcode: InventoryBarcodeRecord): Promise<void> {
    try {
      await this.database.execute('INSERT INTO inventory_item_barcode (id, item_id, barcode, unit_kind, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [barcode.id, barcode.itemId, barcode.barcode, barcode.unitKind]);
    } catch (error) {
      if (!isDuplicate(error, 'inventory_item_barcode_unique')) throw error;
      const existing = await this.findBarcode(barcode.barcode);
      throw new DuplicateBarcodeError(existing?.itemCode ?? '');
    }
  }

  async deleteBarcode(id: string): Promise<void> {
    await this.database.execute('DELETE FROM inventory_item_barcode WHERE id = ?', [id]);
  }

  async findVendor(id: string): Promise<InventoryVendorRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${vendorColumns} FROM inventory_vendor WHERE id = ?`, [id]))[0];
    return row ? toVendor(row) : null;
  }

  async findVendorByName(name: string): Promise<InventoryVendorRecord | null> {
    const row = (await this.database.query<Row>(`SELECT ${vendorColumns} FROM inventory_vendor WHERE name = ?`, [name]))[0];
    return row ? toVendor(row) : null;
  }

  async saveVendor(vendor: InventoryVendorRecord): Promise<void> {
    try {
      await this.database.execute('INSERT INTO inventory_vendor (id, name, phone, address, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), address = VALUES(address), is_active = VALUES(is_active), updated_at = UTC_TIMESTAMP()', [vendor.id, vendor.name, vendor.phone, vendor.address, vendor.isActive ? 1 : 0]);
    } catch (error) {
      if (isDuplicate(error, 'inventory_vendor_name_unique')) throw new Error('DUPLICATE_NAME');
      throw error;
    }
  }

  async appendAudit(event: AuditEvent): Promise<void> { await appendAudit(this.database, event); }
}
