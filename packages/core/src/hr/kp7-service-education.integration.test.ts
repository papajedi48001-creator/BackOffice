import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { HrProfileService } from './profile-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
// Invented values only.
const civil = { positionNumber: '900001', salary: 25000.5, parentAgency: 'โรงพยาบาลทดสอบ', gpfStatus: 'MEMBER' as const, firstAppointedOn: '2020-08-24', reappointedOn: null, transferredInOn: null, transferredOutOn: null, joinedUnitOn: '2020-08-24', currentLevelSince: '2021-01-01', qualification: 'ปริญญาตรี', qualificationMajor: 'คอมพิวเตอร์', specialAllowance: null };

describeWithDatabase('ก.พ.7 civil service and education against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new HrProfileService(database);
  const ids = { manager: randomUUID(), reader: randomUUID() };
  const manager: AccessSubject = { authenticated: true, personId: ids.manager, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const reader: AccessSubject = { authenticated: true, personId: ids.reader, roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] };
  const self = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [], dataOwnerModules: [] });
  async function person() {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, 'c', ?, UTC_TIMESTAMP())", [id, randomUUID()]);
    await database.execute("INSERT INTO hr_person_profile (person_id, birth_date, updated_at) VALUES (?, '1986-03-10', UTC_TIMESTAMP())", [id]);
    return id;
  }
  const view = async (id: string, viewer: AccessSubject) => { const found = await service.get(id, viewer); if (typeof found === 'string') throw new Error(found); return found; };
  const audit = async (id: string, action: string) => (await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ? AND action = ?', [id, action])).map((row) => row.metadata);

  beforeAll(async () => {
    await runMigrations(database);
    for (const id of Object.values(ids)) await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, 'c', ?, UTC_TIMESTAMP())", [id, randomUUID()]);
  });
  afterAll(async () => database.close());

  it('lets HR record ข้อมูลการปฏิบัติราชการ, shows it with the retirement date to the person, and keeps the salary out of the audit', async () => {
    const id = await person();
    await expect(service.updateCivilService(id, civil, manager)).resolves.toEqual({ ok: true });
    const seen = (await view(id, self(id))).private!;
    expect(seen.civilService).toEqual({ ...civil, retirementDate: '2046-10-01' });
    const [metadata] = await audit(id, 'hr.person.civil.update');
    expect(JSON.parse(metadata!)).toEqual({ changedFields: ['positionNumber', 'salary', 'parentAgency', 'gpfStatus', 'firstAppointedOn', 'joinedUnitOn', 'currentLevelSince', 'qualification', 'qualificationMajor'] });
    expect(metadata).not.toContain('25000');
    await expect(service.updateCivilService(id, civil, manager)).resolves.toEqual({ ok: true });
    expect(await audit(id, 'hr.person.civil.update')).toHaveLength(1);
  });

  it('refuses the person themself and a reader for civil-service fields', async () => {
    const id = await person();
    await expect(service.updateCivilService(id, { salary: 99999 }, self(id))).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.updateCivilService(id, { salary: 99999 }, reader)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    expect((await view(id, reader)).private).toBeNull();
  });

  it('lets the person and HR replace the education list in order, and refuses a reader', async () => {
    const id = await person();
    const entries = [{ graduatedOn: '2009-03-07', degree: 'วิทยาศาสตรบัณฑิต', major: 'วิทยาการคอมพิวเตอร์', institution: 'มหาวิทยาลัยทดสอบ', country: 'ไทย' }, { graduatedOn: null, degree: 'มัธยมศึกษาตอนปลาย', major: null, institution: null, country: null }];
    await expect(service.updateEducation(id, { entries }, self(id))).resolves.toEqual({ ok: true });
    expect((await view(id, self(id))).private!.education).toEqual(entries);
    await expect(service.updateEducation(id, { entries: [entries[1]!] }, manager)).resolves.toEqual({ ok: true });
    expect((await view(id, manager)).private!.education).toEqual([entries[1]]);
    await expect(service.updateEducation(id, { entries: [] }, reader)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    const logged = await audit(id, 'hr.person.education.update');
    expect(logged).toHaveLength(2);
    expect(JSON.parse(logged[0]!)).toEqual({ changedFields: ['education'] });
  });
});
