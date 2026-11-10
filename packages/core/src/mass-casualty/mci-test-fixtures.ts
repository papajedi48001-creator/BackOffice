import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';

/** Seeded ids from migration 0032. */
export const MCI_SEED = {
  zones: { triage: '00000000-0000-4000-a000-000000000001', er: '00000000-0000-4000-a000-000000000002', opd: '00000000-0000-4000-a000-000000000003', ipd: '00000000-0000-4000-a000-000000000004' },
  triage: { red: '00000000-0000-4000-a000-000000000101', yellow: '00000000-0000-4000-a000-000000000102', green: '00000000-0000-4000-a000-000000000103', black: '00000000-0000-4000-a000-000000000104', white: '00000000-0000-4000-a000-000000000105' },
  status: { intake: '00000000-0000-4000-a000-000000000201', treating: '00000000-0000-4000-a000-000000000202', admitted: '00000000-0000-4000-a000-000000000203', referred: '00000000-0000-4000-a000-000000000204', home: '00000000-0000-4000-a000-000000000205', dead: '00000000-0000-4000-a000-000000000206' },
  professions: { doctor: '00000000-0000-4000-a000-000000000301', nurse: '00000000-0000-4000-a000-000000000302', porter: '00000000-0000-4000-a000-000000000303' }
} as const;

/** Integration tests share one database: every open เหตุ left by an earlier run is closed so `open` can start fresh. */
export async function closeOpenIncidents(database: Pick<Database, 'execute'>): Promise<void> {
  await database.execute("UPDATE mci_responder r JOIN mci_incident i ON i.id = r.incident_id SET r.checked_out_at = UTC_TIMESTAMP() WHERE i.status = 'OPEN' AND r.checked_out_at IS NULL");
  await database.execute("UPDATE mci_incident SET status = 'CLOSED', closed_at = UTC_TIMESTAMP() WHERE status = 'OPEN'");
}

/** A บุคลากร with a local account (so they receive notices) and optionally an HR position. */
export async function insertMciPerson(database: Pick<Database, 'execute'>, options: { positionId?: string | null; active?: boolean } = {}): Promise<string> {
  const personId = randomUUID();
  await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID(), `บุคลากร ${personId.slice(0, 8)}`, options.active === false ? 'INACTIVE' : 'ACTIVE']);
  await database.execute('INSERT INTO hr_person_profile (person_id, position_id, updated_at) VALUES (?, ?, UTC_TIMESTAMP())', [personId, options.positionId ?? null]);
  return personId;
}

export async function insertPosition(database: Pick<Database, 'execute'>): Promise<string> {
  const id = randomUUID();
  await database.execute("INSERT INTO hr_position (id, name, category, allowed_levels, is_active, sort_order, created_at, updated_at) VALUES (?, ?, 'GENERAL', '[]', 1, 999, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, `ตำแหน่งทดสอบ ${id.slice(0, 8)}`]);
  return id;
}
