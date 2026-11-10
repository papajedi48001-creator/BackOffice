import { randomUUID } from 'node:crypto';
import { mciContactInputSchema, mciProfessionInputSchema, mciRulesInputSchema, mciStatusInputSchema, mciTriageLevelInputSchema, mciZoneInputSchema, type MciContactInput, type MciProfessionInput, type MciRulesInput, type MciStatusInput, type MciTriageLevelInput, type MciZoneInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { isDuplicateEntry, isMissingReference, mciAudit } from './mci-db';

export type MciSettingsResult = { ok: true; id: string } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' | 'PROTECTED' };
type Table = 'mci_zone' | 'mci_triage_level' | 'mci_patient_status' | 'mci_profession';

/** ตั้งค่า อุบัติเหตุหมู่. Rows are switched off, never deleted. Callers check `canCommandMci` first. */
export class MciSettingsService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  saveZone(actor: string, id: string | null, input: MciZoneInput): Promise<MciSettingsResult> {
    const zone = mciZoneInputSchema.parse(input);
    return this.save(actor, 'zone', 'mci_zone', id, { name: zone.name, sort_order: zone.sortOrder, is_active: zone.isActive ? 1 : 0 });
  }

  saveTriageLevel(actor: string, id: string | null, input: MciTriageLevelInput): Promise<MciSettingsResult> {
    const level = mciTriageLevelInputSchema.parse(input);
    return this.save(actor, 'triage', 'mci_triage_level', id, { name: level.name, description: level.description, color_hex: level.colorHex.toUpperCase(), sort_order: level.sortOrder, is_active: level.isActive ? 1 : 0 });
  }

  saveStatus(actor: string, id: string | null, input: MciStatusInput): Promise<MciSettingsResult> {
    const status = mciStatusInputSchema.parse(input);
    return this.save(actor, 'status', 'mci_patient_status', id, { name: status.name, sort_order: status.sortOrder, is_active: status.isActive ? 1 : 0 });
  }

  /** A สายวิชาชีพ and its HR positions. A position belongs to one สายวิชาชีพ, so it moves to the one saved last. */
  saveProfession(actor: string, id: string | null, input: MciProfessionInput): Promise<MciSettingsResult> {
    const profession = mciProfessionInputSchema.parse(input);
    const positionIds = [...new Set(profession.positionIds)];
    return this.save(actor, 'profession', 'mci_profession', id, { name: profession.name, sort_order: profession.sortOrder, is_active: profession.isActive ? 1 : 0 }, async (database, professionId) => {
      await database.execute('DELETE FROM mci_profession_position WHERE profession_id = ?', [professionId]);
      if (positionIds.length === 0) return;
      await database.execute(`DELETE FROM mci_profession_position WHERE position_id IN (${positionIds.map(() => '?').join(', ')})`, positionIds);
      for (const positionId of positionIds) await database.execute('INSERT INTO mci_profession_position (profession_id, position_id) VALUES (?, ?)', [professionId, positionId]);
    }, { positions: positionIds.length });
  }

  /** Replaces every กฎจัดคน. */
  async saveRules(actor: string, input: MciRulesInput): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    const { rules } = mciRulesInputSchema.parse(input);
    const unique = [...new Map(rules.map((rule) => [rule.professionId, rule])).values()];
    try {
      return await this.database.transaction(async (database) => {
        await database.execute('DELETE FROM mci_assignment_rule');
        for (const rule of unique) await database.execute('INSERT INTO mci_assignment_rule (profession_id, zone_id, updated_at) VALUES (?, ?, UTC_TIMESTAMP())', [rule.professionId, rule.zoneId]);
        await mciAudit(database, this.createId, actor, 'mci.settings.rules.save', 'mci_assignment_rule', 'all', { rules: unique.length });
        return { ok: true as const };
      });
    } catch (error) {
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }

  async saveContact(actor: string, input: MciContactInput): Promise<{ ok: true }> {
    const contact = mciContactInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      await database.execute("INSERT INTO mci_setting (setting_key, setting_value, updated_at) VALUES ('public_contact_phone', ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)", [contact.publicContactPhone]);
      await mciAudit(database, this.createId, actor, 'mci.settings.contact.save', 'mci_setting', 'public_contact_phone', {});
      return { ok: true as const };
    });
  }

  private async save(actor: string, kind: string, table: Table, id: string | null, values: Record<string, string | number>, after?: (database: Database, id: string) => Promise<void>, extra: Record<string, unknown> = {}): Promise<MciSettingsResult> {
    const columns = Object.keys(values);
    try {
      return await this.database.transaction(async (database) => {
        let rowId = id;
        if (rowId) {
          const [existing] = await database.query<{ id: string; isDeceased?: number }>(`SELECT id${table === 'mci_triage_level' || table === 'mci_patient_status' ? ', is_deceased AS isDeceased' : ''} FROM ${table} WHERE id = ? FOR UPDATE`, [rowId]);
          if (!existing) return { ok: false as const, code: 'NOT_FOUND' as const };
          if (Number(existing.isDeceased) === 1 && values.is_active === 0) return { ok: false as const, code: 'PROTECTED' as const };
          await database.execute(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [...Object.values(values), rowId]);
        } else {
          rowId = this.createId();
          await database.execute(`INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`, [rowId, ...Object.values(values)]);
        }
        await after?.(database, rowId);
        await mciAudit(database, this.createId, actor, `mci.settings.${kind}.save`, table, rowId, { isActive: values.is_active === 1, ...extra });
        return { ok: true as const, id: rowId };
      });
    } catch (error) {
      if (isDuplicateEntry(error)) return { ok: false, code: 'DUPLICATE_NAME' };
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }
}
