import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { HrDirectory } from './hr-directory';
import { OrganizationStructureService } from './organization-structure-service';
import { HrProfileService } from './profile-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('OrganizationStructureService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new OrganizationStructureService(database);
  const actor = randomUUID();
  const hrManager = { authenticated: true, personId: actor, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;

  async function person(organizationId: string) {
    const id = randomUUID();
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, employment_status, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), 'ACTIVE']);
    await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())', [randomUUID(), id, organizationId]);
    return id;
  }
  const openAssignments = (personId: string) => database.query<{ id: string }>('SELECT id FROM employment_assignment WHERE person_id = ? AND effective_until IS NULL', [personId]);
  const created = (result: Awaited<ReturnType<OrganizationStructureService['create']>>) => { if (!result.ok) throw new Error(result.code); return result.id; };

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => database.close());

  it('adds a กลุ่มงาน and a งาน under it, and refuses a duplicate sibling name', async () => {
    const divisionName = unique('กลุ่มงานการพยาบาล');
    const divisionId = created(await service.create({ name: divisionName, unitType: 'DIVISION' }, actor));
    const sectionId = created(await service.create({ name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: divisionId }, actor));
    const [section] = await database.query<{ parentId: string; unitType: string }>('SELECT parent_id AS parentId, unit_type AS unitType FROM organization WHERE id = ?', [sectionId]);
    expect(section).toEqual({ parentId: divisionId, unitType: 'SECTION' });
    await expect(service.create({ name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: divisionId }, actor)).resolves.toEqual({ ok: false, code: 'DUPLICATE_NAME' });
    await expect(service.create({ name: divisionName, unitType: 'DIVISION' }, actor)).resolves.toEqual({ ok: false, code: 'DUPLICATE_NAME' });
    await expect(service.create({ name: 'งานลอย', unitType: 'SECTION', parentId: sectionId }, actor)).resolves.toEqual({ ok: false, code: 'PARENT_NOT_DIVISION' });
    await expect(service.create({ name: 'งานลอย', unitType: 'SECTION' }, actor)).resolves.toEqual({ ok: false, code: 'PARENT_NOT_DIVISION' });
    expect(await database.query('SELECT id FROM audit_event WHERE target_id = ? AND action = ?', [sectionId, 'hr.organization.create'])).toHaveLength(1);
  });

  it('renames a unit and moves a งาน to another กลุ่มงาน', async () => {
    const first = created(await service.create({ name: unique('กลุ่มงาน ก'), unitType: 'DIVISION' }, actor));
    const second = created(await service.create({ name: unique('กลุ่มงาน ข'), unitType: 'DIVISION' }, actor));
    const sectionId = created(await service.create({ name: 'งานย้าย', unitType: 'SECTION', parentId: first }, actor));
    await expect(service.update(sectionId, { name: 'งานย้ายแล้ว', parentId: second }, actor)).resolves.toEqual({ ok: true });
    const [row] = await database.query<{ name: string; parentId: string }>('SELECT name, parent_id AS parentId FROM organization WHERE id = ?', [sectionId]);
    expect(row).toEqual({ name: 'งานย้ายแล้ว', parentId: second });
    await expect(service.update(first, { name: 'x', parentId: second }, actor)).resolves.toEqual({ ok: false, code: 'PARENT_NOT_DIVISION' });
    await expect(service.update(randomUUID(), { name: 'x' }, actor)).resolves.toEqual({ ok: false, code: 'ORGANIZATION_NOT_FOUND' });
  });

  it('deletes a กลุ่มงาน with its งาน and leaves their people with no unit', async () => {
    const divisionId = created(await service.create({ name: unique('กลุ่มงานลบ'), unitType: 'DIVISION' }, actor));
    const sectionId = created(await service.create({ name: 'งานลบ', unitType: 'SECTION', parentId: divisionId }, actor));
    const inDivision = await person(divisionId);
    const inSection = await person(sectionId);
    await database.execute('INSERT INTO hr_organization_head (id, organization_id, person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())', [randomUUID(), sectionId, inSection]);
    await database.execute("UPDATE organization SET code = ? WHERE id = ?", [`DEL-${randomUUID().slice(0, 8)}`, divisionId]);

    expect(await service.deletionImpact(divisionId)).toEqual({ units: 2, people: 2 });
    await expect(service.delete(divisionId, actor)).resolves.toEqual({ ok: true, units: 2, people: 2 });

    expect(await openAssignments(inDivision)).toEqual([]);
    expect(await openAssignments(inSection)).toEqual([]);
    expect(await database.query('SELECT id FROM hr_organization_head WHERE organization_id = ? AND effective_until IS NULL', [sectionId])).toEqual([]);
    const rows = await database.query<{ deleted: number; code: string | null }>('SELECT deleted_at IS NOT NULL AS deleted, code FROM organization WHERE id IN (?, ?)', [divisionId, sectionId]);
    expect(rows.map((row) => [Number(row.deleted), row.code])).toEqual([[1, null], [1, null]]);
    const ids = (await new HrDirectory(database).listOrganizations()).map((organization) => organization.id);
    expect(ids).not.toContain(divisionId);
    expect(ids).not.toContain(sectionId);
    expect(await new HrDirectory(database).getOrganization(divisionId)).toBeNull();
    const [audit] = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ? AND action = ?', [divisionId, 'hr.organization.delete']);
    expect(JSON.parse(audit!.metadata)).toEqual({ organizationId: divisionId, units: 2, people: 2 });
    await expect(service.delete(divisionId, actor)).resolves.toEqual({ ok: false, code: 'ORGANIZATION_NOT_FOUND' });
    await expect(service.create({ name: 'งานใต้กลุ่มที่ลบ', unitType: 'SECTION', parentId: divisionId }, actor)).resolves.toEqual({ ok: false, code: 'PARENT_NOT_DIVISION' });
    const [view] = await database.query<{ organizationId: string | null }>('SELECT organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND effective_until IS NULL', [inSection]);
    expect(view).toBeUndefined();
  });

  it('refuses to put a person in a deleted unit, and lets HR leave a person with no unit', async () => {
    const divisionId = created(await service.create({ name: unique('กลุ่มงานชั่วคราว'), unitType: 'DIVISION' }, actor));
    const keepId = created(await service.create({ name: unique('กลุ่มงานคงอยู่'), unitType: 'DIVISION' }, actor));
    const someone = await person(keepId);
    await service.delete(divisionId, actor);
    const profiles = new HrProfileService(database);
    await expect(profiles.updateProfile(someone, { organizationId: divisionId }, hrManager)).resolves.toEqual({ ok: false, code: 'UNKNOWN_ORGANIZATION' });
    await expect(profiles.updateProfile(someone, { organizationId: null }, hrManager)).resolves.toEqual({ ok: true });
    expect(await openAssignments(someone)).toEqual([]);
  });
});
