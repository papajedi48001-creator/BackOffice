import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { randomUUID } from 'node:crypto';
import { loadTravelTypes } from './travel-store';
import { TravelSettingsService } from './travel-settings-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('TravelSettingsService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const actor = randomUUID();

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(database, actor);
  });
  afterAll(async () => {
    await database.execute("UPDATE official_travel_type SET approval_target = 'HOSPITAL' WHERE code = 'ABROAD'");
    await database.close();
  });

  it('sets the final approval level of a travel type and audits it', async () => {
    expect(await new TravelSettingsService(database).setApprovalTarget(actor, 'ABROAD', { approvalTarget: 'DIVISION' })).toEqual({ ok: true });
    expect((await loadTravelTypes(database)).find((type) => type.code === 'ABROAD')?.approvalTarget).toBe('DIVISION');
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'official_travel.type.update' AND actor_person_id = ?", [actor]);
    expect(JSON.parse(audits[0]!.metadata)).toEqual({ travelType: 'ABROAD', changedFields: ['approvalTarget'] });
  });

  it('refuses an unknown travel type', async () => {
    expect(await new TravelSettingsService(database).setApprovalTarget(actor, 'MOON', { approvalTarget: 'DIVISION' })).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
