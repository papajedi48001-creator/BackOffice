import { randomUUID } from 'node:crypto';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

/** Seeded ids from migration 0034. */
export const LAB_SEED = {
  sections: { chem: '00000000-0000-4000-b000-000000000001', hema: '00000000-0000-4000-b000-000000000002' },
  stores: { main: '00000000-0000-4000-b000-000000000010', chem: '00000000-0000-4000-b000-000000000011', hema: '00000000-0000-4000-b000-000000000012' },
  usageTypes: { patient: '00000000-0000-4000-b000-000000000021', qc: '00000000-0000-4000-b000-000000000022' }
} as const;

export async function insertLabPerson(database: Pick<Database, 'execute'>): Promise<string> {
  const personId = randomUUID();
  await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [personId, randomUUID(), `บุคลากร Lab ${personId.slice(0, 8)}`]);
  return personId;
}

/** A signed-in subject; `lab-manager` gives `lab.manage`, `employee` gives nothing beyond membership. */
export function labSubject(personId: string, systemRole: 'lab-manager' | 'admin' | null = null, activeRole: string = systemRole === 'admin' ? 'admin' : systemRole ? 'manager' : 'employee'): AccessSubject {
  return { authenticated: true, personId, roles: systemRole ? [{ name: systemRole, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole };
}

export async function addLabMember(database: Pick<Database, 'execute'>, personId: string, role: 'HEAD' | 'KEEPER' | 'STAFF', sectionIds: string[] = []): Promise<void> {
  await database.execute('INSERT INTO lab_member (person_id, role, created_at, created_by) VALUES (?, ?, UTC_TIMESTAMP(), ?)', [personId, role, personId]);
  for (const sectionId of sectionIds) await database.execute('INSERT INTO lab_member_section (person_id, section_id) VALUES (?, ?)', [personId, sectionId]);
}

/** Integration files share one database: put the opening back to a certified, empty start for stock tests. */
export async function setOpeningStatus(database: Pick<Database, 'execute'>, status: 'DRAFT' | 'SUBMITTED' | 'CERTIFIED'): Promise<void> {
  await database.execute("INSERT INTO lab_setting (setting_key, setting_value, updated_at) VALUES ('opening_status', ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)", [status]);
}

/** A fresh item with a unique code. */
export async function insertLabItem(database: Pick<Database, 'execute'>, unitsPerReceive = 10): Promise<{ id: string; code: string }> {
  const id = randomUUID();
  const code = `T-${id.slice(0, 8)}`;
  await database.execute("INSERT INTO lab_item (id, code, name, receive_unit, use_unit, units_per_receive, expiry_warn_days, is_active, created_at, updated_at) VALUES (?, ?, ?, 'กล่อง', 'ขวด', ?, 90, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, code, `วัสดุ ${code}`, unitsPerReceive]);
  return { id, code };
}
