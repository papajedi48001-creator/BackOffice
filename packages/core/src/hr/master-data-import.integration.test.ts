import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { HrDirectory } from './hr-directory';
import { MasterDataImportService } from './master-data-import';
import { nationalId } from './national-id-fixture';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const peopleHeader = 'employee_code,national_id,display_name,position_title,organization_code,manager_employee_code,effective_from,status';

describeWithDatabase('MasterDataImportService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector('a'.repeat(64), 'b'.repeat(64));
  const service = new MasterDataImportService(database, protector);
  const run = randomUUID().slice(0, 8);
  const hospital = `H${run}`;
  const nursing = `N${run}`;
  const directorId = nationalId(`2${String(Date.now()).slice(-11)}`);
  const nurseId = nationalId(`3${String(Date.now()).slice(-11)}`);
  const organizations = `code,name,parent_code\n${hospital},โรงพยาบาลวาริชภูมิ,\n${nursing},กลุ่มการพยาบาล,${hospital}`;
  const people = (nurseOrganization: string, date: string) => `${peopleHeader}\nD${run},${directorId},นพ.สมชาย ใจดี,ผู้อำนวยการ,${hospital},,2026-10-01,\nR${run},${nurseId},นางสาวมาลี ดีงาม,พยาบาลวิชาชีพ,${nurseOrganization},D${run},${date},ACTIVE`;
  let actorPersonId: string;

  beforeAll(async () => {
    await runMigrations(database);
    actorPersonId = randomUUID();
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actorPersonId, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => database.close());

  it('validates without writing, then applies everything with one audit event, and re-applying changes nothing', async () => {
    const files = { organizations, people: people(nursing, '2026-10-01') };
    const expected = { organizationsCreated: 2, organizationsUpdated: 0, peopleCreated: 2, peopleUpdated: 0, assignmentsChanged: 2 };

    await expect(service.validate(files)).resolves.toEqual({ ok: true, summary: expected });
    await expect(database.query('SELECT id FROM organization WHERE code = ?', [hospital])).resolves.toEqual([]);

    await expect(service.apply(files, actorPersonId)).resolves.toEqual({ ok: true, summary: expected });
    const stored = await database.query<{ displayName: string; masked: string; ciphertext: string; organizationCode: string; managerCode: string | null; effectiveFrom: string }>(
      `SELECT p.display_name AS displayName, p.national_id_masked AS masked, p.national_id_ciphertext AS ciphertext, o.code AS organizationCode, m.employee_code AS managerCode, DATE_FORMAT(a.effective_from, '%Y-%m-%d %H:%i') AS effectiveFrom
       FROM person p JOIN employment_assignment a ON a.person_id = p.id AND a.effective_until IS NULL JOIN organization o ON o.id = a.organization_id LEFT JOIN person m ON m.id = a.manager_person_id WHERE p.employee_code = ?`, [`R${run}`]);
    expect(stored).toEqual([{ displayName: 'นางสาวมาลี ดีงาม', masked: `X-XXXX-XXXXX-${nurseId.slice(10, 12)}-${nurseId[12]}`, ciphertext: expect.any(String), organizationCode: nursing, managerCode: `D${run}`, effectiveFrom: '2026-09-30 17:00' }]);
    expect(protector.decrypt(stored[0]!.ciphertext)).toBe(nurseId);
    const audits = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE actor_person_id = ? AND action = ?', [actorPersonId, 'hr.master_data.imported']);
    expect(audits.map((audit) => JSON.parse(audit.metadata))).toEqual([{ counts: expected }]);
    expect(audits[0]!.metadata).not.toContain(nurseId);

    await expect(service.apply(files, actorPersonId)).resolves.toEqual({ ok: true, summary: { organizationsCreated: 0, organizationsUpdated: 0, peopleCreated: 0, peopleUpdated: 0, assignmentsChanged: 0 } });
  });

  it('closes the current assignment when a person moves and keeps the history', async () => {
    await expect(service.apply({ people: people(hospital, '2026-11-01') }, actorPersonId)).resolves.toMatchObject({ ok: true, summary: { assignmentsChanged: 1, peopleUpdated: 0 } });

    const history = await database.query<{ organizationCode: string; until: string | null }>(
      `SELECT o.code AS organizationCode, DATE_FORMAT(a.effective_until, '%Y-%m-%d %H:%i') AS until FROM employment_assignment a JOIN person p ON p.id = a.person_id JOIN organization o ON o.id = a.organization_id WHERE p.employee_code = ? ORDER BY a.effective_from`, [`R${run}`]);
    expect(history).toEqual([{ organizationCode: nursing, until: '2026-10-31 17:00' }, { organizationCode: hospital, until: null }]);
  });

  it('writes nothing when any row is invalid', async () => {
    const files = { organizations: `code,name,parent_code\nX${run},ใหม่,`, people: `${peopleHeader}\nBAD${run},1234567890123,ผิด,,X${run},,2026-10-01,` };

    await expect(service.apply(files, actorPersonId)).resolves.toEqual({ ok: false, errors: [{ file: 'people', row: 2, column: 'national_id', code: 'INVALID_NATIONAL_ID' }] });
    await expect(database.query('SELECT id FROM organization WHERE code = ?', [`X${run}`])).resolves.toEqual([]);
  });

  it('serialises two imports of the same new rows', async () => {
    const code = `C${run}`;
    const files = { organizations: `code,name,parent_code\n${code},พร้อมกัน,` };

    const results = await Promise.allSettled([service.apply(files, actorPersonId), service.apply(files, actorPersonId)]);

    expect(results.map((result) => result.status === 'fulfilled' ? result.value : 'rejected')).toEqual(expect.arrayContaining([{ ok: true, summary: expect.objectContaining({ organizationsCreated: 1 }) }]));
    await expect(database.query('SELECT id FROM organization WHERE code = ?', [code])).resolves.toHaveLength(1);
  });

  it('lists people with masked IDs, limited to the organizations a scoped reader covers', async () => {
    const directory = new HrDirectory(database);
    const [nursingOrganization] = await database.query<{ id: string }>('SELECT id FROM organization WHERE code = ?', [nursing]);
    const [hospitalOrganization] = await database.query<{ id: string }>('SELECT id FROM organization WHERE code = ?', [hospital]);

    const scoped = await directory.listPeople({ organizationIds: [hospitalOrganization!.id] });
    expect(scoped.map((person) => person.employeeCode).sort()).toEqual([`D${run}`, `R${run}`]);
    expect(scoped.find((person) => person.employeeCode === `R${run}`)).toEqual({ id: expect.any(String), employeeCode: `R${run}`, displayName: 'นางสาวมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentStatus: 'ACTIVE', nationalIdMasked: expect.stringMatching(/^X-XXXX-XXXXX-\d{2}-\d$/), organizationName: 'โรงพยาบาลวาริชภูมิ', organizationCode: hospital });
    await expect(directory.listPeople({ organizationIds: [nursingOrganization!.id] })).resolves.toEqual([]);
    expect((await directory.listPeople({ organizationIds: 'all' })).length).toBeGreaterThanOrEqual(2);

    const units = await directory.listOrganizations();
    expect(units.find((unit) => unit.code === nursing)).toMatchObject({ name: 'กลุ่มการพยาบาล', parentId: hospitalOrganization!.id, activePeople: 0 });
    expect(units.find((unit) => unit.code === hospital)).toMatchObject({ activePeople: 2 });
  });
});
