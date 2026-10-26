import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { seedLocalDemo } from './local-demo-seed';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('seedLocalDemo', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector('11'.repeat(32), '22'.repeat(32));

  afterAll(async () => database.close());

  it('creates sample units, people with accounts and roles, and is safe to run twice', async () => {
    await runMigrations(database);

    // The test database is shared and may already hold the demo data, so only the second run's count is fixed.
    await seedLocalDemo(database, protector, { password: 'demo-password-2569' });
    const second = await seedLocalDemo(database, protector, { password: 'demo-password-2569' });

    expect(second.accountsCreated).toBe(0);
    const accounts = await database.query<{ username: string; displayName: string }>("SELECT account.username, person.display_name AS displayName FROM local_account account JOIN person ON person.id = account.person_id WHERE account.username IN ('hr001', 'nur014', 'dir001')");
    expect(accounts.map((account) => account.username).sort()).toEqual(['dir001', 'hr001', 'nur014']);
    const roles = await database.query<{ name: string }>("SELECT role.name FROM role_assignment assignment JOIN role ON role.id = assignment.role_id JOIN local_account account ON account.person_id = assignment.person_id WHERE account.username = 'hr001'");
    expect(roles.map((role) => role.name)).toContain('hr-manager');
    const roomRoles = await database.query<{ name: string }>("SELECT role.name FROM role_assignment assignment JOIN role ON role.id = assignment.role_id JOIN local_account account ON account.person_id = assignment.person_id WHERE account.username = 'adm003'");
    expect(roomRoles.map((role) => role.name).sort()).toEqual(['inventory-officer', 'room-booking-approver', 'room-manager']);
    const supervisorRoles = await database.query<{ name: string; organizationId: string | null }>("SELECT role.name, assignment.organization_id AS organizationId FROM role_assignment assignment JOIN role ON role.id = assignment.role_id JOIN local_account account ON account.person_id = assignment.person_id WHERE account.username = 'dir001'");
    expect(supervisorRoles).toEqual([{ name: 'inventory-supervisor', organizationId: null }]);
    const [manager] = await database.query<{ managerCode: string }>("SELECT manager.employee_code AS managerCode FROM person staff JOIN employment_assignment assignment ON assignment.person_id = staff.id AND assignment.effective_until IS NULL JOIN person manager ON manager.id = assignment.manager_person_id WHERE staff.employee_code = 'NUR014'");
    expect(manager?.managerCode).toBe('NUR001');
  });

  it('gives every sample person an employment type and appointment date so they can file leave', async () => {
    await seedLocalDemo(database, protector, { password: 'demo-password-2569' });
    const profiles = await database.query<{ code: string; employmentTypeCode: string | null; appointedOn: string | null }>("SELECT person.employee_code AS code, type.code AS employmentTypeCode, DATE_FORMAT(profile.appointed_on, '%Y-%m-%d') AS appointedOn FROM person LEFT JOIN hr_person_profile profile ON profile.person_id = person.id LEFT JOIN hr_employment_type type ON type.id = profile.employment_type_id WHERE person.employee_code IN ('NUR014', 'NUR022', 'HR001')");
    expect(profiles).toHaveLength(3);
    for (const profile of profiles) expect(profile).toMatchObject({ employmentTypeCode: 'CIVIL_SERVANT', appointedOn: '2015-06-01' });
  });

  it('records each sample person\'s gender, so leave types for one gender show correctly', async () => {
    await seedLocalDemo(database, protector, { password: 'demo-password-2569' });
    const rows = await database.query<{ code: string; gender: string | null }>("SELECT person.employee_code AS code, profile.gender FROM person JOIN hr_person_profile profile ON profile.person_id = person.id WHERE person.employee_code IN ('NUR014', 'NUR022') ORDER BY person.employee_code");
    expect(rows).toEqual([{ code: 'NUR014', gender: 'FEMALE' }, { code: 'NUR022', gender: 'MALE' }]);
  });

  it('makes NUR001 head of the nursing group and DIR001 head of the hospital, once', async () => {
    await seedLocalDemo(database, protector, { password: 'demo-password-2569' });
    await seedLocalDemo(database, protector, { password: 'demo-password-2569' });
    const heads = await database.query<{ unit: string; head: string }>("SELECT organization.code AS unit, person.employee_code AS head FROM hr_organization_head head JOIN organization ON organization.id = head.organization_id JOIN person ON person.id = head.person_id WHERE head.effective_until IS NULL AND organization.code IN ('HOSP', 'NUR') ORDER BY organization.code");
    expect(heads).toEqual([{ unit: 'HOSP', head: 'DIR001' }, { unit: 'NUR', head: 'NUR001' }]);
  });
});
