import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { HrProfileService } from './profile-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const dailyEmployee = '00000000-0000-4000-8000-000000000006';
const privateKeys = ['namePrefix', 'firstName', 'lastName', 'gender', 'birthDate', 'phone', 'address', 'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'];

describeWithDatabase('HrProfileService reads against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new HrProfileService(database);
  const viewer = (roles: AccessSubject['roles'], personId = randomUUID(), dataOwnerModules: string[] = []): AccessSubject => ({ authenticated: true, personId, roles, dataOwnerModules, hospitalWideDataOwnerModules: dataOwnerModules });

  async function organization() {
    const id = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [id, `งาน ${id.slice(0, 6)}`]);
    return id;
  }
  async function person(organizationId: string | null, profile = true) {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, employee_code, display_name, position_title, created_at) VALUES (?, 'c', ?, ?, 'นางสาวสมใจ ดีมาก', 'พยาบาลวิชาชีพ', UTC_TIMESTAMP())", [id, randomUUID(), id.slice(0, 12)]);
    if (organizationId) await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, effective_from, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [randomUUID(), id, organizationId]);
    if (profile) await database.execute("INSERT INTO hr_person_profile (person_id, name_prefix, first_name, last_name, gender, birth_date, phone, address, employment_type_id, appointed_on, position_level, updated_at) VALUES (?, 'นางสาว', 'สมใจ', 'ดีมาก', 'FEMALE', '1990-05-17', '0812345678', 'วาริชภูมิ', ?, '2015-04-01', 'ชำนาญการ', UTC_TIMESTAMP())", [id, dailyEmployee]);
    return id;
  }

  beforeAll(async () => { await runMigrations(database); });
  afterAll(async () => { await database.close(); });

  it('gives a reader the work details and no private field at all', async () => {
    const unit = await organization();
    const id = await person(unit);
    const view = await service.get(id, viewer([{ name: 'hr-reader', organizationId: unit }]));
    if (typeof view === 'string') throw new Error(view);
    expect(view.private).toBeNull();
    expect(view.work).toMatchObject({ personId: id, displayName: 'นางสาวสมใจ ดีมาก', positionTitle: 'พยาบาลวิชาชีพ', positionLevel: 'ชำนาญการ', employmentTypeName: 'ลูกจ้างรายวัน', appointedOn: '2015-04-01', organizationId: unit });
    for (const key of privateKeys) expect(JSON.stringify(view)).not.toContain(`"${key}"`);
    expect(JSON.stringify(view)).not.toContain('0812345678');
  });

  it('gives the person their own private details', async () => {
    const id = await person(await organization());
    const view = await service.get(id, viewer([], id));
    if (typeof view === 'string') throw new Error(view);
    expect(view.private).toMatchObject({ namePrefix: 'นางสาว', gender: 'FEMALE', birthDate: '1990-05-17', phone: '0812345678', address: 'วาริชภูมิ', emergencyContactName: null });
    expect(view.access).toEqual({ viewWork: true, viewPrivate: true, editProfile: false, editContact: true });
  });

  it('refuses a reader of another unit and reports an unknown person', async () => {
    const id = await person(await organization());
    expect(await service.get(id, viewer([{ name: 'hr-reader', organizationId: await organization() }]))).toBe('FORBIDDEN');
    expect(await service.get(randomUUID(), viewer([{ name: 'hr-reader', organizationId: null }]))).toBe('NOT_FOUND');
  });

  it('returns empty details for a person who has no profile row yet', async () => {
    const id = await person(null, false);
    const view = await service.get(id, viewer([{ name: 'hr-manager', organizationId: null }], randomUUID(), ['hr']));
    if (typeof view === 'string') throw new Error(view);
    expect(view.work).toMatchObject({ employmentTypeId: null, employmentTypeName: null, appointedOn: null, positionLevel: null, organizationId: null });
    expect(view.private).toMatchObject({ namePrefix: null, birthDate: null, phone: null });
  });

  it('lists profile changes newest first, with work values and without private ones', async () => {
    const id = await person(await organization());
    await database.execute("INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, NULL, 'hr.person.profile.update', 'person', ?, 'SUCCESS', ?, '2026-10-01 03:00:00')", [randomUUID(), id, JSON.stringify({ changedFields: ['positionLevel'], workChanges: { positionLevel: { from: null, to: 'ชำนาญการ' } } })]);
    await database.execute("INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, NULL, 'hr.person.contact.update', 'person', ?, 'SUCCESS', ?, '2026-10-02 03:00:00')", [randomUUID(), id, JSON.stringify({ changedFields: ['phone'] })]);
    const view = await service.get(id, viewer([], id));
    if (typeof view === 'string') throw new Error(view);
    expect(view.history).toEqual([
      { at: '2026-10-02T03:00:00Z', actorDisplayName: null, action: 'hr.person.contact.update', changedFields: ['phone'], workChanges: {} },
      { at: '2026-10-01T03:00:00Z', actorDisplayName: null, action: 'hr.person.profile.update', changedFields: ['positionLevel'], workChanges: { positionLevel: { from: null, to: 'ชำนาญการ' } } }
    ]);
  });

  it('reports employment type code and appointment date for other modules', async () => {
    const id = await person(null);
    expect(await service.getEmployment(id)).toEqual({ employmentTypeCode: 'DAILY_EMPLOYEE', appointedOn: '2015-04-01' });
    expect(await service.getEmployment(await person(null, false))).toEqual({ employmentTypeCode: null, appointedOn: null });
    expect(await service.getEmployment(randomUUID())).toBeNull();
  });
});
