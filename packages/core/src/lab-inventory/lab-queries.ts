import type { LabMovementKind, LabRequisitionStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { pickFefo, type LotOption } from './lab-rules';
import { dateOnly } from './lab-stock-writer';

export type StoreScope = string | 'ALL';
export type LabBalanceRow = { itemId: string; code: string; name: string; useUnit: string; receiveUnit: string; unitsPerReceive: number; quantity: number; value: string; nearestExpiry: string | null; belowReorder: boolean };
export type LabLedgerRow = { id: string; entryDate: string; kind: LabMovementKind; quantity: number; balance: number; lotNo: string; storeId: string; docNo: string | null; usageTypeName: string | null; actorName: string; note: string };
export type LabRequisitionSummary = { id: string; docNo: string; sectionId: string; sectionName: string; status: LabRequisitionStatus; requestedBy: string; requesterName: string; requestedAt: string; lineCount: number };
export type LabRequisitionDetail = LabRequisitionSummary & { note: string; decidedAt: string | null; deciderName: string | null; decisionReason: string | null; issuedAt: string | null; issueNote: string | null;
  lines: { id: string; itemId: string; code: string; name: string; useUnit: string; receiveUnit: string; unitsPerReceive: number; quantityRequested: number; quantityIssued: number | null; mainAvailable: number }[] };

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const money = (value: unknown) => Number(value ?? 0).toFixed(2);
const scope = (storeId: StoreScope, column = 'b.store_id') => (storeId === 'ALL' ? { sql: '1 = 1', params: [] as string[] } : { sql: `${column} = ?`, params: [storeId] });

/** Read side of วัสดุคงคลัง Lab. Callers check `labCan(..., 'viewStock', sectionId)` before asking for a store. */
export class LabQueries {
  constructor(private readonly database: Database) {}

  async balances(storeId: StoreScope): Promise<LabBalanceRow[]> {
    const where = scope(storeId);
    const rows = await this.database.query<{ item_id: string; code: string; name: string; use_unit: string; receive_unit: string; units_per_receive: number; quantity: number | null; value: string | null; nearest: string | null; reorder: number | null }>(
      `SELECT i.id AS item_id, i.code, i.name, i.use_unit, i.receive_unit, i.units_per_receive, s.quantity, s.value, s.nearest, r.reorder_point AS reorder
       FROM lab_item i
       LEFT JOIN (SELECT l.item_id, SUM(b.quantity) AS quantity, SUM(b.quantity * l.unit_cost) AS value, DATE_FORMAT(MIN(CASE WHEN b.quantity > 0 THEN l.expiry_date END), '%Y-%m-%d') AS nearest
                  FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE ${where.sql} GROUP BY l.item_id) s ON s.item_id = i.id
       LEFT JOIN lab_item_reorder r ON r.item_id = i.id AND r.store_id = ?
       WHERE s.quantity > 0 OR (r.reorder_point > 0 AND i.is_active = 1)
       ORDER BY i.code`, [...where.params, storeId === 'ALL' ? '' : storeId]);
    return rows.map((row) => {
      const quantity = Number(row.quantity ?? 0);
      return { itemId: row.item_id, code: row.code, name: row.name, useUnit: row.use_unit, receiveUnit: row.receive_unit, unitsPerReceive: Number(row.units_per_receive), quantity, value: money(row.value), nearestExpiry: row.nearest, belowReorder: storeId !== 'ALL' && row.reorder !== null && quantity < Number(row.reorder) };
    });
  }

  async lots(itemId: string, storeId: StoreScope): Promise<{ lotId: string; lotNo: string; expiryDate: string | null; unitCost: string; storeId: string; quantity: number }[]> {
    const where = scope(storeId);
    const rows = await this.database.query<{ lot_id: string; lot_no: string; expiry_date: string | null; unit_cost: string; store_id: string; quantity: number }>(
      `SELECT l.id AS lot_id, l.lot_no, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS expiry_date, l.unit_cost, b.store_id, b.quantity FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id
       WHERE l.item_id = ? AND b.quantity > 0 AND ${where.sql} ORDER BY l.expiry_key, l.created_at`, [itemId, ...where.params]);
    return rows.map((row) => ({ lotId: row.lot_id, lotNo: row.lot_no, expiryDate: row.expiry_date, unitCost: String(row.unit_cost), storeId: row.store_id, quantity: Number(row.quantity) }));
  }

  /** Movements between `from` and `to` (Bangkok dates, inclusive) with the running balance. */
  async ledger(itemId: string, storeId: StoreScope, from: string, to: string): Promise<{ openingBalance: number; rows: LabLedgerRow[] }> {
    const where = scope(storeId, 'm.store_id');
    const [before] = await this.database.query<{ q: number | null }>(`SELECT SUM(m.quantity) AS q FROM lab_movement m JOIN lab_lot l ON l.id = m.lot_id WHERE l.item_id = ? AND m.entry_date < ? AND ${where.sql}`, [itemId, from, ...where.params]);
    const rows = await this.database.query<{ id: string; entry_date: string; kind: LabMovementKind; quantity: number; lot_no: string; store_id: string; doc_no: string | null; usage_type: string | null; actor: string; note: string }>(
      `SELECT m.id, DATE_FORMAT(m.entry_date, '%Y-%m-%d') AS entry_date, m.kind, m.quantity, l.lot_no, m.store_id, COALESCE(r.doc_no, q.doc_no) AS doc_no, t.name AS usage_type, p.display_name AS actor, m.note
       FROM lab_movement m JOIN lab_lot l ON l.id = m.lot_id JOIN person p ON p.id = m.created_by
       LEFT JOIN lab_receipt r ON m.ref_type = 'RECEIPT' AND r.id = m.ref_id
       LEFT JOIN lab_requisition q ON m.ref_type = 'REQUISITION' AND q.id = m.ref_id
       LEFT JOIN lab_usage_type t ON t.id = m.usage_type_id
       WHERE l.item_id = ? AND m.entry_date BETWEEN ? AND ? AND ${where.sql} ORDER BY m.entry_date, m.created_at, m.id`, [itemId, from, to, ...where.params]);
    let balance = Number(before?.q ?? 0);
    const openingBalance = balance;
    return { openingBalance, rows: rows.map((row) => {
      balance += Number(row.quantity);
      return { id: row.id, entryDate: row.entry_date, kind: row.kind, quantity: Number(row.quantity), balance, lotNo: row.lot_no, storeId: row.store_id, docNo: row.doc_no, usageTypeName: row.usage_type, actorName: row.actor, note: row.note };
    }) };
  }

  async lotOptions(storeId: string, itemId: string): Promise<LotOption[]> {
    const rows = await this.database.query<{ lot_id: string; expiry_date: string | null; created_at: string | Date; quantity: number }>(
      "SELECT b.lot_id, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS expiry_date, l.created_at, b.quantity FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE b.store_id = ? AND l.item_id = ? AND b.quantity > 0", [storeId, itemId]);
    return rows.map((row) => ({ lotId: row.lot_id, expiryDate: dateOnly(row.expiry_date), createdAt: new Date(row.created_at).toISOString(), available: Number(row.quantity) }));
  }

  /** The issue dialog's starting point: FEFO picks over คลังหลัก for each line of a ใบขอเบิก, capped at what is there. */
  async fefoSuggestion(requisitionId: string, entryDate: string): Promise<{ lineId: string; itemId: string; quantityRequested: number; suggestion: ReturnType<typeof pickFefo>; lots: LotOption[] }[]> {
    const [main] = await this.database.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN'");
    const lines = await this.database.query<{ id: string; item_id: string; quantity_requested: number }>('SELECT id, item_id, quantity_requested FROM lab_requisition_line WHERE requisition_id = ? ORDER BY line_no', [requisitionId]);
    const result = [];
    for (const line of lines) {
      const lots = await this.lotOptions(main!.id, line.item_id);
      result.push({ lineId: line.id, itemId: line.item_id, quantityRequested: Number(line.quantity_requested), suggestion: pickFefo(lots, Number(line.quantity_requested), entryDate), lots });
    }
    return result;
  }

  async requisitions(filter: { status?: LabRequisitionStatus[]; sectionIds?: string[]; requestedBy?: string; limit?: number } = {}): Promise<LabRequisitionSummary[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status?.length) { conditions.push(`q.status IN (${filter.status.map(() => '?').join(', ')})`); params.push(...filter.status); }
    if (filter.sectionIds) { if (filter.sectionIds.length === 0) return []; conditions.push(`q.section_id IN (${filter.sectionIds.map(() => '?').join(', ')})`); params.push(...filter.sectionIds); }
    if (filter.requestedBy) { conditions.push('q.requested_by = ?'); params.push(filter.requestedBy); }
    const rows = await this.database.query<{ id: string; doc_no: string; section_id: string; section_name: string; status: LabRequisitionStatus; requested_by: string; requester: string; requested_at: string | Date; line_count: number }>(
      `SELECT q.id, q.doc_no, q.section_id, c.name AS section_name, q.status, q.requested_by, p.display_name AS requester, q.requested_at, (SELECT COUNT(*) FROM lab_requisition_line x WHERE x.requisition_id = q.id) AS line_count
       FROM lab_requisition q JOIN lab_section c ON c.id = q.section_id JOIN person p ON p.id = q.requested_by
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY q.requested_at DESC LIMIT ${Math.min(filter.limit ?? 200, 500)}`, params);
    return rows.map((row) => ({ id: row.id, docNo: row.doc_no, sectionId: row.section_id, sectionName: row.section_name, status: row.status, requestedBy: row.requested_by, requesterName: row.requester, requestedAt: iso(row.requested_at)!, lineCount: Number(row.line_count) }));
  }

  async requisition(id: string): Promise<LabRequisitionDetail | null> {
    const [row] = await this.database.query<{ id: string; doc_no: string; section_id: string; section_name: string; status: LabRequisitionStatus; requested_by: string; requester: string; requested_at: string | Date; note: string; decided_at: string | Date | null; decider: string | null; decision_reason: string | null; issued_at: string | Date | null; issue_note: string | null }>(
      `SELECT q.id, q.doc_no, q.section_id, c.name AS section_name, q.status, q.requested_by, p.display_name AS requester, q.requested_at, q.note, q.decided_at, d.display_name AS decider, q.decision_reason, q.issued_at, q.issue_note
       FROM lab_requisition q JOIN lab_section c ON c.id = q.section_id JOIN person p ON p.id = q.requested_by LEFT JOIN person d ON d.id = q.decided_by WHERE q.id = ?`, [id]);
    if (!row) return null;
    const lines = await this.database.query<{ id: string; item_id: string; code: string; name: string; use_unit: string; receive_unit: string; units_per_receive: number; quantity_requested: number; quantity_issued: number | null; available: number | null }>(
      `SELECT x.id, x.item_id, i.code, i.name, i.use_unit, i.receive_unit, i.units_per_receive, x.quantity_requested, x.quantity_issued,
              (SELECT SUM(b.quantity) FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id JOIN lab_store s ON s.id = b.store_id WHERE l.item_id = x.item_id AND s.kind = 'MAIN') AS available
       FROM lab_requisition_line x JOIN lab_item i ON i.id = x.item_id WHERE x.requisition_id = ? ORDER BY x.line_no`, [id]);
    return { id: row.id, docNo: row.doc_no, sectionId: row.section_id, sectionName: row.section_name, status: row.status, requestedBy: row.requested_by, requesterName: row.requester, requestedAt: iso(row.requested_at)!, lineCount: lines.length,
      note: row.note, decidedAt: iso(row.decided_at), deciderName: row.decider, decisionReason: row.decision_reason, issuedAt: iso(row.issued_at), issueNote: row.issue_note,
      lines: lines.map((line) => ({ id: line.id, itemId: line.item_id, code: line.code, name: line.name, useUnit: line.use_unit, receiveUnit: line.receive_unit, unitsPerReceive: Number(line.units_per_receive), quantityRequested: Number(line.quantity_requested), quantityIssued: line.quantity_issued === null ? null : Number(line.quantity_issued), mainAvailable: Number(line.available ?? 0) })) };
  }

  async receipts(from: string, to: string): Promise<{ id: string; docNo: string; receivedOn: string; vendorName: string; invoiceNo: string; status: string; total: string; lineCount: number }[]> {
    const rows = await this.database.query<{ id: string; doc_no: string; received_on: string; vendor: string; invoice_no: string; status: string; total: string | null; line_count: number }>(
      `SELECT r.id, r.doc_no, DATE_FORMAT(r.received_on, '%Y-%m-%d') AS received_on, v.name AS vendor, r.invoice_no, r.status, SUM(x.quantity_receive * x.price_per_receive) AS total, COUNT(x.id) AS line_count
       FROM lab_receipt r JOIN lab_vendor v ON v.id = r.vendor_id JOIN lab_receipt_line x ON x.receipt_id = r.id WHERE r.received_on BETWEEN ? AND ? GROUP BY r.id ORDER BY r.received_on DESC, r.doc_no DESC`, [from, to]);
    return rows.map((row) => ({ id: row.id, docNo: row.doc_no, receivedOn: row.received_on, vendorName: row.vendor, invoiceNo: row.invoice_no, status: row.status, total: money(row.total), lineCount: Number(row.line_count) }));
  }

  async receipt(id: string) {
    const [row] = await this.database.query<{ id: string; doc_no: string; received_on: string; vendor: string; invoice_no: string; status: string; creator: string; created_at: string | Date; void_reason: string | null }>(
      "SELECT r.id, r.doc_no, DATE_FORMAT(r.received_on, '%Y-%m-%d') AS received_on, v.name AS vendor, r.invoice_no, r.status, p.display_name AS creator, r.created_at, r.void_reason FROM lab_receipt r JOIN lab_vendor v ON v.id = r.vendor_id JOIN person p ON p.id = r.created_by WHERE r.id = ?", [id]);
    if (!row) return null;
    const lines = await this.database.query<{ id: string; code: string; name: string; receive_unit: string; use_unit: string; units_per_receive: number; lot_no: string; expiry_date: string | null; quantity_receive: number; price_per_receive: string }>(
      "SELECT x.id, i.code, i.name, i.receive_unit, i.use_unit, i.units_per_receive, x.lot_no, DATE_FORMAT(x.expiry_date, '%Y-%m-%d') AS expiry_date, x.quantity_receive, x.price_per_receive FROM lab_receipt_line x JOIN lab_item i ON i.id = x.item_id WHERE x.receipt_id = ? ORDER BY x.line_no", [id]);
    return { id: row.id, docNo: row.doc_no, receivedOn: row.received_on, vendorName: row.vendor, invoiceNo: row.invoice_no, status: row.status, creatorName: row.creator, createdAt: iso(row.created_at)!, voidReason: row.void_reason,
      lines: lines.map((line) => ({ id: line.id, code: line.code, name: line.name, receiveUnit: line.receive_unit, useUnit: line.use_unit, unitsPerReceive: Number(line.units_per_receive), lotNo: line.lot_no, expiryDate: line.expiry_date, quantityReceive: Number(line.quantity_receive), pricePerReceive: money(line.price_per_receive), total: money(Number(line.quantity_receive) * Number(line.price_per_receive)) })) };
  }

  async usages(filter: { storeIds: string[]; from: string; to: string; createdBy?: string }): Promise<{ id: string; storeId: string; itemId: string; code: string; name: string; useUnit: string; quantity: number; usageTypeName: string; entryDate: string; note: string; status: string; createdBy: string; creatorName: string }[]> {
    if (filter.storeIds.length === 0) return [];
    const rows = await this.database.query<{ id: string; store_id: string; item_id: string; code: string; name: string; use_unit: string; quantity: number; usage_type: string; entry_date: string; note: string; status: string; created_by: string; creator: string }>(
      `SELECT u.id, u.store_id, u.item_id, i.code, i.name, i.use_unit, u.quantity, t.name AS usage_type, DATE_FORMAT(u.entry_date, '%Y-%m-%d') AS entry_date, u.note, u.status, u.created_by, p.display_name AS creator
       FROM lab_usage u JOIN lab_item i ON i.id = u.item_id JOIN lab_usage_type t ON t.id = u.usage_type_id JOIN person p ON p.id = u.created_by
       WHERE u.store_id IN (${filter.storeIds.map(() => '?').join(', ')}) AND u.entry_date BETWEEN ? AND ? ${filter.createdBy ? 'AND u.created_by = ?' : ''} ORDER BY u.entry_date DESC, u.created_at DESC LIMIT 500`,
      [...filter.storeIds, filter.from, filter.to, ...(filter.createdBy ? [filter.createdBy] : [])]);
    return rows.map((row) => ({ id: row.id, storeId: row.store_id, itemId: row.item_id, code: row.code, name: row.name, useUnit: row.use_unit, quantity: Number(row.quantity), usageTypeName: row.usage_type, entryDate: row.entry_date, note: row.note, status: row.status, createdBy: row.created_by, creatorName: row.creator }));
  }

  async openingLines(): Promise<{ id: string; rowNo: number; storeId: string; itemId: string; code: string; name: string; useUnit: string; lotNo: string; expiryDate: string | null; quantity: number; unitCost: string }[]> {
    const rows = await this.database.query<{ id: string; row_no: number; store_id: string; item_id: string; code: string; name: string; use_unit: string; lot_no: string; expiry_date: string | null; quantity: number; unit_cost: string }>(
      "SELECT o.id, o.row_no, o.store_id, o.item_id, i.code, i.name, i.use_unit, o.lot_no, DATE_FORMAT(o.expiry_date, '%Y-%m-%d') AS expiry_date, o.quantity, o.unit_cost FROM lab_opening_line o JOIN lab_item i ON i.id = o.item_id ORDER BY o.row_no");
    return rows.map((row) => ({ id: row.id, rowNo: Number(row.row_no), storeId: row.store_id, itemId: row.item_id, code: row.code, name: row.name, useUnit: row.use_unit, lotNo: row.lot_no, expiryDate: row.expiry_date, quantity: Number(row.quantity), unitCost: String(row.unit_cost) }));
  }

  async pendingDecisionCount(): Promise<number> {
    return Number((await this.database.query<{ n: number }>("SELECT COUNT(*) AS n FROM lab_requisition WHERE status = 'SUBMITTED'"))[0]?.n ?? 0);
  }

  async pendingIssueCount(): Promise<number> {
    return Number((await this.database.query<{ n: number }>("SELECT COUNT(*) AS n FROM lab_requisition WHERE status = 'APPROVED'"))[0]?.n ?? 0);
  }
}
