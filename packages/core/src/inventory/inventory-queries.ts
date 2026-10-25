import type { InventoryMovementKind, InventoryReceiptHistoryAction, InventoryReceiptStatus, InventoryUnitKind } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { fromMariaDbDate, fromMariaDbDatetime } from '../rooms/database-room-booking-repository';
import type { InventoryBarcodeRecord, InventoryCategoryRecord, InventoryItemRecord, InventoryVendorRecord } from './catalog-service';
import { toItem, toLot } from './database-inventory-repository';
import type { InventoryLotRecord } from './inventory-repository';
import { issueOrder } from './quantities';

export interface StockRow { itemId: string; code: string; name: string; categoryName: string; issueUnit: string; onHand: number; value: string; nearestExpiry: string | null; belowReorder: boolean; isActive: boolean; }
export interface ScanItem { id: string; code: string; name: string; issueUnit: string; purchaseUnit: string; purchaseUnitFactor: number; tracksExpiry: boolean; isActive: boolean; }
export type ScanResult =
  | { kind: 'lot'; item: ScanItem; lot: { id: string; lotCode: string; expiryDate: string | null; onHandQuantity: number } }
  | { kind: 'barcode'; item: ScanItem; unitKind: InventoryUnitKind }
  | { kind: 'item'; item: ScanItem };
export interface MovementView { id: string; kind: InventoryMovementKind; quantity: number; unitCost: string; occurredAt: Date; lotCode: string; reference: string | null; actorName: string | null; }
export interface ItemDetail { item: InventoryItemRecord & { categoryName: string }; barcodes: InventoryBarcodeRecord[]; lots: InventoryLotRecord[]; expiredLots: InventoryLotRecord[]; movements: MovementView[]; }
export interface ReceiptSummary { id: string; reference: string; vendorName: string | null; receivedOn: string; status: InventoryReceiptStatus; lineCount: number; total: string; }
export interface ReceiptLineView { id: string; lineNo: number; itemId: string; itemCode: string; itemName: string; issueUnit: string; purchaseUnit: string; enteredUnitKind: InventoryUnitKind; enteredQuantity: number; enteredUnitPrice: string; issueQuantity: number; unitCost: string; lineTotal: string; manufacturerLotNo: string | null; expiryDate: string | null; lotId: string | null; lotCode: string | null; }
export interface ReceiptHistoryView { action: InventoryReceiptHistoryAction; actorName: string | null; reason: string | null; createdAt: Date; }
export interface ReceiptDetail extends ReceiptSummary { kind: 'OPENING' | 'DELIVERY'; vendorId: string | null; documentNo: string | null; createdByName: string | null; postedAt: Date | null; lines: ReceiptLineView[]; history: ReceiptHistoryView[]; }
export interface LabelLot { lotCode: string; itemCode: string; itemName: string; expiryDate: string | null; receivedOn: string; }
export interface ItemListRow extends InventoryItemRecord { categoryName: string; barcodes: InventoryBarcodeRecord[]; }

type Row = Record<string, unknown>;
const optionalDate = (value: unknown) => (value === null || value === undefined ? null : fromMariaDbDate(value as Date | string));
// MariaDB returns DECIMAL as a string; keep it as one so large totals never pass through a float.
const money = (value: unknown) => (typeof value === 'string' ? value : Number(value ?? 0).toFixed(2));
const itemSelect = 'i.id, i.code, i.name, i.category_id AS categoryId, i.issue_unit AS issueUnit, i.purchase_unit AS purchaseUnit, i.purchase_unit_factor AS purchaseUnitFactor, i.reorder_point AS reorderPoint, i.tracks_expiry AS tracksExpiry, i.is_active AS isActive';
const lotSelect = 'l.id, l.lot_code AS lotCode, l.item_id AS itemId, l.receipt_line_id AS receiptLineId, l.manufacturer_lot_no AS manufacturerLotNo, l.expiry_date AS expiryDate, l.unit_cost AS unitCost, l.received_quantity AS receivedQuantity, l.on_hand_quantity AS onHandQuantity, l.received_at AS receivedAt';
const summarySelect = `SELECT r.id, r.reference, r.kind, r.vendor_id AS vendorId, v.name AS vendorName, r.document_no AS documentNo, r.received_on AS receivedOn, r.status, r.posted_at AS postedAt, p.display_name AS createdByName,
  (SELECT COUNT(*) FROM inventory_receipt_line rl WHERE rl.receipt_id = r.id) AS lineCount, (SELECT COALESCE(SUM(rl.line_total), 0) FROM inventory_receipt_line rl WHERE rl.receipt_id = r.id) AS total
  FROM inventory_receipt r LEFT JOIN inventory_vendor v ON v.id = r.vendor_id LEFT JOIN person p ON p.id = r.created_by_person_id`;

