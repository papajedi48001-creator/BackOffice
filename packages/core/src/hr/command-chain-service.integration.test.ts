import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { CommandChainService } from './command-chain-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('CommandChainService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new CommandChainService(database);
  const ids = { section: randomUUID(), division: randomUUID(), hospital: randomUUID(), nurse: randomUUID(), sectionHead: randomUUID(), firstDivisionHead: randomUUID(), secondDivisionHead: randomUUID(), futureHead: randomUUID(), director: randomUUID() };

  async function person(id: string, status = 'ACTIVE') {
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, employment_status, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), status]);
  }
  async function head(organizationId: string, personId: string, from: string, until: string | null) {
    await database.execute('INSERT INTO hr_organization_head (id, organization_id, person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), organizationId, personId, from, until]);
  }

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, NULL, ?, UTC_TIMESTAMP())', [ids.hospital, 'โรงพยาบาล', 'HOSPITAL']);
    await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [ids.division, 'กลุ่มการพยาบาล', ids.hospital, 'DIVISION']);
    await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [ids.section, 'งานผู้ป่วยใน', ids.division, 'SECTION']);
    for (const id of [ids.nurse, ids.sectionHead, ids.firstDivisionHead, ids.secondDivisionHead, ids.futureHead]) await person(id);
    await person(ids.director, 'INACTIVE');
    await head(ids.section, ids.sectionHead, '2026-01-01 00:00:00', null);
    await head(ids.division, ids.firstDivisionHead, '2026-01-01 00:00:00', '2026-06-01 00:00:00');
    await head(ids.division, ids.secondDivisionHead, '2026-06-01 00:00:00', null);
    await head(ids.hospital, ids.director, '2026-01-01 00:00:00', null);
  });
  afterAll(async () => database.close());

  it('uses the head whose term covers the given time', async () => {
    const march = await service.resolve({ requestorPersonId: ids.nurse, organizationId: ids.section, target: 'DIVISION', at: new Date('2026-03-01T00:00:00Z') });
    const july = await service.resolve({ requestorPersonId: ids.nurse, organizationId: ids.section, target: 'DIVISION', at: new Date('2026-07-01T00:00:00Z') });

    expect(march).toEqual({ approvers: [{ personId: ids.sectionHead, organizationId: ids.section }, { personId: ids.firstDivisionHead, organizationId: ids.division }], skippedOrganizationIds: [], reachedTarget: true });
    expect(july.approvers[1]).toEqual({ personId: ids.secondDivisionHead, organizationId: ids.division });
  });

  it('ignores a head whose term has not started yet', async () => {
    await head(ids.section, ids.futureHead, '2027-01-01 00:00:00', null);

    const result = await service.resolve({ requestorPersonId: ids.nurse, organizationId: ids.section, target: 'NEAREST_HEAD', at: new Date('2026-07-01T00:00:00Z') });

    expect(result.approvers).toEqual([{ personId: ids.sectionHead, organizationId: ids.section }]);
  });

  it('skips a unit whose head is no longer active', async () => {
    const result = await service.resolve({ requestorPersonId: ids.nurse, organizationId: ids.section, target: 'HOSPITAL', at: new Date('2026-07-01T00:00:00Z') });

    expect(result.skippedOrganizationIds).toEqual([ids.hospital]);
    expect(result.reachedTarget).toBe(true);
  });
});
