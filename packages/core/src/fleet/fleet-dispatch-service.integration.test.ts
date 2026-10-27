import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { createLeaveOrganization, createLeavePerson, insertPerson } from '../leave/leave-fixtures';
import { FleetCatalogService } from './fleet-catalog-service';
import { FleetDispatchService } from './fleet-dispatch-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('FleetDispatchService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  // 10:00 Bangkok on 27 October 2026.
  let clock = new Date('2026-10-27T03:00:00Z');
  const service = new FleetDispatchService(database, () => clock);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  let manager: string;
  const run = randomUUID().slice(0, 6);
  const sql = (iso: string) => iso.slice(0, 19).replace('T', ' ');

  /** A ใบ in รอจัดรถ, as filed from ไปราชการ (no head คำขอ). Times are ISO UTC. */
  const waiting = async (departAt = '2026-11-10T01:00:00Z', returnAt = '2026-11-10T09:00:00Z') => {
    const requester = await createLeavePerson(database, org.section);
    const id = randomUUID();
    await database.execute(
      "INSERT INTO fleet_request (id, reference, requester_person_id, organization_id, request_id, official_travel_id, purpose, destination, province, depart_at, return_at, passenger_count, passenger_names, dispatch_status, trip_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, 'ส่งเอกสารลับ', 'สสจ.มหาสารคาม', 'มหาสารคาม', ?, ?, 2, 'นายเอ', 'WAITING', NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
      [id, `VR-T6-${run}-${id.slice(0, 8)}`, requester, org.section, sql(departAt), sql(returnAt)]
    );
    return { id, requester };
  };
  const vehicle = async (status = 'ACTIVE') => {
    const id = randomUUID();
    const registration = `กข ${run}${id.slice(0, 4)}`;
    await database.execute("INSERT INTO fleet_vehicle (id, registration, make_model, kind, seats, status, created_at, updated_at) VALUES (?, ?, 'Toyota', 'VAN', 12, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, registration, status]);
    return { id, registration };
  };
  const driver = async (active = true) => {
    const id = randomUUID();
    await insertPerson(database, id);
    await database.execute("INSERT INTO fleet_driver (person_id, phone, is_active, created_at, updated_at) VALUES (?, '0800000000', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, active ? 1 : 0]);
    return id;
  };
  const newTrip = (vehicleId: string, driverPersonId: string, startsAt = '2026-11-10T01:00:00.000Z', endsAt = '2026-11-10T09:00:00.000Z') => ({ vehicleId, driverPersonId, startsAt, endsAt });
  const assigned = async (fleetRequestId: string, input: Parameters<FleetDispatchService['assign']>[2]) => {
    const result = await service.assign(manager, fleetRequestId, input);
    if (!result.ok) throw new Error(result.code);
    return result.tripId;
  };
  const request = async (id: string) => (await database.query<{ dispatchStatus: string; tripId: string | null }>('SELECT dispatch_status AS dispatchStatus, trip_id AS tripId FROM fleet_request WHERE id = ?', [id]))[0]!;
  const trip = async (id: string) => (await database.query<{ status: string; vehicleId: string; driverPersonId: string; startsAt: Date; endsAt: Date; odometerOut: number | null; odometerIn: number | null; departedAt: Date | null; returnedAt: Date | null }>(
    'SELECT status, vehicle_id AS vehicleId, driver_person_id AS driverPersonId, starts_at AS startsAt, ends_at AS endsAt, odometer_out AS odometerOut, odometer_in AS odometerIn, departed_at AS departedAt, returned_at AS returnedAt FROM fleet_trip WHERE id = ?', [id]))[0]!;
  const history = (id: string) => database.query<{ action: string; reason: string | null; actor: string }>('SELECT action, reason, actor_person_id AS actor FROM fleet_request_history WHERE fleet_request_id = ? ORDER BY created_at, id', [id]);
  const notices = async (subject: string, targetPath: string) => (await database.query<{ payload: string; key: string }>("SELECT payload, idempotency_key AS `key` FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ? AND payload LIKE ?", [`%${subject}%`, `%${targetPath}%`])).map((event) => ({ ...JSON.parse(event.payload), key: event.key }));
  const recipients = async (subject: string, targetPath: string) => (await notices(subject, targetPath)).map((notice) => notice.recipientPersonId).sort();
  const audits = async (action: string, id: string) => (await database.query<{ metadata: string; actor: string }>('SELECT metadata, actor_person_id AS actor FROM audit_event WHERE action = ? AND target_id = ?', [action, id])).map((audit) => ({ actor: audit.actor, metadata: JSON.parse(audit.metadata) }));

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
    manager = randomUUID();
    await insertPerson(database, manager);
  });
  afterAll(async () => { await database.close(); });

  it('assigns a ใบ to a new เที่ยวรถ, tells the requester the registration and the driver of the new job, and audits ids only', async () => {
    const { id, requester } = await waiting();
    const car = await vehicle();
    const driverId = await driver();
    const tripId = await assigned(id, newTrip(car.id, driverId));
    expect(await request(id)).toEqual({ dispatchStatus: 'ASSIGNED', tripId });
    expect(await trip(tripId)).toMatchObject({ status: 'PLANNED', vehicleId: car.id, driverPersonId: driverId });
    expect(new Date((await trip(tripId)).startsAt).toISOString()).toBe('2026-11-10T01:00:00.000Z');
    expect(await recipients(`จัดรถแล้ว > ${car.registration}`, `/fleet/requests/${id}`)).toEqual([requester]);
    expect(await recipients('มีงานขับใหม่', `/fleet/trips/${tripId}`)).toEqual([driverId]);
    expect((await history(id)).map(({ action, actor }) => ({ action, actor }))).toEqual([{ action: 'ASSIGNED', actor: manager }]);
    expect(await audits('fleet.request.assigned', id)).toEqual([{ actor: manager, metadata: { reference: expect.stringMatching(/^VR-T6-/), status: 'ASSIGNED', tripId, registration: car.registration } }]);
    expect(await service.assign(manager, id, newTrip(car.id, driverId))).toEqual({ ok: false, code: 'NOT_PENDING' });
    expect(await service.assign(manager, randomUUID(), newTrip(car.id, driverId))).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('lets a second ใบ join a PLANNED เที่ยวรถ that covers it, and refuses one outside its range', async () => {
    const first = await waiting();
    const inside = await waiting('2026-11-10T02:00:00Z', '2026-11-10T08:00:00Z');
    const outside = await waiting('2026-11-10T08:00:00Z', '2026-11-10T09:15:00Z');
    const tripId = await assigned(first.id, newTrip((await vehicle()).id, await driver()));
    expect(await service.assign(manager, inside.id, { tripId })).toEqual({ ok: true, tripId });
    expect(await request(inside.id)).toEqual({ dispatchStatus: 'ASSIGNED', tripId });
    expect(await service.assign(manager, outside.id, { tripId })).toEqual({ ok: false, code: 'TRIP_DOES_NOT_COVER' });
    expect(await service.assign(manager, outside.id, { tripId: randomUUID() })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await request(outside.id)).toEqual({ dispatchStatus: 'WAITING', tripId: null });
  });

  it('checks a new เที่ยวรถ: range, quarter hours, cover, car status and active driver', async () => {
    const { id } = await waiting();
    const car = await vehicle();
    const driverId = await driver();
    expect(await service.assign(manager, id, newTrip(car.id, driverId, '2026-11-10T09:00:00.000Z', '2026-11-10T01:00:00.000Z'))).toEqual({ ok: false, code: 'INVALID_RANGE' });
    expect(await service.assign(manager, id, newTrip(car.id, driverId, '2026-11-10T00:50:00.000Z'))).toEqual({ ok: false, code: 'NOT_QUARTER_HOUR' });
    expect(await service.assign(manager, id, newTrip(car.id, driverId, '2026-11-10T01:15:00.000Z'))).toEqual({ ok: false, code: 'TRIP_DOES_NOT_COVER' });
    expect(await service.assign(manager, id, newTrip((await vehicle('IN_REPAIR')).id, driverId))).toEqual({ ok: false, code: 'VEHICLE_UNAVAILABLE' });
    expect(await service.assign(manager, id, newTrip(car.id, await driver(false)))).toEqual({ ok: false, code: 'DRIVER_INACTIVE' });
    expect(await service.assign(manager, id, newTrip(car.id, manager))).toEqual({ ok: false, code: 'DRIVER_INACTIVE' });
    expect(await request(id)).toEqual({ dispatchStatus: 'WAITING', tripId: null });
    expect(await service.assign(manager, id, newTrip(car.id, driverId, '2026-11-10T00:00:00.000Z', '2026-11-10T10:00:00.000Z'))).toMatchObject({ ok: true });
  });

  it('refuses an overlapping เที่ยวรถ for the same car or the same driver, but allows back-to-back', async () => {
    const car = await vehicle();
    const driverId = await driver();
    await assigned((await waiting('2026-11-10T01:00:00Z', '2026-11-10T03:00:00Z')).id, newTrip(car.id, driverId, '2026-11-10T01:00:00.000Z', '2026-11-10T03:00:00.000Z'));
    const next = await waiting('2026-11-10T02:45:00Z', '2026-11-10T05:00:00Z');
    expect(await service.assign(manager, next.id, newTrip(car.id, await driver(), '2026-11-10T02:45:00.000Z', '2026-11-10T05:00:00.000Z'))).toEqual({ ok: false, code: 'VEHICLE_BUSY' });
    expect(await service.assign(manager, next.id, newTrip((await vehicle()).id, driverId, '2026-11-10T02:45:00.000Z', '2026-11-10T05:00:00.000Z'))).toEqual({ ok: false, code: 'DRIVER_BUSY' });
    const backToBack = await waiting('2026-11-10T03:00:00Z', '2026-11-10T05:00:00Z');
    expect(await service.assign(manager, backToBack.id, newTrip(car.id, driverId, '2026-11-10T03:00:00.000Z', '2026-11-10T05:00:00.000Z'))).toMatchObject({ ok: true });
  });

  it('lets only one of two concurrent assignments have the same car, and the same driver', async () => {
    const car = await vehicle();
    const [a, b] = await Promise.all([waiting(), waiting('2026-11-10T04:00:00Z', '2026-11-10T10:00:00Z')]);
    const [driverA, driverB] = await Promise.all([driver(), driver()]);
    const results = await Promise.all([
      service.assign(manager, a.id, newTrip(car.id, driverA)),
      service.assign(manager, b.id, newTrip(car.id, driverB, '2026-11-10T04:00:00.000Z', '2026-11-10T10:00:00.000Z'))
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'VEHICLE_BUSY' }]);
    expect(Number((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM fleet_trip WHERE vehicle_id = ? AND status <> 'CANCELLED'", [car.id]))[0]!.count)).toBe(1);

    const driverId = await driver();
    const [c, d] = await Promise.all([waiting(), waiting()]);
    const [carC, carD] = await Promise.all([vehicle(), vehicle()]);
    const raced = await Promise.all([service.assign(manager, c.id, newTrip(carC.id, driverId)), service.assign(manager, d.id, newTrip(carD.id, driverId))]);
    expect(raced.filter((result) => result.ok)).toHaveLength(1);
    expect(raced.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'DRIVER_BUSY' }]);
  });

  it('still assigns and declines a ใบ whose departure passed while it waited', async () => {
    const late = await waiting('2026-10-27T01:00:00Z', '2026-10-27T05:00:00Z');
    expect(await service.assign(manager, late.id, newTrip((await vehicle()).id, await driver(), '2026-10-27T01:00:00.000Z', '2026-10-27T05:00:00.000Z'))).toMatchObject({ ok: true });
    const declined = await waiting('2026-10-26T01:00:00Z', '2026-10-26T05:00:00Z');
    expect(await service.decline(manager, declined.id, 'ไม่มีรถว่าง')).toEqual({ ok: true });
  });

  it('declines with a reason kept in the history only and tells the requester ไม่จัดรถ', async () => {
    const { id, requester } = await waiting();
    expect(await service.decline(manager, id, 'รถติดภารกิจโรงพยาบาล')).toEqual({ ok: true });
    expect(await request(id)).toEqual({ dispatchStatus: 'DECLINED', tripId: null });
    expect(await history(id)).toEqual([{ action: 'DECLINED', reason: 'รถติดภารกิจโรงพยาบาล', actor: manager }]);
    expect(await recipients('ไม่จัดรถ', `/fleet/requests/${id}`)).toEqual([requester]);
    expect(await audits('fleet.request.declined', id)).toEqual([{ actor: manager, metadata: { reference: expect.any(String), status: 'DECLINED' } }]);
    expect(Number((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM outbox_event WHERE payload LIKE '%รถติดภารกิจ%'"))[0]!.count)).toBe(0);
    expect(Number((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM audit_event WHERE metadata LIKE '%รถติดภารกิจ%'"))[0]!.count)).toBe(0);
    expect(await service.decline(manager, id, 'อีกครั้ง')).toEqual({ ok: false, code: 'NOT_PENDING' });
    expect(await service.assign(manager, id, newTrip((await vehicle()).id, await driver()))).toEqual({ ok: false, code: 'NOT_PENDING' });
  });

  it('unassigns the only ใบ: it waits again and its เที่ยวรถ is cancelled, telling the driver', async () => {
    const { id, requester } = await waiting();
    const driverId = await driver();
    const tripId = await assigned(id, newTrip((await vehicle()).id, driverId));
    expect(await service.unassign(manager, id)).toEqual({ ok: true });
    expect(await request(id)).toEqual({ dispatchStatus: 'WAITING', tripId: null });
    expect((await trip(tripId)).status).toBe('CANCELLED');
    expect((await history(id)).map((entry) => entry.action).sort()).toEqual(['ASSIGNED', 'UNASSIGNED']);
    expect(await recipients('ยกเลิกงานขับ', `/fleet/trips/${tripId}`)).toEqual([driverId]);
    expect(await recipients('เปลี่ยนรถหรือเวลา', `/fleet/requests/${id}`)).toEqual([requester]);
    expect(await audits('fleet.request.unassigned', id)).toEqual([{ actor: manager, metadata: { reference: expect.any(String), status: 'WAITING', tripId } }]);
    expect(await service.unassign(manager, id)).toEqual({ ok: false, code: 'NOT_PENDING' });
    // The freed car can be booked again for the same times.
    expect(await service.assign(manager, id, newTrip((await trip(tripId)).vehicleId, driverId))).toMatchObject({ ok: true });
  });

  it('moves a ใบ to another เที่ยวรถ in one step, cancelling the emptied one', async () => {
    const { id, requester } = await waiting();
    const other = await waiting();
    const oldDriver = await driver();
    const newDriver = await driver();
    const car = await vehicle();
    const source = await assigned(id, newTrip(car.id, oldDriver));
    const target = await assigned(other.id, newTrip((await vehicle()).id, newDriver));
    expect(await service.move(manager, id, { tripId: target })).toEqual({ ok: true, tripId: target });
    expect(await request(id)).toEqual({ dispatchStatus: 'ASSIGNED', tripId: target });
    expect((await trip(source)).status).toBe('CANCELLED');
    expect(await recipients('เปลี่ยนรถหรือเวลา', `/fleet/requests/${id}`)).toEqual([requester]);
    // Once for the ใบ already on it, once for the one moved in.
    expect(await recipients('มีงานขับใหม่', `/fleet/trips/${target}`)).toEqual([newDriver, newDriver]);
    expect(await recipients('มีงานขับใหม่', `/fleet/trips/${source}`)).toEqual([oldDriver]);
    expect(await recipients('ยกเลิกงานขับ', `/fleet/trips/${source}`)).toEqual([oldDriver]);
    expect(await notices('จัดรถแล้ว', `/fleet/requests/${id}`)).toHaveLength(1);
    // A move that cannot land leaves everything as it was.
    expect(await service.move(manager, id, newTrip(car.id, oldDriver, '2026-11-10T02:00:00.000Z'))).toEqual({ ok: false, code: 'TRIP_DOES_NOT_COVER' });
    expect(await request(id)).toEqual({ dispatchStatus: 'ASSIGNED', tripId: target });
    expect((await trip(target)).status).toBe('PLANNED');
    // Its old car is free again once the old เที่ยวรถ is gone.
    const moved = await service.move(manager, id, newTrip(car.id, oldDriver));
    expect(moved).toMatchObject({ ok: true });
    expect((await trip(target)).status).toBe('PLANNED');
    expect(await service.move(manager, (await waiting()).id, { tripId: target })).toEqual({ ok: false, code: 'NOT_PENDING' });
  });

  it('changes a PLANNED เที่ยวรถ, rechecking availability and cover, and tells everyone on it', async () => {
    const first = await waiting('2026-11-11T01:00:00Z', '2026-11-11T05:00:00Z');
    const second = await waiting('2026-11-11T02:00:00Z', '2026-11-11T06:00:00Z');
    const oldDriver = await driver();
    const tripId = await assigned(first.id, newTrip((await vehicle()).id, oldDriver, '2026-11-11T01:00:00.000Z', '2026-11-11T06:00:00.000Z'));
    await assigned(second.id, { tripId });
    const busyCar = await vehicle();
    await assigned((await waiting('2026-11-11T05:00:00Z', '2026-11-11T08:00:00Z')).id, newTrip(busyCar.id, await driver(), '2026-11-11T05:00:00.000Z', '2026-11-11T08:00:00.000Z'));
    expect(await service.updateTrip(manager, tripId, { endsAt: '2026-11-11T05:00:00.000Z' })).toEqual({ ok: false, code: 'TRIP_DOES_NOT_COVER' });
    expect(await service.updateTrip(manager, tripId, { startsAt: '2026-11-11T07:00:00.000Z' })).toEqual({ ok: false, code: 'INVALID_RANGE' });
    expect(await service.updateTrip(manager, tripId, { vehicleId: busyCar.id })).toEqual({ ok: false, code: 'VEHICLE_BUSY' });
    expect(await service.updateTrip(manager, randomUUID(), { endsAt: '2026-11-11T07:00:00.000Z' })).toEqual({ ok: false, code: 'NOT_FOUND' });
    // Its own range does not count against it.
    const newDriver = await driver();
    expect(await service.updateTrip(manager, tripId, { endsAt: '2026-11-11T07:00:00.000Z', driverPersonId: newDriver })).toEqual({ ok: true });
    expect(await trip(tripId)).toMatchObject({ status: 'PLANNED', driverPersonId: newDriver });
    expect(new Date((await trip(tripId)).endsAt).toISOString()).toBe('2026-11-11T07:00:00.000Z');
    expect(await recipients('เปลี่ยนรถหรือเวลา', `/fleet/requests/${first.id}`)).toEqual([first.requester]);
    expect(await recipients('เปลี่ยนรถหรือเวลา', `/fleet/requests/${second.id}`)).toEqual([second.requester]);
    expect(await recipients('เปลี่ยนรถหรือเวลา', `/fleet/trips/${tripId}`)).toEqual([newDriver, oldDriver].sort());
    expect(await audits('fleet.trip.updated', tripId)).toEqual([{ actor: manager, metadata: { registration: expect.any(String), status: 'PLANNED', changedFields: ['driverPersonId', 'endsAt'] } }]);
  });

  it('logs ออกเดินทาง and กลับถึง by the driver, with odometer rules, and refuses anyone else', async () => {
    const car = await vehicle();
    const driverId = await driver();
    const { id } = await waiting('2026-10-27T03:00:00Z', '2026-10-27T05:00:00Z');
    const tripId = await assigned(id, newTrip(car.id, driverId, '2026-10-27T03:00:00.000Z', '2026-10-27T05:00:00.000Z'));
    expect(await service.depart(manager, tripId, 1000, false)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.returnTrip(driverId, tripId, 1000, false)).toEqual({ ok: false, code: 'NOT_PENDING' });
    expect(await service.depart(driverId, tripId, 1000, false)).toEqual({ ok: true });
    expect(await trip(tripId)).toMatchObject({ status: 'DEPARTED', odometerOut: 1000 });
    expect(new Date((await trip(tripId)).departedAt!).toISOString()).toBe(clock.toISOString());
    expect(await service.depart(driverId, tripId, 1000, false)).toEqual({ ok: false, code: 'NOT_PENDING' });
    expect(await service.returnTrip(driverId, tripId, 999, false)).toEqual({ ok: false, code: 'ODOMETER_BELOW_OUT' });
    expect(await service.returnTrip(await driver(), tripId, 1100, false)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.returnTrip(driverId, tripId, 1100, false)).toEqual({ ok: true });
    expect(await trip(tripId)).toMatchObject({ status: 'RETURNED', odometerIn: 1100 });
    expect(await audits('fleet.trip.departed', tripId)).toEqual([{ actor: driverId, metadata: { registration: car.registration, status: 'DEPARTED', odometer: 1000 } }]);
    expect(await audits('fleet.trip.returned', tripId)).toEqual([{ actor: driverId, metadata: { registration: car.registration, status: 'RETURNED', odometer: 1100 } }]);

    // The car's next เที่ยวรถ starts from at least the last reading; a manager may log it for the driver.
    const later = await waiting('2026-10-27T06:00:00Z', '2026-10-27T08:00:00Z');
    const nextTrip = await assigned(later.id, newTrip(car.id, driverId, '2026-10-27T06:00:00.000Z', '2026-10-27T08:00:00.000Z'));
    clock = new Date('2026-10-27T05:30:00Z');
    expect(await service.depart(manager, nextTrip, 1099, true)).toEqual({ ok: false, code: 'ODOMETER_BELOW_LAST' });
    expect(await service.depart(manager, nextTrip, 1100, true)).toEqual({ ok: true });
    clock = new Date('2026-10-27T03:00:00Z');
    expect(await service.unassign(manager, later.id)).toEqual({ ok: false, code: 'NOT_PENDING' });
  });

  it('edits a เที่ยวรถ while its driver is being deactivated without deadlocking', async () => {
    const catalog = new FleetCatalogService(database);
    // The race cannot be forced, so it is run a number of times; each round either order must finish cleanly.
    for (let round = 0; round < 15; round += 1) {
      const driverId = await driver();
      const { id } = await waiting();
      const tripId = await assigned(id, newTrip((await vehicle()).id, driverId));
      const [edited, deactivated] = await Promise.all([
        service.updateTrip(manager, tripId, { endsAt: '2026-11-10T10:00:00.000Z' }),
        catalog.upsertDriver(manager, { personId: driverId, phone: '0800000000', isActive: false })
      ]);
      expect(edited).toEqual({ ok: true });
      expect(deactivated).toEqual({ ok: false, code: 'DRIVER_HAS_TRIPS' });
    }
  });

  it('refuses ออกเดินทาง more than two hours before the start', async () => {
    const driverId = await driver();
    const { id } = await waiting('2026-10-27T06:00:00Z', '2026-10-27T08:00:00Z');
    const tripId = await assigned(id, newTrip((await vehicle()).id, driverId, '2026-10-27T06:00:00.000Z', '2026-10-27T08:00:00.000Z'));
    expect(await service.depart(driverId, tripId, 10, false)).toEqual({ ok: false, code: 'DEPARTURE_TOO_EARLY' });
    clock = new Date('2026-10-27T04:00:00Z');
    expect(await service.depart(driverId, tripId, 10, false)).toEqual({ ok: true });
    clock = new Date('2026-10-27T03:00:00Z');
  });
});
