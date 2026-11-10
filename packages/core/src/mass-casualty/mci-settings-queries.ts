import type { Database } from '@backoffice/db';

export interface MciZone { id: string; name: string; sortOrder: number; isActive: boolean }
export interface MciTriageLevel { id: string; name: string; description: string; colorHex: string; sortOrder: number; isDeceased: boolean; isActive: boolean }
export interface MciStatus { id: string; name: string; sortOrder: number; isDeceased: boolean; needsDestination: boolean; isDischarged: boolean; isActive: boolean }
export interface MciProfession { id: string; name: string; sortOrder: number; isActive: boolean; positionIds: string[] }
export interface MciRule { professionId: string; zoneId: string | null }
export interface MciSettings {
  zones: MciZone[]; triageLevels: MciTriageLevel[]; statuses: MciStatus[]; professions: MciProfession[]; rules: MciRule[];
  publicContactPhone: string;
  deceasedTriageId: string; deceasedStatusId: string;
  /** The first active status that is not death: every new casualty starts here. */
  intakeStatusId: string;
}

const flag = (value: unknown) => Number(value) === 1;

/** Everything in ตั้งค่า อุบัติเหตุหมู่, in display order. Switched-off rows are included (callers filter `isActive`). */
export class MciSettingsQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async settings(): Promise<MciSettings> {
    const [zones, levels, statuses, professions, mappings, rules, contact] = await Promise.all([
      this.database.query<{ id: string; name: string; sortOrder: number; isActive: number }>('SELECT id, name, sort_order AS sortOrder, is_active AS isActive FROM mci_zone ORDER BY sort_order, name'),
      this.database.query<{ id: string; name: string; description: string; colorHex: string; sortOrder: number; isDeceased: number; isActive: number }>('SELECT id, name, description, color_hex AS colorHex, sort_order AS sortOrder, is_deceased AS isDeceased, is_active AS isActive FROM mci_triage_level ORDER BY sort_order, name'),
      this.database.query<{ id: string; name: string; sortOrder: number; isDeceased: number; needsDestination: number; isDischarged: number; isActive: number }>('SELECT id, name, sort_order AS sortOrder, is_deceased AS isDeceased, needs_destination AS needsDestination, is_discharged AS isDischarged, is_active AS isActive FROM mci_patient_status ORDER BY sort_order, name'),
      this.database.query<{ id: string; name: string; sortOrder: number; isActive: number }>('SELECT id, name, sort_order AS sortOrder, is_active AS isActive FROM mci_profession ORDER BY sort_order, name'),
      this.database.query<{ professionId: string; positionId: string }>('SELECT profession_id AS professionId, position_id AS positionId FROM mci_profession_position ORDER BY position_id'),
      this.database.query<{ professionId: string; zoneId: string | null }>('SELECT profession_id AS professionId, zone_id AS zoneId FROM mci_assignment_rule ORDER BY profession_id'),
      this.database.query<{ value: string }>("SELECT setting_value AS value FROM mci_setting WHERE setting_key = 'public_contact_phone'")
    ]);
    const statusRows = statuses.map((row) => ({ ...row, sortOrder: Number(row.sortOrder), isDeceased: flag(row.isDeceased), needsDestination: flag(row.needsDestination), isDischarged: flag(row.isDischarged), isActive: flag(row.isActive) }));
    const levelRows = levels.map((row) => ({ ...row, sortOrder: Number(row.sortOrder), isDeceased: flag(row.isDeceased), isActive: flag(row.isActive) }));
    return {
      zones: zones.map((row) => ({ ...row, sortOrder: Number(row.sortOrder), isActive: flag(row.isActive) })),
      triageLevels: levelRows,
      statuses: statusRows,
      professions: professions.map((row) => ({ ...row, sortOrder: Number(row.sortOrder), isActive: flag(row.isActive), positionIds: mappings.filter((mapping) => mapping.professionId === row.id).map((mapping) => mapping.positionId) })),
      rules: rules.map((row) => ({ professionId: row.professionId, zoneId: row.zoneId ?? null })),
      publicContactPhone: contact[0]?.value ?? '',
      deceasedTriageId: levelRows.find((row) => row.isDeceased)?.id ?? '',
      deceasedStatusId: statusRows.find((row) => row.isDeceased)?.id ?? '',
      intakeStatusId: statusRows.find((row) => row.isActive && !row.isDeceased)?.id ?? ''
    };
  }
}
