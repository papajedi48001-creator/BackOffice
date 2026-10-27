import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { randomUUID } from 'node:crypto';
import { insertPerson } from '../leave/leave-fixtures';
import { FleetCatalogService } from './fleet-catalog-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('FleetCatalogService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new FleetCatalogService(database);
  const actor = randomUUID();
  const driver = randomUUID();
  const run = randomUUID().slice(0, 6);
  const input = (registration: string) => ({ registration, makeModel: 'Toyota Commuter', kind: 'VAN' as const, seats: 12, status: 'ACTIVE' as const, note: '' });
  const auditsFor = async (action: string, targetId: string) => (await database.query<{ metadata: string; target_type: string }>('SELECT metadata, target_type FROM audit_event WHERE action = ? AND target_id = ?', [action, targetId]));

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(database, actor);
    await insertPerson(database, driver);
  });
  afterAll(async () => {
    await database.execute('DELETE FROM fleet_trip WHERE driver_person_id = ?', [driver]);
    await database.execute('DELETE FROM fleet_driver WHERE person_id = ?', [driver]);
    await database.execute('DELETE FROM fleet_vehicle WHERE registration LIKE ?', [`T4${run}%`]);
    await database.close();
  });

  it('creates a vehicle and audits it', async () => {
    const result = await service.createVehicle(actor, input(`T4${run}-A`));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await database.query<{ registration: string; seats: number }>('SELECT registration, seats FROM fleet_vehicle WHERE id = ?', [result.vehicleId]);
    expect(row).toMatchObject({ registration: `T4${run}-A`, seats: 12 });
    const audits = await auditsFor('fleet.vehicle.create', result.vehicleId);
    expect(audits[0]!.target_type).toBe('fleet_vehicle');
    expect(JSON.parse(audits[0]!.metadata)).toEqual({ registration: `T4${run}-A`, status: 'ACTIVE' });
  });

  it('refuses a duplicate registration on create and on update, including a race', async () => {
    const first = await service.createVehicle(actor, input(`T4${run}-B`));
    const second = await service.createVehicle(actor, input(`T4${run}-C`));
    if (!first.ok || !second.ok) throw new Error('setup');
    expect(await service.createVehicle(actor, input(`T4${run}-B`))).toEqual({ ok: false, code: 'DUPLICATE_REGISTRATION' });
    expect(await service.updateVehicle(actor, second.vehicleId, input(`T4${run}-B`))).toEqual({ ok: false, code: 'DUPLICATE_REGISTRATION' });
    const raced = await Promise.all([service.createVehicle(actor, input(`T4${run}-D`)), service.createVehicle(actor, input(`T4${run}-D`))]);
    expect(raced.filter((result) => result.ok)).toHaveLength(1);
    expect(raced.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'DUPLICATE_REGISTRATION' }]);
  });

  it('moves a vehicle to IN_REPAIR and audits registration and status', async () => {
    const created = await service.createVehicle(actor, input(`T4${run}-E`));
    if (!created.ok) throw new Error('setup');
    expect(await service.updateVehicle(actor, created.vehicleId, { ...input(`T4${run}-E`), status: 'IN_REPAIR', note: 'เปลี่ยนยาง' })).toEqual({ ok: true });
    const [row] = await database.query<{ status: string; note: string }>('SELECT status, note FROM fleet_vehicle WHERE id = ?', [created.vehicleId]);
    expect(row).toEqual({ status: 'IN_REPAIR', note: 'เปลี่ยนยาง' });
    const audits = await auditsFor('fleet.vehicle.update', created.vehicleId);
    expect(JSON.parse(audits[0]!.metadata)).toEqual({ registration: `T4${run}-E`, status: 'IN_REPAIR' });
  });

  it('refuses to update an unknown vehicle', async () => {
    expect(await service.updateVehicle(actor, randomUUID(), input(`T4${run}-Z`))).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('adds a driver, updates it, and never audits the phone', async () => {
    expect(await service.upsertDriver(actor, { personId: driver, phone: '081-234-5678', isActive: true })).toEqual({ ok: true });
    expect(await service.upsertDriver(actor, { personId: driver, phone: '089-999-0000', isActive: true })).toEqual({ ok: true });
    const [row] = await database.query<{ phone: string; is_active: number }>('SELECT phone, is_active FROM fleet_driver WHERE person_id = ?', [driver]);
    expect(row).toEqual({ phone: '089-999-0000', is_active: 1 });
    const created = await auditsFor('fleet.driver.create', driver);
    const updated = await auditsFor('fleet.driver.update', driver);
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(JSON.parse(created[0]!.metadata)).toEqual({ isActive: true });
    expect(updated[0]!.metadata).not.toContain('089');
  });

  it('refuses an unknown person', async () => {
    expect(await service.upsertDriver(actor, { personId: randomUUID(), phone: '081', isActive: true })).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('refuses to deactivate a driver with a PLANNED or DEPARTED trip, then allows it when none remain', async () => {
    const vehicle = await service.createVehicle(actor, input(`T4${run}-F`));
    if (!vehicle.ok) throw new Error('setup');
    const tripId = randomUUID();
    await database.execute("INSERT INTO fleet_trip (id, vehicle_id, driver_person_id, starts_at, ends_at, status, created_by_person_id, created_at, updated_at) VALUES (?, ?, ?, '2030-01-01 01:00:00', '2030-01-01 05:00:00', 'PLANNED', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [tripId, vehicle.vehicleId, driver, actor]);
    expect(await service.upsertDriver(actor, { personId: driver, phone: '089-999-0000', isActive: false })).toEqual({ ok: false, code: 'DRIVER_HAS_TRIPS' });
    await database.execute("UPDATE fleet_trip SET status = 'DEPARTED' WHERE id = ?", [tripId]);
    expect(await service.upsertDriver(actor, { personId: driver, phone: '089-999-0000', isActive: false })).toEqual({ ok: false, code: 'DRIVER_HAS_TRIPS' });
    await database.execute("UPDATE fleet_trip SET status = 'RETURNED' WHERE id = ?", [tripId]);
    expect(await service.upsertDriver(actor, { personId: driver, phone: '089-999-0000', isActive: false })).toEqual({ ok: true });
    const [row] = await database.query<{ is_active: number }>('SELECT is_active FROM fleet_driver WHERE person_id = ?', [driver]);
    expect(row!.is_active).toBe(0);
  });
});
