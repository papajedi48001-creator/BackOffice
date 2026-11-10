import { randomUUID } from 'node:crypto';
import { labReasonInputSchema, labUsageInputSchema, type AccessSubject, type LabPick, type LabReasonInput, type LabUsageInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageLab, labCan, loadLabMember } from './lab-access';
import { labAudit } from './lab-db';
import { checkPicks, pickFefo } from './lab-rules';
import { LabRefusal, labToday, labTransaction, lockBalances, move, requireCertified } from './lab-stock-writer';

export type LabUsageCode = 'FORBIDDEN' | 'OPENING_NOT_CERTIFIED' | 'NOT_FOUND' | 'MAIN_STORE' | 'FUTURE_DATE' | 'LOT_EXPIRED' | 'INSUFFICIENT_STOCK' | 'WRONG_STATUS';

/** การตัดใช้ at a คลังย่อย, and its reversal (a USE_REVERSAL per lot; the USE rows stay). */
export class LabUsageService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async record(subject: AccessSubject, input: LabUsageInput): Promise<{ ok: true; usageId: string; picks: LabPick[] } | { ok: false; code: LabUsageCode }> {
    const usage = labUsageInputSchema.parse(input);
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    const [store] = await this.database.query<{ kind: string; section_id: string | null }>('SELECT kind, section_id FROM lab_store WHERE id = ?', [usage.storeId]);
    if (!store) return { ok: false, code: 'NOT_FOUND' };
    if (!labCan(await loadLabMember(this.database, actor), canManageLab(subject), 'use', store.section_id)) return { ok: false, code: 'FORBIDDEN' };
    if (store.kind === 'MAIN') return { ok: false, code: 'MAIN_STORE' };
    if (usage.entryDate > labToday()) return { ok: false, code: 'FUTURE_DATE' };
    return labTransaction(this.database, async (database) => {
      await requireCertified(database);
      const lots = await lockBalances(database, usage.storeId, usage.itemId);
      let picks: LabPick[];
      if (usage.picks) {
        if (usage.picks.reduce((sum, pick) => sum + pick.quantity, 0) !== usage.quantity) throw new LabRefusal('INSUFFICIENT_STOCK');
        const check = checkPicks(lots, usage.picks, usage.entryDate);
        if (!check.ok) throw new LabRefusal(check.code);
        picks = usage.picks;
      } else {
        const chosen = pickFefo(lots, usage.quantity, usage.entryDate);
        if (!chosen.ok) throw new LabRefusal(chosen.code);
        picks = chosen.picks;
      }
      const usageId = this.createId();
      await database.execute("INSERT INTO lab_usage (id, store_id, item_id, quantity, usage_type_id, entry_date, note, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, UTC_TIMESTAMP())", [usageId, usage.storeId, usage.itemId, usage.quantity, usage.usageTypeId, usage.entryDate, usage.note, actor]);
      for (const pick of picks) await move(database, { lotId: pick.lotId, storeId: usage.storeId, quantity: -pick.quantity, kind: 'USE', entryDate: usage.entryDate, usageTypeId: usage.usageTypeId, refType: 'USAGE', refId: usageId, note: usage.note, actorPersonId: actor }, this.createId);
      await labAudit(database, this.createId, actor, 'lab.usage.record', 'lab_usage', usageId, { itemId: usage.itemId, quantity: usage.quantity, usageTypeId: usage.usageTypeId });
      return { ok: true as const, usageId, picks };
    });
  }

  /** ยกเลิกการตัดใช้: by whoever recorded it or a ผู้ดูแลคลัง Lab. */
  async reverse(subject: AccessSubject, usageId: string, input: LabReasonInput): Promise<{ ok: true } | { ok: false; code: LabUsageCode }> {
    const { reason } = labReasonInputSchema.parse(input);
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    const member = await loadLabMember(this.database, actor);
    return labTransaction(this.database, async (database) => {
      const [usage] = await database.query<{ status: string; created_by: string; store_id: string; section_id: string | null; item_id: string; quantity: number; usage_type_id: string; entry_date: string }>(
        "SELECT u.status, u.created_by, u.store_id, s.section_id, u.item_id, u.quantity, u.usage_type_id, DATE_FORMAT(u.entry_date, '%Y-%m-%d') AS entry_date FROM lab_usage u JOIN lab_store s ON s.id = u.store_id WHERE u.id = ? FOR UPDATE", [usageId]);
      if (!usage) throw new LabRefusal('NOT_FOUND');
      const manages = canManageLab(subject);
      const own = usage.created_by === actor && labCan(member, manages, 'use', usage.section_id);
      if (!own && !labCan(member, manages, 'reverseAnyUse')) throw new LabRefusal('FORBIDDEN');
      if (usage.status !== 'POSTED') throw new LabRefusal('WRONG_STATUS');
      const movements = await database.query<{ lot_id: string; quantity: number }>("SELECT lot_id, quantity FROM lab_movement WHERE ref_type = 'USAGE' AND ref_id = ? AND kind = 'USE'", [usageId]);
      for (const row of movements) await move(database, { lotId: row.lot_id, storeId: usage.store_id, quantity: -Number(row.quantity), kind: 'USE_REVERSAL', entryDate: usage.entry_date, usageTypeId: usage.usage_type_id, refType: 'USAGE', refId: usageId, actorPersonId: actor }, this.createId);
      await database.execute("UPDATE lab_usage SET status = 'REVERSED', reverse_reason = ?, reversed_by = ?, reversed_at = UTC_TIMESTAMP() WHERE id = ?", [reason, actor, usageId]);
      await labAudit(database, this.createId, actor, 'lab.usage.reverse', 'lab_usage', usageId, { itemId: usage.item_id, quantity: Number(usage.quantity) });
      return { ok: true as const };
    });
  }
}
