import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('mass casualty schema (migration 0032)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const incidentId = randomUUID();
  const personId = randomUUID();

  beforeAll(async () => {
    await runMigrations(db);
    await db.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID(), 'ทดสอบ']);
    await db.execute("INSERT INTO mci_incident (id, title, kind, status, location, occurred_at, opened_by, opened_at, patient_seq) VALUES (?, 'ทดสอบ', 'DRILL', 'CLOSED', '', UTC_TIMESTAMP(), ?, UTC_TIMESTAMP(), 0)", [incidentId, personId]);
  });

  afterAll(async () => {
    await db.execute('DELETE FROM mci_responder WHERE incident_id = ?', [incidentId]);
    await db.execute('DELETE FROM mci_incident WHERE id = ?', [incidentId]);
    await db.execute('DELETE FROM person WHERE id = ?', [personId]);
    await db.close();
  });

  it('seeds five triage colours, six statuses, four zones and seven professions with one deceased colour and status', async () => {
    const count = async (sql: string) => Number((await db.query<{ total: number }>(sql))[0]!.total);
    expect(await count("SELECT COUNT(*) AS total FROM mci_triage_level WHERE id LIKE '00000000-0000-4000-a000-%'")).toBe(5);
    expect(await count('SELECT COUNT(*) AS total FROM mci_triage_level WHERE is_deceased = 1')).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM mci_patient_status WHERE id LIKE '00000000-0000-4000-a000-%'")).toBe(6);
    expect(await count('SELECT COUNT(*) AS total FROM mci_patient_status WHERE is_deceased = 1')).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM mci_zone WHERE id LIKE '00000000-0000-4000-a000-%'")).toBe(4);
    expect(await count("SELECT COUNT(*) AS total FROM mci_profession WHERE id LIKE '00000000-0000-4000-a000-%'")).toBe(7);
    expect(await count('SELECT COUNT(*) AS total FROM mci_incident_lock WHERE id = 1')).toBe(1);
  });

  it('allows one open check-in per person and incident, and another after checking out', async () => {
    const insert = (checkedOut: boolean) => db.execute(`INSERT INTO mci_responder (id, incident_id, person_id, profession_id, zone_id, command_role, checked_in_at, checked_out_at) VALUES (?, ?, ?, NULL, NULL, 'STAFF', UTC_TIMESTAMP(), ${checkedOut ? 'UTC_TIMESTAMP()' : 'NULL'})`, [randomUUID(), incidentId, personId]);
    await insert(true);
    await insert(false);
    await expect(insert(false)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await insert(true);
  });

  it('refuses a repeated tag number within one incident', async () => {
    const insert = () => db.execute("INSERT INTO mci_patient (id, incident_id, tag_no, triage_level_id, status_id, zone_id, created_by, created_at, updated_by, updated_at) VALUES (?, ?, 1, '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000001', ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())", [randomUUID(), incidentId, personId, personId]);
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await db.execute('DELETE FROM mci_patient WHERE incident_id = ?', [incidentId]);
  });
});
