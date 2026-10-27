import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('fleet schema (migration 0015)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.close();
  });

  const insertVehicle = (registration: string) => db.execute(
    "INSERT INTO fleet_vehicle (id, registration, make_model, kind, seats, status, note, created_at, updated_at) VALUES (?, ?, 'Toyota Commuter', 'VAN', 12, 'ACTIVE', '', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
    [randomUUID(), registration]
  );

  it('refuses two vehicles with the same registration', async () => {
    const registration = `ทด-${randomUUID().slice(0, 8)}`;
    await insertVehicle(registration);
    await expect(insertVehicle(registration)).rejects.toThrow(/Duplicate entry/);
  });

  it('keeps fleet_request.request_id unique but allows many NULLs', async () => {
    const suffix = randomUUID();
    const personId = randomUUID();
    const organizationId = randomUUID();
    const requestId = randomUUID();
    await db.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [personId, `ciphertext-${suffix}`, `hmac-${suffix}`]);
    await db.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, `หน่วย ${suffix}`]);
    await db.execute('INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [requestId, `REQ-${suffix}`, 'fleet', personId, '{}', 'IN_REVIEW']);
    const insertRequest = (linkedRequestId: string | null) => db.execute(
      "INSERT INTO fleet_request (id, reference, requester_person_id, organization_id, request_id, purpose, destination, province, depart_at, return_at, passenger_count, passenger_names, dispatch_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'p', 'd', 'ร้อยเอ็ด', '2030-01-01 01:00:00', '2030-01-01 05:00:00', 1, '', 'WAITING', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
      [randomUUID(), `VR-T-${randomUUID().slice(0, 20)}`, personId, organizationId, linkedRequestId]
    );
    await insertRequest(null);
    await insertRequest(null);
    await insertRequest(requestId);
    await expect(insertRequest(requestId)).rejects.toThrow(/Duplicate entry/);
  });

  it('is a no-op when migrations run again', async () => {
    const [before] = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM schema_migration WHERE version = '0016_fleet.sql'");
    await runMigrations(db);
    const [after] = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM schema_migration WHERE version = '0016_fleet.sql'");
    expect(Number(before?.count)).toBe(1);
    expect(Number(after?.count)).toBe(1);
  });
});
