import { randomUUID } from 'node:crypto';
import { labItemInputSchema, labMemberInputSchema, labSectionInputSchema, labUsageTypeInputSchema, labVendorInputSchema, type AccessSubject, type LabItemInput, type LabMemberInput, type LabSectionInput, type LabUsageTypeInput, type LabVendorInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageLab, labCan, loadLabMember, type LabAction } from './lab-access';
import { isDuplicateEntry, isMissingReference, labAudit } from './lab-db';

export type LabSettingsCode = 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE' | 'ITEM_HAS_STOCK' | 'PROTECTED';
export type LabSettingsResult = { ok: true; id?: string } | { ok: false; code: LabSettingsCode };
type Row = Record<string, string | number>;

class Refusal extends Error { constructor(readonly code: LabSettingsCode) { super(code); } }

/** ตั้งค่า วัสดุคงคลัง Lab (วัสดุ, งาน, ผู้ขาย, ประเภทการใช้) and สมาชิก. Rows are switched off, never deleted. */
export class LabSettingsService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  saveItem(subject: AccessSubject, id: string | null, input: LabItemInput): Promise<LabSettingsResult> {
    const item = labItemInputSchema.parse(input);
    return this.save(subject, 'manageSettings', 'item', 'lab_item', id, { code: item.code, name: item.name, receive_unit: item.receiveUnit, use_unit: item.useUnit, units_per_receive: item.unitsPerReceive, expiry_warn_days: item.expiryWarnDays, is_active: item.isActive ? 1 : 0 }, async (database, itemId) => {
      if (id) {
        const [current] = await database.query<{ factor: number; lots: number }>('SELECT i.units_per_receive AS factor, (SELECT COUNT(*) FROM lab_lot l WHERE l.item_id = i.id) AS lots FROM lab_item i WHERE i.id = ? FOR UPDATE', [itemId]);
        if (current && Number(current.lots) > 0 && Number(current.factor) !== item.unitsPerReceive) throw new Refusal('ITEM_HAS_STOCK');
      }
    }, async (database, itemId) => {
      await database.execute('DELETE FROM lab_item_reorder WHERE item_id = ?', [itemId]);
      for (const point of new Map(item.reorderPoints.map((p) => [p.storeId, p])).values()) await database.execute('INSERT INTO lab_item_reorder (item_id, store_id, reorder_point) VALUES (?, ?, ?)', [itemId, point.storeId, point.reorderPoint]);
    });
  }

  /** A งาน; a new one gets its คลังย่อย in the same transaction. */
  saveSection(subject: AccessSubject, id: string | null, input: LabSectionInput): Promise<LabSettingsResult> {
    const section = labSectionInputSchema.parse(input);
    return this.save(subject, 'manageSettings', 'section', 'lab_section', id, { code: section.code, name: section.name, sort_order: section.sortOrder, is_active: section.isActive ? 1 : 0 }, undefined, async (database, sectionId) => {
      if (!id) await database.execute("INSERT INTO lab_store (id, kind, section_id, created_at) VALUES (?, 'SECTION', ?, UTC_TIMESTAMP())", [this.createId(), sectionId]);
    });
  }

  saveVendor(subject: AccessSubject, id: string | null, input: LabVendorInput): Promise<LabSettingsResult> {
    const vendor = labVendorInputSchema.parse(input);
    return this.save(subject, 'manageSettings', 'vendor', 'lab_vendor', id, { name: vendor.name, phone: vendor.phone, is_active: vendor.isActive ? 1 : 0 });
  }

  saveUsageType(subject: AccessSubject, id: string | null, input: LabUsageTypeInput): Promise<LabSettingsResult> {
    const type = labUsageTypeInputSchema.parse(input);
    return this.save(subject, 'manageSettings', 'usage_type', 'lab_usage_type', id, { name: type.name, sort_order: type.sortOrder, is_active: type.isActive ? 1 : 0 }, async (database, typeId) => {
      if (type.isActive) return;
      const [others] = await database.query<{ total: number }>('SELECT COUNT(*) AS total FROM lab_usage_type WHERE is_active = 1 AND id <> ? FOR UPDATE', [typeId]);
      if (Number(others?.total ?? 0) === 0) throw new Refusal('PROTECTED');
    });
  }

  /** Adds or changes one member; a เจ้าหน้าที่ Lab's งาน are replaced. Only a `lab.manage` holder. */
  async saveMember(subject: AccessSubject, input: LabMemberInput): Promise<{ ok: true } | { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' }> {
    const member = labMemberInputSchema.parse(input);
    if (!subject.personId || !canManageLab(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    try {
      return await this.database.transaction(async (database) => {
        await database.execute('INSERT INTO lab_member (person_id, role, created_at, created_by) VALUES (?, ?, UTC_TIMESTAMP(), ?) ON DUPLICATE KEY UPDATE role = VALUES(role)', [member.personId, member.role, actor]);
        await database.execute('DELETE FROM lab_member_section WHERE person_id = ?', [member.personId]);
        for (const sectionId of new Set(member.sectionIds)) await database.execute('INSERT INTO lab_member_section (person_id, section_id) VALUES (?, ?)', [member.personId, sectionId]);
        await labAudit(database, this.createId, actor, 'lab.member.save', 'person', member.personId, { role: member.role, sections: member.sectionIds.length });
        return { ok: true as const };
      });
    } catch (error) {
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }

  async removeMember(subject: AccessSubject, personId: string): Promise<{ ok: true } | { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' }> {
    if (!subject.personId || !canManageLab(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      if ((await database.query('SELECT person_id FROM lab_member WHERE person_id = ? FOR UPDATE', [personId])).length === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM lab_member_section WHERE person_id = ?', [personId]);
      await database.execute('DELETE FROM lab_member WHERE person_id = ?', [personId]);
      await labAudit(database, this.createId, actor, 'lab.member.remove', 'person', personId, {});
      return { ok: true as const };
    });
  }

  private async save(subject: AccessSubject, action: LabAction, kind: string, table: string, id: string | null, row: Row, before?: (database: Database, id: string) => Promise<void>, after?: (database: Database, id: string) => Promise<void>): Promise<LabSettingsResult> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    if (!labCan(await loadLabMember(this.database, actor), canManageLab(subject), action)) return { ok: false, code: 'FORBIDDEN' };
    const columns = Object.keys(row);
    try {
      return await this.database.transaction(async (database) => {
        const rowId = id ?? this.createId();
        if (id && (await database.query(`SELECT id FROM ${table} WHERE id = ? FOR UPDATE`, [id])).length === 0) throw new Refusal('NOT_FOUND');
        await before?.(database, rowId);
        if (id) {
          await database.execute(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [...Object.values(row), id]);
        } else {
          await database.execute(`INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`, [rowId, ...Object.values(row)]);
        }
        await after?.(database, rowId);
        await labAudit(database, this.createId, actor, `lab.settings.${kind}.save`, table, rowId, { created: !id });
        return { ok: true as const, id: rowId };
      });
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, code: error.code };
      if (isDuplicateEntry(error)) return { ok: false, code: 'DUPLICATE' };
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }
}
