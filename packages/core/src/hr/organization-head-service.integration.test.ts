import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { OrganizationHeadService } from './organization-head-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('OrganizationHeadService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new OrganizationHeadService(database);
  const actor = randomUUID();

  async function organization() {
    const id = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [id, 'งานทดสอบ']);
    return id;
  }
  async function person() {
    const id = randomUUID();
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID()]);
    return id;
  }
  const heads = (organizationId: string) => database.query<{ personId: string; effectiveFrom: Date; effectiveUntil: Date | null }>('SELECT person_id AS personId, effective_from AS effectiveFrom, effective_until AS effectiveUntil FROM hr_organization_head WHERE organization_id = ? ORDER BY effective_from', [organizationId]);
  const audits = (organizationId: string, action: string) => database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ? AND action = ?', [organizationId, action]);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => database.close());

  it('closes the previous term when a new head is assigned and audits both', async () => {
    const organizationId = await organization();
    const [first, second] = [await person(), await person()];

    await service.assign({ organizationId, personId: first, effectiveFrom: new Date('2026-01-01T00:00:00Z') }, actor);
    await expect(service.assign({ organizationId, personId: second, effectiveFrom: new Date('2026-06-01T00:00:00Z') }, actor)).resolves.toEqual({ kind: 'assign', closeCurrentId: expect.any(String) });

    const rows = await heads(organizationId);
    expect(rows.map((row) => row.personId)).toEqual([first, second]);
    expect(rows[0]!.effectiveUntil).toEqual(rows[1]!.effectiveFrom);
    expect(rows[1]!.effectiveUntil).toBeNull();
    expect(await audits(organizationId, 'hr.organization.head.assign')).toHaveLength(2);
  });

  it('keeps one open term when two heads are assigned at the same time', async () => {
    const organizationId = await organization();
    const [first, second] = [await person(), await person()];

    await Promise.all([
      service.assign({ organizationId, personId: first, effectiveFrom: new Date('2026-06-01T00:00:00Z') }, actor),
      service.assign({ organizationId, personId: second, effectiveFrom: new Date('2026-06-01T00:00:00Z') }, actor)
    ]);

    expect((await heads(organizationId)).filter((row) => row.effectiveUntil === null)).toHaveLength(1);
  });

  it('sets the unit type with an audit event in one transaction', async () => {
    const organizationId = await organization();
    const auditId = randomUUID();
    const fixedIdService = new OrganizationHeadService(database, () => auditId);

    await expect(fixedIdService.setUnitType({ organizationId, unitType: 'DIVISION' }, actor)).resolves.toEqual({ ok: true });
    // The reused audit id makes the audit insert fail, so the unit type change must roll back with it.
    await expect(fixedIdService.setUnitType({ organizationId, unitType: 'SECTION' }, actor)).rejects.toThrow();

    expect(await database.query('SELECT unit_type AS unitType FROM organization WHERE id = ?', [organizationId])).toEqual([{ unitType: 'DIVISION' }]);
    expect(await audits(organizationId, 'hr.organization.type.update')).toEqual([{ metadata: JSON.stringify({ organizationId, unitType: 'DIVISION' }) }]);
  });

  it('reports an unknown organization when setting a unit type', async () => {
    await expect(service.setUnitType({ organizationId: randomUUID(), unitType: 'SECTION' }, actor)).resolves.toEqual({ ok: false, code: 'ORGANIZATION_NOT_FOUND' });
  });
});
