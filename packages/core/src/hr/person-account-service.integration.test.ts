import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { LocalAuthService } from '../identity/auth-service';
import { DatabaseLocalAccountRepository } from '../identity/database-identity-repository';
import { nationalId } from './national-id-fixture';
import { PersonAccountService } from './person-account-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PersonAccountService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector('a'.repeat(64), 'b'.repeat(64));
  const service = new PersonAccountService(database, protector);
  const actor = randomUUID();
  const hrManager = { authenticated: true, personId: actor, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const scoped = { authenticated: true, personId: actor, roles: [{ name: 'hr-manager', organizationId: randomUUID() }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: [] };
  const newId = () => nationalId(`1${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`);
  const short = () => randomUUID().slice(0, 8);
  const login = (username: string, password: string) => new LocalAuthService(new DatabaseLocalAccountRepository(database)).authenticateLocal({ username, password });
  const input = (overrides: Record<string, unknown> = {}) => ({
    nationalId: newId(), employeeCode: `E${short()}`, namePrefix: 'นางสาว', firstName: 'สมใจ', lastName: 'ใจดี', positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ชำนาญงาน',
    phone: '0812345678', username: `user.${short()}`, password: 'initial-secret-1', ...overrides
  });
  const created = (result: Awaited<ReturnType<PersonAccountService['create']>>) => { if (!result.ok) throw new Error(result.code); return result.id; };
  const count = async (sql: string, parameters: unknown[]) => Number((await database.query<{ n: number }>(sql, parameters))[0]!.n);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => database.close());

  it('creates the person, profile, unit and account in one go with one audit that holds no ID or password', async () => {
    const [unit] = await database.query<{ id: string }>('SELECT id FROM organization WHERE deleted_at IS NULL LIMIT 1');
    const values = input({ organizationId: unit?.id });
    const id = created(await service.create(values, hrManager));
    const [person] = await database.query<{ displayName: string; employeeCode: string; positionTitle: string; masked: string; lookup: string; status: string }>(
      'SELECT display_name AS displayName, employee_code AS employeeCode, position_title AS positionTitle, national_id_masked AS masked, national_id_lookup AS lookup, employment_status AS status FROM person WHERE id = ?', [id]);
    expect(person).toEqual({ displayName: 'นางสาวสมใจ ใจดี', employeeCode: values.employeeCode, positionTitle: 'เจ้าพนักงานธุรการ', masked: protector.mask(values.nationalId), lookup: protector.lookup(values.nationalId), status: 'ACTIVE' });
    expect(await count('SELECT COUNT(*) AS n FROM hr_person_profile WHERE person_id = ? AND phone = ? AND position_level = ? AND position_id IS NOT NULL', [id, '0812345678', 'ชำนาญงาน'])).toBe(1);
    if (unit) expect(await count('SELECT COUNT(*) AS n FROM employment_assignment WHERE person_id = ? AND organization_id = ? AND effective_until IS NULL', [id, unit.id])).toBe(1);
    await expect(login(values.username, values.password)).resolves.toMatchObject({ personId: id });
    const audits = await database.query<{ action: string; metadata: string }>('SELECT action, metadata FROM audit_event WHERE target_id = ?', [id]);
    expect(audits.map((audit) => audit.action)).toEqual(['hr.person.create']);
    expect(audits[0]!.metadata).not.toContain(values.nationalId);
    expect(audits[0]!.metadata).not.toContain(values.password);
    expect(audits[0]!.metadata).not.toContain('0812345678');
    await expect(service.getAccount(id)).resolves.toEqual({ username: values.username });
  });

  it('refuses a duplicate national ID, employee code or username and writes nothing', async () => {
    const first = input();
    created(await service.create(first, hrManager));
    const before = await count('SELECT COUNT(*) AS n FROM person', []);
    await expect(service.create(input({ nationalId: first.nationalId }), hrManager)).resolves.toEqual({ ok: false, code: 'DUPLICATE_NATIONAL_ID' });
    await expect(service.create(input({ employeeCode: first.employeeCode }), hrManager)).resolves.toEqual({ ok: false, code: 'DUPLICATE_EMPLOYEE_CODE' });
    await expect(service.create(input({ username: first.username.toUpperCase() }), hrManager)).resolves.toEqual({ ok: false, code: 'DUPLICATE_USERNAME' });
    await expect(service.create(input({ positionLevel: 'ปฏิบัติการ' }), hrManager)).resolves.toEqual({ ok: false, code: 'LEVEL_NOT_ALLOWED' });
    expect(await count('SELECT COUNT(*) AS n FROM person', [])).toBe(before);
  });

  it('lets only a hospital-wide HR manager create a person or change identity fields', async () => {
    await expect(service.create(input(), scoped)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    const id = created(await service.create(input(), hrManager));
    await expect(service.updateIdentity(id, { employmentStatus: 'INACTIVE' }, scoped)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.setPassword(id, 'another-secret-2', scoped)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('changes the employee code, status and national ID, refusing one already in use', async () => {
    const other = input();
    created(await service.create(other, hrManager));
    const id = created(await service.create(input(), hrManager));
    const replacement = newId();
    const code = `E${short()}`;
    await expect(service.updateIdentity(id, { employeeCode: code, employmentStatus: 'INACTIVE', nationalId: replacement }, hrManager)).resolves.toEqual({ ok: true });
    const [person] = await database.query<{ employeeCode: string; status: string; lookup: string; masked: string; ciphertext: string }>('SELECT employee_code AS employeeCode, employment_status AS status, national_id_lookup AS lookup, national_id_masked AS masked, national_id_ciphertext AS ciphertext FROM person WHERE id = ?', [id]);
    expect(person).toMatchObject({ employeeCode: code, status: 'INACTIVE', lookup: protector.lookup(replacement), masked: protector.mask(replacement) });
    expect(protector.decrypt(person!.ciphertext)).toBe(replacement);
    await expect(service.updateIdentity(id, { nationalId: other.nationalId }, hrManager)).resolves.toEqual({ ok: false, code: 'DUPLICATE_NATIONAL_ID' });
    await expect(service.updateIdentity(id, { employeeCode: other.employeeCode }, hrManager)).resolves.toEqual({ ok: false, code: 'DUPLICATE_EMPLOYEE_CODE' });
    await expect(service.updateIdentity(randomUUID(), { employmentStatus: 'ACTIVE' }, hrManager)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    const [audit] = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ? AND action = ?', [id, 'hr.person.identity.update']);
    expect(JSON.parse(audit!.metadata)).toEqual({ changedFields: ['employeeCode', 'employmentStatus', 'nationalId'] });
  });

  it('sets a new password that login then accepts, and ends the person\'s sessions', async () => {
    const values = input();
    const id = created(await service.create(values, hrManager));
    await database.execute('INSERT INTO user_session (id, token_hash, person_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY)', [randomUUID(), randomUUID().replace(/-/g, '').padEnd(64, '0'), id]);
    await expect(service.setPassword(id, 'brand-new-secret', hrManager)).resolves.toEqual({ ok: true });
    await expect(login(values.username, 'brand-new-secret')).resolves.toMatchObject({ personId: id });
    await expect(login(values.username, values.password)).rejects.toThrow('INVALID_CREDENTIALS');
    expect(await count('SELECT COUNT(*) AS n FROM user_session WHERE person_id = ? AND revoked_at IS NULL', [id])).toBe(0);
  });

  it('gives a person with no account one, once, and never changes a username', async () => {
    const someone = randomUUID();
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, employment_status, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [someone, 'ciphertext', randomUUID(), 'ACTIVE']);
    await expect(service.getAccount(someone)).resolves.toBeNull();
    await expect(service.setPassword(someone, 'brand-new-secret', hrManager)).resolves.toEqual({ ok: false, code: 'NO_ACCOUNT' });
    const username = `late.${short()}`;
    await expect(service.createAccount(someone, { username, password: 'first-secret-1' }, hrManager)).resolves.toEqual({ ok: true });
    await expect(login(username, 'first-secret-1')).resolves.toMatchObject({ personId: someone });
    await expect(service.createAccount(someone, { username: `other.${short()}`, password: 'first-secret-1' }, hrManager)).resolves.toEqual({ ok: false, code: 'ACCOUNT_EXISTS' });
    await expect(service.getAccount(someone)).resolves.toEqual({ username });
    expect('updateUsername' in service).toBe(false);
  });

  it('signs out and locks out a person marked พ้นสภาพ, and lets them back in when active again', async () => {
    const values = input();
    const id = created(await service.create(values, hrManager));
    await database.execute('INSERT INTO user_session (id, token_hash, person_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY)', [randomUUID(), randomUUID().replace(/-/g, '').padEnd(64, '0'), id]);
    await expect(service.updateIdentity(id, { employmentStatus: 'INACTIVE' }, hrManager)).resolves.toEqual({ ok: true });
    expect(await count('SELECT COUNT(*) AS n FROM user_session WHERE person_id = ? AND revoked_at IS NULL', [id])).toBe(0);
    await expect(login(values.username, values.password)).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(service.updateIdentity(id, { employmentStatus: 'ACTIVE' }, hrManager)).resolves.toEqual({ ok: true });
    await expect(login(values.username, values.password)).resolves.toMatchObject({ personId: id });
  });

  it('will not set the password of the HR manager themself or of anyone holding a role in the system', async () => {
    await expect(service.setPassword(actor, 'brand-new-secret', hrManager)).resolves.toEqual({ ok: false, code: 'PROTECTED_ACCOUNT' });
    const values = input();
    const id = created(await service.create(values, hrManager));
    const roleId = randomUUID();
    await database.execute('INSERT INTO role (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [roleId, `admin-${short()}`]);
    await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())', [randomUUID(), id, roleId]);
    await expect(service.setPassword(id, 'brand-new-secret', hrManager)).resolves.toEqual({ ok: false, code: 'PROTECTED_ACCOUNT' });
    await expect(login(values.username, values.password)).resolves.toMatchObject({ personId: id });
  });

  it('records the phone among the fields of the creation audit', async () => {
    const id = created(await service.create(input(), hrManager));
    const [audit] = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ? AND action = ?', [id, 'hr.person.create']);
    expect(JSON.parse(audit!.metadata).changedFields).toContain('phone');
  });
});
