import { randomUUID } from 'node:crypto';
import { labOpeningDecisionInputSchema, labOpeningLineInputSchema, type AccessSubject, type LabOpeningDecisionInput, type LabOpeningLineInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canDecideOwnRequest } from '../access/active-role';
import { canManageLab, labCan, loadLabMember, type LabAction } from './lab-access';
import { MAIN_STORE_CODE, parseItemCsv, parseOpeningCsv, type CsvError } from './lab-csv';
import { isDuplicateEntry, isMissingReference, labAudit } from './lab-db';
import { findOrCreateLot, LabRefusal, labBell, labToday, membersWithRole, move, openingStatus } from './lab-stock-writer';

export type LabOpeningCode = 'FORBIDDEN' | 'INVALID_CSV' | 'WRONG_STATUS' | 'REASON_REQUIRED' | 'CONFLICT_OF_INTEREST' | 'NOT_FOUND';
export type LabOpeningResult = { ok: true; count?: number; id?: string } | { ok: false; code: LabOpeningCode; errors?: CsvError[] };
const OPENING_PATH = '/lab/opening';

const setSetting = (database: Database, key: string, value: string) => database.execute('INSERT INTO lab_setting (setting_key, setting_value, updated_at) VALUES (?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)', [key, value]);

/** ยอดยกมา: import (CSV), edit, submit, and หัวหน้า Lab's certification that turns the lines into lots and stock. */
export class LabOpeningService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** ทะเบียนวัสดุ from CSV: adds new codes, updates existing ones (pack size only while the item has no lot). */
  importItems(subject: AccessSubject, csv: string): Promise<LabOpeningResult> {
    const parsed = parseItemCsv(csv);
    if (!parsed.ok) return Promise.resolve({ ok: false, code: 'INVALID_CSV', errors: parsed.errors });
    return this.run(subject, 'manageSettings', false, async (database, actor) => {
      const [main] = await database.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN'");
      const errors: CsvError[] = [];
      for (const [index, row] of parsed.rows.entries()) {
        const [existing] = await database.query<{ id: string; factor: number; lots: number }>('SELECT i.id, i.units_per_receive AS factor, (SELECT COUNT(*) FROM lab_lot l WHERE l.item_id = i.id) AS lots FROM lab_item i WHERE i.code = ? FOR UPDATE', [row.code]);
        if (existing && Number(existing.lots) > 0 && Number(existing.factor) !== row.unitsPerReceive) { errors.push({ row: index + 2, message: 'อัตราแปลงเปลี่ยนไม่ได้เพราะมีล็อตแล้ว' }); continue; }
        const id = existing?.id ?? this.createId();
        if (existing) await database.execute('UPDATE lab_item SET name = ?, receive_unit = ?, use_unit = ?, units_per_receive = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [row.name, row.receiveUnit, row.useUnit, row.unitsPerReceive, id]);
        else await database.execute('INSERT INTO lab_item (id, code, name, receive_unit, use_unit, units_per_receive, expiry_warn_days, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 90, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [id, row.code, row.name, row.receiveUnit, row.useUnit, row.unitsPerReceive]);
        await database.execute('INSERT INTO lab_item_reorder (item_id, store_id, reorder_point) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reorder_point = VALUES(reorder_point)', [id, main!.id, row.mainReorderPoint]);
      }
      if (errors.length) throw Object.assign(new LabRefusal('INVALID_CSV'), { errors });
      await labAudit(database, this.createId, actor, 'lab.opening.import_items', 'lab_item', 'all', { rows: parsed.rows.length });
      return { ok: true, count: parsed.rows.length };
    });
  }

  /** Replaces the draft ยอดยกมา with the file's rows. */
  async importOpening(subject: AccessSubject, csv: string): Promise<LabOpeningResult> {
    const stores = await this.database.query<{ id: string; code: string | null }>('SELECT s.id, c.code FROM lab_store s LEFT JOIN lab_section c ON c.id = s.section_id');
    const items = await this.database.query<{ id: string; code: string }>('SELECT id, code FROM lab_item');
    const storeByCode = new Map(stores.map((store) => [store.code ?? MAIN_STORE_CODE, store.id]));
    const itemByCode = new Map(items.map((item) => [item.code.toUpperCase(), item.id]));
    const parsed = parseOpeningCsv(csv, { storeIdByCode: (code) => storeByCode.get(code) ?? storeByCode.get(code.toUpperCase()) ?? null, itemIdByCode: (code) => itemByCode.get(code.toUpperCase()) ?? null });
    if (!parsed.ok) return { ok: false, code: 'INVALID_CSV', errors: parsed.errors };
    return this.run(subject, 'editOpening', true, async (database, actor) => {
      await database.execute('DELETE FROM lab_opening_line');
      for (const row of parsed.rows) await database.execute('INSERT INTO lab_opening_line (id, row_no, store_id, item_id, lot_no, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [this.createId(), row.row, row.storeId, row.itemId, row.lotNo, row.expiryDate, row.quantity, row.unitCost.toFixed(4)]);
      await labAudit(database, this.createId, actor, 'lab.opening.import', 'lab_opening', 'all', { rows: parsed.rows.length });
      return { ok: true, count: parsed.rows.length };
    });
  }

  saveLine(subject: AccessSubject, id: string | null, input: LabOpeningLineInput): Promise<LabOpeningResult> {
    const line = labOpeningLineInputSchema.parse(input);
    return this.run(subject, 'editOpening', true, async (database, actor) => {
      const lineId = id ?? this.createId();
      if (id) {
        if ((await database.query('SELECT id FROM lab_opening_line WHERE id = ?', [id])).length === 0) throw new LabRefusal('NOT_FOUND');
        await database.execute('UPDATE lab_opening_line SET store_id = ?, item_id = ?, lot_no = ?, expiry_date = ?, quantity = ?, unit_cost = ? WHERE id = ?', [line.storeId, line.itemId, line.lotNo, line.expiryDate, line.quantity, line.unitCost.toFixed(4), id]);
      } else {
        const [last] = await database.query<{ n: number | null }>('SELECT MAX(row_no) AS n FROM lab_opening_line');
        await database.execute('INSERT INTO lab_opening_line (id, row_no, store_id, item_id, lot_no, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [lineId, Number(last?.n ?? 1) + 1, line.storeId, line.itemId, line.lotNo, line.expiryDate, line.quantity, line.unitCost.toFixed(4)]);
      }
      await labAudit(database, this.createId, actor, 'lab.opening.line.save', 'lab_opening_line', lineId, { quantity: line.quantity });
      return { ok: true, id: lineId };
    });
  }

  deleteLine(subject: AccessSubject, id: string): Promise<LabOpeningResult> {
    return this.run(subject, 'editOpening', true, async (database, actor) => {
      if ((await database.query('SELECT id FROM lab_opening_line WHERE id = ?', [id])).length === 0) throw new LabRefusal('NOT_FOUND');
      await database.execute('DELETE FROM lab_opening_line WHERE id = ?', [id]);
      await labAudit(database, this.createId, actor, 'lab.opening.line.delete', 'lab_opening_line', id, {});
      return { ok: true };
    });
  }

  submit(subject: AccessSubject): Promise<LabOpeningResult> {
    return this.run(subject, 'editOpening', true, async (database, actor) => {
      await setSetting(database, 'opening_status', 'SUBMITTED');
      await setSetting(database, 'opening_submitted_by', actor);
      await database.execute("DELETE FROM lab_setting WHERE setting_key = 'opening_return_reason'");
      const [count] = await database.query<{ n: number }>('SELECT COUNT(*) AS n FROM lab_opening_line');
      await labAudit(database, this.createId, actor, 'lab.opening.submit', 'lab_opening', 'all', { lines: Number(count?.n ?? 0) });
      for (const head of await membersWithRole(database, 'HEAD')) await labBell(database, `lab-opening-submit:${this.createId()}`, head, 'ยอดยกมาวัสดุ Lab รอรับรอง', OPENING_PATH, this.createId);
      return { ok: true };
    });
  }

  /** หัวหน้า Lab: CERTIFY turns every line into a lot + balance + OPENING movement; RETURN sends the draft back with a reason. */
  decide(subject: AccessSubject, input: LabOpeningDecisionInput): Promise<LabOpeningResult> {
    const parsed = labOpeningDecisionInputSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, code: 'REASON_REQUIRED' });
    const decision = parsed.data;
    return this.run(subject, 'certifyOpening', false, async (database, actor) => {
      if ((await openingStatus(database, true)) !== 'SUBMITTED') throw new LabRefusal('WRONG_STATUS');
      const [submitter] = await database.query<{ v: string }>("SELECT setting_value AS v FROM lab_setting WHERE setting_key = 'opening_submitted_by'");
      // Only a ผู้จัดการ can both send and decide; that follows the self-decision rule (manager tier, reason, selfApproval).
      const selfApproval = submitter?.v === actor;
      if (selfApproval && !canDecideOwnRequest(subject.activeRole)) throw new LabRefusal('CONFLICT_OF_INTEREST');
      if (selfApproval && !decision.reason) throw new LabRefusal('REASON_REQUIRED');
      const flag = selfApproval ? { selfApproval: true } : {};
      const lines = await database.query<{ id: string; store_id: string; item_id: string; lot_no: string; expiry_date: string | Date | null; quantity: number; unit_cost: string }>('SELECT id, store_id, item_id, lot_no, DATE_FORMAT(expiry_date, \'%Y-%m-%d\') AS expiry_date, quantity, unit_cost FROM lab_opening_line ORDER BY row_no');
      if (decision.decision === 'RETURN') {
        await setSetting(database, 'opening_status', 'DRAFT');
        await setSetting(database, 'opening_return_reason', decision.reason);
        await labAudit(database, this.createId, actor, 'lab.opening.return', 'lab_opening', 'all', { lines: lines.length, ...flag });
      } else {
        const today = labToday();
        for (const line of lines) {
          const lotId = await findOrCreateLot(database, { itemId: line.item_id, lotNo: line.lot_no, expiryDate: line.expiry_date as string | null, unitCost: String(line.unit_cost), source: 'OPENING' }, this.createId);
          await move(database, { lotId, storeId: line.store_id, quantity: Number(line.quantity), kind: 'OPENING', entryDate: today, refType: 'OPENING', refId: line.id, actorPersonId: actor }, this.createId);
        }
        await setSetting(database, 'opening_status', 'CERTIFIED');
        await setSetting(database, 'opening_certified_at', new Date().toISOString());
        await labAudit(database, this.createId, actor, 'lab.opening.certify', 'lab_opening', 'all', { lines: lines.length, ...flag });
      }
      if (submitter?.v) await labBell(database, `lab-opening-${decision.decision.toLowerCase()}:${this.createId()}`, submitter.v, decision.decision === 'CERTIFY' ? 'ยอดยกมาวัสดุ Lab ได้รับการรับรองแล้ว' : 'ยอดยกมาวัสดุ Lab ถูกตีกลับ', OPENING_PATH, this.createId);
      return { ok: true };
    });
  }

  /** Permission check, then `work` in one transaction; `draftOnly` refuses unless the ยอดยกมา is still a draft. */
  private async run(subject: AccessSubject, action: LabAction, draftOnly: boolean, work: (database: Database, actor: string) => Promise<LabOpeningResult>): Promise<LabOpeningResult> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    if (!labCan(await loadLabMember(this.database, actor), canManageLab(subject), action)) return { ok: false, code: 'FORBIDDEN' };
    try {
      return await this.database.transaction(async (database) => {
        if (draftOnly && (await openingStatus(database, true)) !== 'DRAFT') throw new LabRefusal('WRONG_STATUS');
        return work(database, actor);
      });
    } catch (error) {
      if (error instanceof LabRefusal) return { ok: false, code: error.code as LabOpeningCode, ...('errors' in error ? { errors: (error as LabRefusal & { errors: CsvError[] }).errors } : {}) };
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      if (isDuplicateEntry(error)) return { ok: false, code: 'INVALID_CSV' };
      throw error;
    }
  }
}
