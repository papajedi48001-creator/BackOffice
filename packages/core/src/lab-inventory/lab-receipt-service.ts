import { randomUUID } from 'node:crypto';
import { labReasonInputSchema, labReceiptInputSchema, type AccessSubject, type LabReasonInput, type LabReceiptInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageLab, labCan, loadLabMember } from './lab-access';
import { labAudit } from './lab-db';
import { fiscalYearBE, unitCost } from './lab-rules';
import { findOrCreateLot, LabRefusal, labToday, labTransaction, move, nextDocNo, requireCertified } from './lab-stock-writer';

export type LabReceiptCode = 'FORBIDDEN' | 'OPENING_NOT_CERTIFIED' | 'NOT_FOUND' | 'FUTURE_DATE' | 'EXPIRY_BEFORE_RECEIPT' | 'WRONG_STATUS' | 'RECEIPT_LOT_IN_USE';

/** ใบรับเข้า Lab: stock from a ผู้ขาย into คลังหลัก only. */
export class LabReceiptService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async create(subject: AccessSubject, input: LabReceiptInput): Promise<{ ok: true; receiptId: string; docNo: string } | { ok: false; code: LabReceiptCode }> {
    const receipt = labReceiptInputSchema.parse(input);
    const actor = await this.actor(subject);
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    if (receipt.receivedOn > labToday()) return { ok: false, code: 'FUTURE_DATE' };
    if (receipt.lines.some((line) => line.expiryDate !== null && line.expiryDate <= receipt.receivedOn)) return { ok: false, code: 'EXPIRY_BEFORE_RECEIPT' };
    return labTransaction(this.database, async (database) => {
      await requireCertified(database);
      const [main] = await database.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN'");
      if ((await database.query('SELECT id FROM lab_vendor WHERE id = ?', [receipt.vendorId])).length === 0) throw new LabRefusal('NOT_FOUND');
      const receiptId = this.createId();
      const docNo = await nextDocNo(database, 'LR', fiscalYearBE(receipt.receivedOn));
      await database.execute("INSERT INTO lab_receipt (id, doc_no, received_on, vendor_id, invoice_no, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'POSTED', ?, UTC_TIMESTAMP())", [receiptId, docNo, receipt.receivedOn, receipt.vendorId, receipt.invoiceNo, actor]);
      for (const [index, line] of receipt.lines.entries()) {
        const [item] = await database.query<{ factor: number }>('SELECT units_per_receive AS factor FROM lab_item WHERE id = ?', [line.itemId]);
        if (!item) throw new LabRefusal('NOT_FOUND');
        const lineId = this.createId();
        const lotId = await findOrCreateLot(database, { itemId: line.itemId, lotNo: line.lotNo, expiryDate: line.expiryDate, unitCost: unitCost(line.pricePerReceive, Number(item.factor)), source: 'RECEIPT', receiptLineId: lineId }, this.createId);
        await database.execute('INSERT INTO lab_receipt_line (id, receipt_id, line_no, item_id, lot_no, expiry_date, quantity_receive, price_per_receive, lot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [lineId, receiptId, index + 1, line.itemId, line.lotNo, line.expiryDate, line.quantityReceive, line.pricePerReceive.toFixed(2), lotId]);
        await move(database, { lotId, storeId: main!.id, quantity: line.quantityReceive * Number(item.factor), kind: 'RECEIPT', entryDate: receipt.receivedOn, refType: 'RECEIPT', refId: receiptId, actorPersonId: actor }, this.createId);
      }
      await labAudit(database, this.createId, actor, 'lab.receipt.create', 'lab_receipt', receiptId, { docNo, lines: receipt.lines.length });
      return { ok: true as const, receiptId, docNo };
    });
  }

  /** ยกเลิกใบรับ: only while nothing else has moved any of its lots. The reason stays in the table, never in the audit. */
  async void(subject: AccessSubject, receiptId: string, input: LabReasonInput): Promise<{ ok: true } | { ok: false; code: LabReceiptCode }> {
    const { reason } = labReasonInputSchema.parse(input);
    const actor = await this.actor(subject);
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    return labTransaction(this.database, async (database) => {
      const [receipt] = await database.query<{ status: string; doc_no: string }>('SELECT status, doc_no FROM lab_receipt WHERE id = ? FOR UPDATE', [receiptId]);
      if (!receipt) throw new LabRefusal('NOT_FOUND');
      if (receipt.status !== 'POSTED') throw new LabRefusal('WRONG_STATUS');
      const movements = await database.query<{ lot_id: string; store_id: string; quantity: number; kind: string; ref_id: string }>('SELECT m.lot_id, m.store_id, m.quantity, m.kind, m.ref_id FROM lab_movement m WHERE m.lot_id IN (SELECT lot_id FROM lab_receipt_line WHERE receipt_id = ?) FOR UPDATE', [receiptId]);
      if (movements.some((row) => !(row.kind === 'RECEIPT' && row.ref_id === receiptId))) throw new LabRefusal('RECEIPT_LOT_IN_USE');
      const today = labToday();
      for (const row of movements) await move(database, { lotId: row.lot_id, storeId: row.store_id, quantity: -Number(row.quantity), kind: 'RECEIPT_VOID', entryDate: today, refType: 'RECEIPT', refId: receiptId, actorPersonId: actor }, this.createId);
      await database.execute("UPDATE lab_receipt SET status = 'VOIDED', void_reason = ?, voided_by = ?, voided_at = UTC_TIMESTAMP() WHERE id = ?", [reason, actor, receiptId]);
      await labAudit(database, this.createId, actor, 'lab.receipt.void', 'lab_receipt', receiptId, { docNo: receipt.doc_no });
      return { ok: true as const };
    });
  }

  private async actor(subject: AccessSubject): Promise<string | null> {
    if (!subject.personId) return null;
    return labCan(await loadLabMember(this.database, subject.personId), canManageLab(subject), 'receive') ? subject.personId : null;
  }
}
