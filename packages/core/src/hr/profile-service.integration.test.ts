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

describeWithDatabase('HrProfileService writes against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new HrProfileService(database);
  const civilServant = '00000000-0000-4000-8000-000000000001';
  let actorId = '';
  let manager: AccessSubject;

  async function organization() {
    const id = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [id, `งาน ${id.slice(0, 6)}`]);
    return id;
  }
  async function person(organizationId: string | null) {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, position_title, created_at) VALUES (?, 'c', ?, 'เดิม', 'พยาบาลวิชาชีพ', UTC_TIMESTAMP())", [id, randomUUID()]);
    if (organizationId) await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [randomUUID(), id, organizationId, actorId]);
    return id;
  }
  const audits = (personId: string) => database.query<{ action: string; metadata: string }>("SELECT action, metadata FROM audit_event WHERE target_type = 'person' AND target_id = ?", [personId]);
  const profileRow = async (personId: string) => (await database.query<Record<string, unknown>>("SELECT name_prefix AS namePrefix, first_name AS firstName, last_name AS lastName, gender, phone, employment_type_id AS employmentTypeId, position_level AS positionLevel, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birthDate FROM hr_person_profile WHERE person_id = ?", [personId]))[0];

  beforeAll(async () => {
    await runMigrations(database);
    actorId = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, 'c', ?, 'ผู้ดูแล HR', UTC_TIMESTAMP())", [actorId, randomUUID()]);
    manager = { authenticated: true, personId: actorId, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  });
  afterAll(async () => { await database.close(); });

  it('saves personal and work details, the display name and one audit event together', async () => {
    const id = await person(await organization());
    expect(await service.updateProfile(id, { namePrefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', birthDate: '1988-01-31', employmentTypeId: civilServant, positionLevel: 'ชำนาญการ', positionTitle: 'นักวิชาการสาธารณสุข' }, manager)).toEqual({ ok: true });
    expect(await profileRow(id)).toMatchObject({ namePrefix: 'นาย', gender: 'MALE', employmentTypeId: civilServant, positionLevel: 'ชำนาญการ', birthDate: '1988-01-31' });
    const [stored] = await database.query<{ displayName: string; positionTitle: string }>('SELECT display_name AS displayName, position_title AS positionTitle FROM person WHERE id = ?', [id]);
    expect(stored).toEqual({ displayName: 'นายสมชาย ใจดี', positionTitle: 'นักวิชาการสาธารณสุข' });
    const events = await audits(id);
    expect(events.map((event) => event.action)).toEqual(['hr.person.profile.update']);
    const metadata = JSON.parse(events[0]!.metadata);
    expect(metadata.changedFields.sort()).toEqual(['birthDate', 'employmentType', 'firstName', 'gender', 'lastName', 'namePrefix', 'positionLevel', 'positionTitle']);
    expect(metadata.workChanges).toEqual({ employmentType: { from: null, to: 'ข้าราชการ' }, positionLevel: { from: null, to: 'ชำนาญการ' }, positionTitle: { from: 'พยาบาลวิชาชีพ', to: 'นักวิชาการสาธารณสุข' } });
    expect(events[0]!.metadata).not.toContain('1988-01-31');
    expect(events[0]!.metadata).not.toContain('สมชาย');
  });

  it('writes nothing for a save that changes nothing', async () => {
    const id = await person(await organization());
    await service.updateProfile(id, { positionLevel: 'ปฏิบัติการ' }, manager);
    expect(await service.updateProfile(id, { positionLevel: 'ปฏิบัติการ' }, manager)).toEqual({ ok: true });
    expect(await audits(id)).toHaveLength(1);
  });

  it('rolls the profile back when the audit write fails', async () => {
    const id = await person(await organization());
    const ghost = { ...manager, personId: randomUUID() };
    await expect(service.updateProfile(id, { positionLevel: 'ชำนาญการพิเศษ' }, ghost)).rejects.toThrow();
    expect(await profileRow(id)).toBeUndefined();
  });

  it('needs a gender for a prefix that does not tell and accepts an override', async () => {
    const id = await person(await organization());
    expect(await service.updateProfile(id, { namePrefix: 'ดร.' }, manager)).toEqual({ ok: false, code: 'GENDER_REQUIRED' });
    expect(await service.updateProfile(id, { namePrefix: 'ดร.', gender: null }, manager)).toEqual({ ok: false, code: 'GENDER_REQUIRED' });
    expect(await service.updateProfile(id, { namePrefix: 'นาง', gender: 'MALE' }, manager)).toEqual({ ok: true });
    expect((await profileRow(id))?.gender).toBe('MALE');
  });

  it('keeps an overridden gender when the same prefix is saved again', async () => {
    const id = await person(await organization());
    expect(await service.updateProfile(id, { namePrefix: 'นาง', gender: 'MALE' }, manager)).toEqual({ ok: true });
    expect(await service.updateProfile(id, { namePrefix: 'นาง', positionLevel: 'ชำนาญการ' }, manager)).toEqual({ ok: true });
    expect((await profileRow(id))?.gender).toBe('MALE');
  });

  it('refuses an unknown or inactive employment type but keeps it for people already on it', async () => {
    const holder = await person(await organization());
    const newcomer = await person(await organization());
    const typeId = randomUUID();
    const code = `X${typeId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    await database.execute("INSERT INTO hr_employment_type (id, code, name, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 90, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [typeId, code, `ประเภท ${code}`]);
    await service.updateProfile(holder, { employmentTypeId: typeId }, manager);
    await database.execute('UPDATE hr_employment_type SET is_active = 0 WHERE id = ?', [typeId]);
    expect(await service.updateProfile(newcomer, { employmentTypeId: typeId }, manager)).toEqual({ ok: false, code: 'INACTIVE_EMPLOYMENT_TYPE' });
    expect(await service.updateProfile(newcomer, { employmentTypeId: randomUUID() }, manager)).toEqual({ ok: false, code: 'UNKNOWN_EMPLOYMENT_TYPE' });
    expect(await service.updateProfile(holder, { employmentTypeId: typeId, positionLevel: 'ชำนาญการ' }, manager)).toEqual({ ok: true });
    const view = await service.get(holder, manager);
    expect(typeof view !== 'string' && view.work.employmentTypeName).toBe(`ประเภท ${code}`);
  });

  it('moves a person to another unit with one open assignment that keeps the manager', async () => {
    const id = await person(await organization());
    const target = await organization();
    expect(await service.updateProfile(id, { organizationId: target }, manager)).toEqual({ ok: true });
    const open = await database.query<{ organizationId: string; managerPersonId: string | null }>('SELECT organization_id AS organizationId, manager_person_id AS managerPersonId FROM employment_assignment WHERE person_id = ? AND effective_until IS NULL', [id]);
    expect(open).toEqual([{ organizationId: target, managerPersonId: actorId }]);
    expect(JSON.parse((await audits(id))[0]!.metadata).workChanges.organization.to).toBe(`งาน ${target.slice(0, 6)}`);
    expect(await service.updateProfile(id, { organizationId: randomUUID() }, manager)).toEqual({ ok: false, code: 'UNKNOWN_ORGANIZATION' });
  });

  it('lets a person edit their own contact details but not their profile', async () => {
    const id = await person(await organization());
    const self: AccessSubject = { authenticated: true, personId: id, roles: [], dataOwnerModules: [] };
    expect(await service.updateContact(id, { phone: '0899999999', address: 'บ้านเลขที่ 1', emergencyContactName: 'แม่' }, self)).toEqual({ ok: true });
    expect((await profileRow(id))?.phone).toBe('0899999999');
    expect(await service.updateProfile(id, { positionLevel: 'เชี่ยวชาญ' }, self)).toEqual({ ok: false, code: 'FORBIDDEN' });
    const other = await person(await organization());
    expect(await service.updateContact(other, { phone: '0800000000' }, self)).toEqual({ ok: false, code: 'FORBIDDEN' });
    const events = await audits(id);
    expect(events.map((event) => event.action)).toEqual(['hr.person.contact.update']);
    expect(JSON.parse(events[0]!.metadata)).toEqual({ changedFields: ['phone', 'address', 'emergencyContactName'] });
    expect(events[0]!.metadata).not.toContain('0899999999');
    expect(await service.updateContact(randomUUID(), { phone: '0800000000' }, manager)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('refuses a scoped manager who moves a person into a unit they do not cover', async () => {
    const own = await organization();
    const id = await person(own);
    const scoped: AccessSubject = { ...manager, roles: [{ name: 'hr-manager', organizationId: own }] };
    expect(await service.updateProfile(id, { organizationId: await organization() }, scoped)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
  it('lets a person edit their own personal details with one audit event and keeps the display name in step', async () => {
    const id = await person(await organization());
    const self: AccessSubject = { authenticated: true, personId: id, roles: [], dataOwnerModules: [] };
    expect(await service.updateOwnPersonal(id, { namePrefix: 'นาง', firstName: 'สมศรี', lastName: 'มีสุข', birthDate: '1991-02-03' }, self)).toEqual({ ok: true });
    expect(await profileRow(id)).toMatchObject({ namePrefix: 'นาง', firstName: 'สมศรี', lastName: 'มีสุข', gender: 'FEMALE' });
    const [named] = await database.query<{ displayName: string; positionTitle: string }>('SELECT display_name AS displayName, position_title AS positionTitle FROM person WHERE id = ?', [id]);
    expect(named).toEqual({ displayName: 'นางสมศรี มีสุข', positionTitle: 'พยาบาลวิชาชีพ' });
    const events = await audits(id);
    expect(events.map((event) => event.action)).toEqual(['hr.person.personal.update']);
    expect(JSON.parse(events[0]!.metadata)).toEqual({ changedFields: ['namePrefix', 'firstName', 'lastName', 'gender', 'birthDate'] });
    expect(events[0]!.metadata).not.toContain('สมศรี');
    const view = await service.get(id, self);
    if (typeof view === 'string') throw new Error(view);
    expect(view.history[0]?.changedFields).toEqual(['namePrefix', 'firstName', 'lastName', 'gender', 'birthDate']);
  });

  it('refuses personal edits for someone else, even by an hr manager, and work fields from the person', async () => {
    const id = await person(await organization());
    expect(await service.updateOwnPersonal(id, { firstName: 'แอบแก้' }, manager)).toEqual({ ok: false, code: 'FORBIDDEN' });
    const self: AccessSubject = { authenticated: true, personId: id, roles: [], dataOwnerModules: [] };
    await expect(service.updateOwnPersonal(id, { positionTitle: 'ผู้อำนวยการ' } as never, self)).rejects.toThrow();
    expect(await profileRow(id)).toBeUndefined();
    expect(await audits(id)).toHaveLength(0);
  });

  async function attachment(createdBy: string, contentType = 'image/png', sizeBytes = 1024) {
    const attachmentId = randomUUID();
    await database.execute('INSERT INTO attachment (id, object_key, content_type, size_bytes, created_by_person_id, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [attachmentId, `attachments/${randomUUID()}`, contentType, String(sizeBytes), createdBy]);
    return attachmentId;
  }

  it('sets and removes a person\'s own photo with an audit event that names the field only', async () => {
    const id = await person(await organization());
    const noProfile = await person(null);
    const self: AccessSubject = { authenticated: true, personId: id, roles: [], dataOwnerModules: [] };
    const photo = await attachment(id);
    expect(await service.setOwnPhoto(id, photo, self)).toEqual({ ok: true });
    expect(await service.photoAttachmentOf(id)).toBe(photo);
    expect(await service.setOwnPhoto(id, null, self)).toEqual({ ok: true });
    expect(await service.photoAttachmentOf(id)).toBeNull();
    const events = await audits(id);
    expect(events.map((event) => event.action).sort()).toEqual(['hr.person.photo.update', 'hr.person.photo.update']);
    expect(JSON.parse(events[0]!.metadata)).toEqual({ changedFields: ['photo'] });
    const fresh: AccessSubject = { ...self, personId: noProfile };
    const second = await attachment(noProfile, 'image/webp');
    expect(await service.setOwnPhoto(noProfile, second, fresh)).toEqual({ ok: true });
    expect(await service.photoAttachmentOf(noProfile)).toBe(second);
  });

  it('refuses a photo for someone else, a file uploaded by another person, a PDF or one over 2 MB', async () => {
    const id = await person(await organization());
    const self: AccessSubject = { authenticated: true, personId: id, roles: [], dataOwnerModules: [] };
    expect(await service.setOwnPhoto(id, await attachment(id), manager)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.setOwnPhoto(id, await attachment(await person(null)), self)).toEqual({ ok: false, code: 'INVALID_PHOTO' });
    expect(await service.setOwnPhoto(id, await attachment(id, 'application/pdf'), self)).toEqual({ ok: false, code: 'INVALID_PHOTO' });
    expect(await service.setOwnPhoto(id, await attachment(id, 'image/jpeg', 2 * 1024 * 1024 + 1), self)).toEqual({ ok: false, code: 'INVALID_PHOTO' });
    expect(await service.setOwnPhoto(id, randomUUID(), self)).toEqual({ ok: false, code: 'INVALID_PHOTO' });
    expect(await service.photoAttachmentOf(id)).toBeNull();
    expect(await audits(id)).toHaveLength(0);
  });
});