const toSummary = (row: Row): ReceiptSummary => ({ id: String(row.id), reference: String(row.reference), vendorName: (row.vendorName as string | null) ?? null, receivedOn: fromMariaDbDate(row.receivedOn as Date | string), status: row.status as InventoryReceiptStatus, lineCount: Number(row.lineCount), total: money(row.total) });
const toScanItem = (row: Row): ScanItem => {
  const item = toItem(row);
  return { id: item.id, code: item.code, name: item.name, issueUnit: item.issueUnit, purchaseUnit: item.purchaseUnit, purchaseUnitFactor: item.purchaseUnitFactor, tracksExpiry: item.tracksExpiry, isActive: item.isActive };
};
const toBarcode = (row: Row): InventoryBarcodeRecord => ({ id: String(row.id), itemId: String(row.itemId), barcode: String(row.barcode), unitKind: row.unitKind as InventoryUnitKind });

export class InventoryQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  /** `today` is the Bangkok date; lots that expired before it are not counted as stock. */
  async listStock(filter: { search?: string; categoryId?: string }, today: string): Promise<StockRow[]> {
    const conditions: string[] = [];
    const parameters: unknown[] = [today, today, today];
    const search = filter.search?.trim();
    if (search) {
      conditions.push('(i.code LIKE ? OR i.name LIKE ? OR EXISTS (SELECT 1 FROM inventory_item_barcode b WHERE b.item_id = i.id AND b.barcode = ?))');
      parameters.push(`%${search.toUpperCase()}%`, `%${search}%`, search);
    }
    if (filter.categoryId) { conditions.push('i.category_id = ?'); parameters.push(filter.categoryId); }
    const rows = await this.database.query<Row>(
      `SELECT i.id AS itemId, i.code, i.name, c.name AS categoryName, i.issue_unit AS issueUnit, i.reorder_point AS reorderPoint, i.is_active AS isActive,
         COALESCE(SUM(CASE WHEN l.expiry_date IS NULL OR l.expiry_date >= ? THEN l.on_hand_quantity END), 0) AS onHand,
         ROUND(COALESCE(SUM(CASE WHEN l.expiry_date IS NULL OR l.expiry_date >= ? THEN l.on_hand_quantity * l.unit_cost END), 0), 2) AS value,
         MIN(CASE WHEN l.expiry_date >= ? THEN l.expiry_date END) AS nearestExpiry
       FROM inventory_item i JOIN inventory_category c ON c.id = i.category_id LEFT JOIN inventory_lot l ON l.item_id = i.id AND l.on_hand_quantity > 0
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY i.id, i.code, i.name, c.name, i.issue_unit, i.reorder_point, i.is_active ORDER BY i.code`,
      parameters as never
    );
    return rows.map((row) => {
      const onHand = Number(row.onHand);
      return { itemId: String(row.itemId), code: String(row.code), name: String(row.name), categoryName: String(row.categoryName), issueUnit: String(row.issueUnit), onHand, value: money(row.value), nearestExpiry: optionalDate(row.nearestExpiry), belowReorder: onHand < Number(row.reorderPoint), isActive: Boolean(row.isActive) };
    });
  }

  async itemDetail(itemId: string, today: string): Promise<ItemDetail | null> {
    const row = (await this.database.query<Row>(`SELECT ${itemSelect}, c.name AS categoryName FROM inventory_item i JOIN inventory_category c ON c.id = i.category_id WHERE i.id = ?`, [itemId]))[0];
    if (!row) return null;
    const [barcodes, lotRows, movements] = await Promise.all([
      this.database.query<Row>('SELECT id, item_id AS itemId, barcode, unit_kind AS unitKind FROM inventory_item_barcode WHERE item_id = ? ORDER BY barcode', [itemId]),
      this.database.query<Row>(`SELECT ${lotSelect} FROM inventory_lot l WHERE l.item_id = ? AND l.on_hand_quantity > 0`, [itemId]),
      this.database.query<Row>(
        `SELECT m.id, m.kind, m.quantity, m.unit_cost AS unitCost, m.occurred_at AS occurredAt, l.lot_code AS lotCode, r.reference, p.display_name AS actorName
         FROM inventory_movement m JOIN inventory_lot l ON l.id = m.lot_id LEFT JOIN inventory_receipt r ON m.source_type = 'inventory_receipt' AND r.id = m.source_id LEFT JOIN person p ON p.id = m.actor_person_id
         WHERE m.item_id = ? ORDER BY m.occurred_at DESC, m.id DESC LIMIT 100`, [itemId])
    ]);
    const lots = lotRows.map(toLot);
    const usable = issueOrder(lots, today);
    return {
      item: { ...toItem(row), categoryName: String(row.categoryName) },
      barcodes: barcodes.map(toBarcode),
      lots: usable,
      expiredLots: lots.filter((lot) => !usable.includes(lot)).sort((left, right) => String(left.expiryDate).localeCompare(String(right.expiryDate))),
      movements: movements.map((movement) => ({ id: String(movement.id), kind: movement.kind as InventoryMovementKind, quantity: Number(movement.quantity), unitCost: String(movement.unitCost), occurredAt: fromMariaDbDatetime(movement.occurredAt as Date | string), lotCode: String(movement.lotCode), reference: (movement.reference as string | null) ?? null, actorName: (movement.actorName as string | null) ?? null }))
    };
  }

  /** Scanner input arrives with stray whitespace; lot and item codes are stored upper-case, manufacturer barcodes exactly as printed. */
  async resolveScan(code: string): Promise<ScanResult | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('LT-')) {
      const lot = (await this.database.query<Row>(`SELECT ${itemSelect}, l.id AS lotId, l.lot_code AS lotCode, l.expiry_date AS expiryDate, l.on_hand_quantity AS onHandQuantity FROM inventory_lot l JOIN inventory_item i ON i.id = l.item_id WHERE l.lot_code = ?`, [upper]))[0];
      if (lot) return { kind: 'lot', item: toScanItem(lot), lot: { id: String(lot.lotId), lotCode: String(lot.lotCode), expiryDate: optionalDate(lot.expiryDate), onHandQuantity: Number(lot.onHandQuantity) } };
    }
    const barcode = (await this.database.query<Row>(`SELECT ${itemSelect}, b.unit_kind AS unitKind FROM inventory_item_barcode b JOIN inventory_item i ON i.id = b.item_id WHERE b.barcode = ?`, [trimmed]))[0];
    if (barcode) return { kind: 'barcode', item: toScanItem(barcode), unitKind: barcode.unitKind as InventoryUnitKind };
    const item = (await this.database.query<Row>(`SELECT ${itemSelect} FROM inventory_item i WHERE i.code = ?`, [upper]))[0];
    return item ? { kind: 'item', item: toScanItem(item) } : null;
  }

  async listReceipts(limit = 100): Promise<ReceiptSummary[]> {
    return (await this.database.query<Row>(`${summarySelect} WHERE r.kind = 'DELIVERY' ORDER BY r.created_at DESC, r.reference DESC LIMIT ?`, [limit])).map(toSummary);
  }

  async receiptDetail(receiptId: string): Promise<ReceiptDetail | null> {
    const row = (await this.database.query<Row>(`${summarySelect} WHERE r.id = ?`, [receiptId]))[0];
    if (!row) return null;
    const [lines, history] = await Promise.all([
      this.database.query<Row>(
        `SELECT rl.id, rl.line_no AS lineNo, rl.item_id AS itemId, i.code AS itemCode, i.name AS itemName, i.issue_unit AS issueUnit, i.purchase_unit AS purchaseUnit, rl.entered_unit_kind AS enteredUnitKind, rl.entered_quantity AS enteredQuantity,
           rl.entered_unit_price AS enteredUnitPrice, rl.issue_quantity AS issueQuantity, rl.unit_cost AS unitCost, rl.line_total AS lineTotal, rl.manufacturer_lot_no AS manufacturerLotNo, rl.expiry_date AS expiryDate, l.id AS lotId, l.lot_code AS lotCode
         FROM inventory_receipt_line rl JOIN inventory_item i ON i.id = rl.item_id LEFT JOIN inventory_lot l ON l.receipt_line_id = rl.id WHERE rl.receipt_id = ? ORDER BY rl.line_no`, [receiptId]),
      this.database.query<Row>('SELECT h.action, p.display_name AS actorName, h.reason, h.created_at AS createdAt FROM inventory_receipt_history h LEFT JOIN person p ON p.id = h.actor_person_id WHERE h.receipt_id = ? ORDER BY h.created_at, h.id', [receiptId])
    ]);
    return {
      ...toSummary(row), kind: row.kind as ReceiptDetail['kind'], vendorId: (row.vendorId as string | null) ?? null, documentNo: (row.documentNo as string | null) ?? null, createdByName: (row.createdByName as string | null) ?? null,
      postedAt: row.postedAt ? fromMariaDbDatetime(row.postedAt as Date | string) : null,
      lines: lines.map((line) => ({
        id: String(line.id), lineNo: Number(line.lineNo), itemId: String(line.itemId), itemCode: String(line.itemCode), itemName: String(line.itemName), issueUnit: String(line.issueUnit), purchaseUnit: String(line.purchaseUnit),
        enteredUnitKind: line.enteredUnitKind as InventoryUnitKind, enteredQuantity: Number(line.enteredQuantity), enteredUnitPrice: money(line.enteredUnitPrice), issueQuantity: Number(line.issueQuantity), unitCost: String(line.unitCost), lineTotal: money(line.lineTotal),
        manufacturerLotNo: (line.manufacturerLotNo as string | null) ?? null, expiryDate: optionalDate(line.expiryDate), lotId: (line.lotId as string | null) ?? null, lotCode: (line.lotCode as string | null) ?? null
      })),
      history: history.map((entry) => ({ action: entry.action as InventoryReceiptHistoryAction, actorName: (entry.actorName as string | null) ?? null, reason: (entry.reason as string | null) ?? null, createdAt: fromMariaDbDatetime(entry.createdAt as Date | string) }))
    };
  }

  async opening(): Promise<ReceiptDetail | null> {
    const row = (await this.database.query<{ id: string }>("SELECT id FROM inventory_receipt WHERE kind = 'OPENING' LIMIT 1"))[0];
    return row ? this.receiptDetail(row.id) : null;
  }

  async labelLots(receiptId: string): Promise<LabelLot[]> {
    const rows = await this.database.query<Row>(
      `SELECT l.lot_code AS lotCode, i.code AS itemCode, i.name AS itemName, l.expiry_date AS expiryDate, r.received_on AS receivedOn
       FROM inventory_lot l JOIN inventory_receipt_line rl ON rl.id = l.receipt_line_id JOIN inventory_receipt r ON r.id = rl.receipt_id JOIN inventory_item i ON i.id = l.item_id
       WHERE r.id = ? ORDER BY rl.line_no`, [receiptId]);
    return rows.map((row) => ({ lotCode: String(row.lotCode), itemCode: String(row.itemCode), itemName: String(row.itemName), expiryDate: optionalDate(row.expiryDate), receivedOn: fromMariaDbDate(row.receivedOn as Date | string) }));
  }

  async listCategories(): Promise<InventoryCategoryRecord[]> {
    return (await this.database.query<Row>('SELECT id, name, is_active AS isActive FROM inventory_category ORDER BY name')).map((row) => ({ id: String(row.id), name: String(row.name), isActive: Boolean(row.isActive) }));
  }

  async listItems(): Promise<ItemListRow[]> {
    const [items, barcodes] = await Promise.all([
      this.database.query<Row>(`SELECT ${itemSelect}, c.name AS categoryName FROM inventory_item i JOIN inventory_category c ON c.id = i.category_id ORDER BY i.code`),
      this.database.query<Row>('SELECT id, item_id AS itemId, barcode, unit_kind AS unitKind FROM inventory_item_barcode ORDER BY barcode')
    ]);
    const byItem = new Map<string, InventoryBarcodeRecord[]>();
    for (const barcode of barcodes.map(toBarcode)) byItem.set(barcode.itemId, [...(byItem.get(barcode.itemId) ?? []), barcode]);
    return items.map((row) => ({ ...toItem(row), categoryName: String(row.categoryName), barcodes: byItem.get(String(row.id)) ?? [] }));
  }

  async listVendors(): Promise<InventoryVendorRecord[]> {
    return (await this.database.query<Row>('SELECT id, name, phone, address, is_active AS isActive FROM inventory_vendor ORDER BY name')).map((row) => ({ id: String(row.id), name: String(row.name), phone: String(row.phone), address: String(row.address), isActive: Boolean(row.isActive) }));
  }
}
