import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, insertPerson } from '../leave/leave-fixtures';
import { OfficialTravelService } from '../official-travel/travel-service';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { FleetDispatchService } from './fleet-dispatch-service';
import { FleetQueries } from './fleet-queries';
import { FleetRequestService } from './fleet-request-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('FleetQueries against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  // 10:00 Bangkok on 27 October 2026.
  const now = new Date('2026-10-27T03:00:00Z');
  const queries = new FleetQueries(database, () => now);
  const requests = new FleetRequestService(database, commandChainResolver(database), () => now);
  const dispatch = new FleetDispatchService(database, () => now);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  let manager: string;
  const run = randomUUID().slice(0, 6);
  const sql = (iso: string) => iso.slice(0, 19).replace('T', ' ');
  const subject = (personId: string, manage = false) => ({ authenticated: true, personId, roles: manage ? [{ name: 'fleet-manager', organizationId: null }] : [], dataOwnerModules: [] as string[] });
  const draft = { purpose: 'ส่งเอกสารลับ', destination: 'สสจ.มหาสารคาม', province: 'มหาสารคาม', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z', passengerCount: 2, passengerNames: 'นายเอ นายบี' };

  /** A ใบ in รอจัดรถ without a head คำขอ (as filed from ไปราชการ). */
  const waiting = async (departAt = '2026-11-10T01:00:00Z', returnAt = '2026-11-10T09:00:00Z', province = 'มหาสารคาม') => {
    const requester = await createLeavePerson(database, org.section);
    const id = randomUUID();
    await database.execute(
      "INSERT INTO fleet_request (id, reference, requester_person_id, organization_id, request_id, official_travel_id, purpose, destination, province, depart_at, return_at, passenger_count, passenger_names, dispatch_status, trip_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, 'ส่งเอกสารลับ', 'สสจ.มหาสารคาม', ?, ?, ?, 2, 'นายเอ', 'WAITING', NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
      [id, `VR-T7-${run}-${id.slice(0, 8)}`, requester, org.section, province, sql(departAt), sql(returnAt)]
    );
    return { id, requester };
  };
  const vehicle = async (status = 'ACTIVE') => {
    const id = randomUUID();
    const registration = `ทด ${run}${id.slice(0, 4)}`;
    await database.execute("INSERT INTO fleet_vehicle (id, registration, make_model, kind, seats, status, created_at, updated_at) VALUES (?, ?, 'Toyota Commuter', 'VAN', 12, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, registration, status]);
    return { id, registration };
  };
  const driver = async (active = true, phone = '0800000000') => {
    const id = randomUUID();
    await insertPerson(database, id);
    await database.execute("INSERT INTO fleet_driver (person_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [id, phone, active ? 1 : 0]);
    return id;
  };
  const assign = async (fleetRequestId: string, vehicleId: string, driverPersonId: string, startsAt = '2026-11-10T01:00:00.000Z', endsAt = '2026-11-10T09:00:00.000Z') => {
    const result = await dispatch.assign(manager, fleetRequestId, { vehicleId, driverPersonId, startsAt, endsAt });
    if (!result.ok) throw new Error(result.code);
    return result.tripId;
  };
  const filed = async (personId: string) => {
    const result = await requests.submit(personId, draft);
    if (!result.ok) throw new Error(result.code);
    return result.fleetRequestId;
  };

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
    manager = randomUUID();
    await insertPerson(database, manager);
    if ((await database.query('SELECT id FROM role WHERE name = ?', ['fleet-manager'])).length === 0) await database.execute("INSERT INTO role (id, name, created_at) VALUES (UUID(), 'fleet-manager', UTC_TIMESTAMP())");
    await database.execute("INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) SELECT UUID(), ?, id, NULL, UTC_TIMESTAMP() FROM role WHERE name = 'fleet-manager' LIMIT 1", [manager]);
  });
  afterAll(async () => { await database.close(); });

  it('shows a ใบ only to its requester, head-stage assignee, active ผู้แทน, driver and the หัวหน้าหมวด', async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    const outsider = await createLeavePerson(database, org.section);
    const deputy = await createLeavePerson(database, org.section);
    const expired = await createLeavePerson(database, org.section);
    await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (?, ?, ?, 'fleet', 'ลาพักร้อน', UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP())", [randomUUID(), org.sectionHead, deputy]);
    await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (?, ?, ?, 'fleet', 'เก่า', UTC_TIMESTAMP() - INTERVAL 3 DAY, UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP())", [randomUUID(), org.sectionHead, expired]);
    expect(await queries.detail(id, subject(outsider))).toBeNull();
    expect(await queries.detail(id, subject(expired))).toBeNull();
    expect(await queries.detail(id, { authenticated: false, roles: [], dataOwnerModules: [] })).toBeNull();
    expect(await queries.detail(randomUUID(), subject(requester))).toBeNull();
    for (const viewer of [requester, org.sectionHead, deputy]) expect(await queries.detail(id, subject(viewer))).toMatchObject({ id, status: 'HEAD_REVIEW', purpose: 'ส่งเอกสารลับ', passengerNames: 'นายเอ นายบี' });
    expect(await queries.detail(id, subject(manager, true))).toMatchObject({ id });
    expect(await queries.detail(id, subject(manager, false))).toBeNull();
    const own = await queries.detail(id, subject(requester));
    expect(own).toMatchObject({ canCancel: true, canResubmit: false, canDispatch: false, trip: null, departAt: '2026-11-10T01:00:00.000Z', contactPhone: '' });
    expect(await queries.detail(id, subject(org.sectionHead))).toMatchObject({ canCancel: false, canResubmit: false, canDispatch: false });
    expect(await queries.detail(id, subject(manager, true))).toMatchObject({ canCancel: false, canDispatch: false });
  });

  it('shows the driver the ใบ on their เที่ยวรถ, with the car and phone, and lets the หัวหน้าหมวด dispatch a waiting ใบ', async () => {
    const { id, requester } = await waiting();
    const car = await vehicle();
    const driverId = await driver(true, '0811111111');
    expect(await queries.detail(id, subject(driverId))).toBeNull();
    expect(await queries.detail(id, subject(manager, true))).toMatchObject({ status: 'WAITING', canDispatch: true, canCancel: false });
    expect(await queries.detail(id, subject(requester))).toMatchObject({ status: 'WAITING', canCancel: true, canDispatch: false });
    const tripId = await assign(id, car.id, driverId);
    const seen = await queries.detail(id, subject(driverId));
    expect(seen).toMatchObject({ status: 'ASSIGNED', canDispatch: false, trip: { id: tripId, registration: car.registration, makeModel: 'Toyota Commuter', driverPhone: '0811111111', status: 'PLANNED' } });
    expect(seen?.trip?.driverName).toMatch(/^บุคลากร/);
    expect(seen?.history.map((entry) => entry.action)).toEqual(['ASSIGNED']);
  });

  it('closes a cancelled ใบ to the driver of the เที่ยวรถ it was cancelled off', async () => {
    const { id, requester } = await waiting();
    const driverId = await driver();
    await assign(id, (await vehicle()).id, driverId);
    expect(await queries.detail(id, subject(driverId))).toMatchObject({ id });
    expect(await requests.cancel(requester, id, 'เหตุผลลับ')).toEqual({ ok: true });
    expect(await queries.detail(id, subject(driverId))).toBeNull();
    expect(await queries.detail(id, subject(requester))).toMatchObject({ status: 'CANCELLED', trip: null });
  });

  it('lists the history in order with reasons, and the requester may resubmit only a returned ใบ', async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    const [row] = await database.query<{ requestId: string }>('SELECT request_id AS requestId FROM fleet_request WHERE id = ?', [id]);
    await new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null }).decideRequest({ requestId: row!.requestId, actorPersonId: org.sectionHead, decision: 'RETURN', reason: 'แก้เวลา' });
    expect(await queries.detail(id, subject(requester))).toMatchObject({ status: 'RETURNED', canResubmit: true, canCancel: true });
    expect(await requests.cancel(requester, id, 'ไม่ไปแล้ว')).toEqual({ ok: true });
    const cancelled = await queries.detail(id, subject(requester));
    expect(cancelled).toMatchObject({ status: 'CANCELLED', canResubmit: false, canCancel: false });
    expect(cancelled?.history.map((entry) => [entry.action, entry.reason])).toEqual([['SUBMITTED', null], ['CANCELLED', 'ไม่ไปแล้ว']]);
    expect(cancelled?.history[0]?.actorName).toMatch(/^บุคลากร/);
  });

  it('lists my ใบ newest first and maps a request id to its ใบ', async () => {
    const requester = await createLeavePerson(database, org.section);
    const first = await filed(requester);
    await database.execute("UPDATE fleet_request SET created_at = created_at - INTERVAL 1 HOUR WHERE id = ?", [first]);
    const second = await filed(requester);
    const list = await queries.mine(requester);
    expect(list.map((item) => item.id)).toEqual([second, first]);
    expect(list[0]).toEqual({ id: second, reference: expect.stringMatching(/^VR-2570-/), purpose: 'ส่งเอกสารลับ', destination: 'สสจ.มหาสารคาม', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z', status: 'HEAD_REVIEW' });
    const [row] = await database.query<{ requestId: string }>('SELECT request_id AS requestId FROM fleet_request WHERE id = ?', [first]);
    expect(await queries.idOfHeadRequest(row!.requestId)).toBe(first);
    expect(await queries.idOfHeadRequest(randomUUID())).toBeNull();
    expect(await queries.mine(randomUUID())).toEqual([]);
  });

  it('counts only ใบ in รอจัดรถ, not those waiting on the head', async () => {
    const before = await queries.waitingCount();
    await filed(await createLeavePerson(database, org.section));
    expect(await queries.waitingCount()).toBe(before);
    await waiting();
    expect(await queries.waitingCount()).toBe(before + 1);
  });

  it('marks a queue item departing within a day soon and a past one overdue, sorted by departure', async () => {
    const soon = await waiting('2026-10-27T06:00:00Z', '2026-10-27T09:00:00Z');
    const overdue = await waiting('2026-10-27T00:00:00Z', '2026-10-27T02:00:00Z');
    const later = await waiting('2026-11-20T01:00:00Z', '2026-11-20T09:00:00Z');
    const head = await filed(await createLeavePerson(database, org.section));
    const dashboard = await queries.dashboard();
    const find = (id: string) => dashboard.queue.find((item) => item.id === id);
    expect(find(soon.id)).toMatchObject({ soon: true, overdue: false, departAt: '2026-10-27T06:00:00.000Z', returnAt: '2026-10-27T09:00:00.000Z', passengerCount: 2, province: 'มหาสารคาม', destination: 'สสจ.มหาสารคาม', purpose: 'ส่งเอกสารลับ' });
    expect(find(soon.id)?.requesterName).toMatch(/^บุคลากร/);
    expect(find(soon.id)?.organizationName).toBe(`งาน ${org.section}`);
    expect(find(overdue.id)).toMatchObject({ soon: false, overdue: true });
    expect(find(later.id)).toMatchObject({ soon: false, overdue: false });
    expect(find(head)).toBeUndefined();
    const order = dashboard.queue.map((item) => item.id);
    expect(order.indexOf(overdue.id)).toBeLessThan(order.indexOf(soon.id));
    expect(order.indexOf(soon.id)).toBeLessThan(order.indexOf(later.id));
  });

  it('builds the board for today, counts and flags เที่ยวรถ on a car that is no longer ACTIVE', async () => {
    const before = (await queries.dashboard()).counts;
    const active = await vehicle();
    const repair = await vehicle();
    const retired = await vehicle('RETIRED');
    const driverId = await driver();
    const a = await waiting('2026-10-27T06:00:00Z', '2026-10-27T09:00:00Z');
    const b = await waiting('2026-10-27T06:00:00Z', '2026-10-27T09:00:00Z');
    const c = await waiting('2026-10-28T06:00:00Z', '2026-10-28T09:00:00Z');
    const tripId = await assign(a.id, active.id, driverId, '2026-10-27T06:00:00.000Z', '2026-10-27T09:00:00.000Z');
    expect(await dispatch.assign(manager, b.id, { tripId })).toEqual({ ok: true, tripId });
    const flaggedTrip = await assign(c.id, repair.id, await driver(), '2026-10-28T06:00:00.000Z', '2026-10-28T09:00:00.000Z');
    await database.execute("UPDATE fleet_vehicle SET status = 'IN_REPAIR' WHERE id = ?", [repair.id]);
    const dashboard = await queries.dashboard();
    expect(dashboard.counts.tripsToday).toBe(before.tripsToday + 1);
    expect(dashboard.counts.inRepair).toBe(before.inRepair + 1);
    expect(dashboard.counts.out).toBe(before.out);
    const row = dashboard.board.find((entry) => entry.vehicle.id === active.id);
    expect(row?.vehicle).toMatchObject({ registration: active.registration, status: 'ACTIVE' });
    expect(row?.trips).toEqual([{ id: tripId, startsAt: '2026-10-27T06:00:00.000Z', endsAt: '2026-10-27T09:00:00.000Z', driverName: expect.stringMatching(/^บุคลากร/), status: 'PLANNED', requestCount: 2 }]);
    expect(dashboard.board.find((entry) => entry.vehicle.id === repair.id)).toMatchObject({ trips: [] });
    expect(dashboard.board.some((entry) => entry.vehicle.id === retired.id)).toBe(false);
    expect(dashboard.flagged.map((trip) => trip.id)).toContain(flaggedTrip);
    expect(dashboard.flagged.map((trip) => trip.id)).not.toContain(tripId);
    expect(dashboard.flagged.find((trip) => trip.id === flaggedTrip)).toMatchObject({ registration: repair.registration, vehicleStatus: 'IN_REPAIR', status: 'PLANNED' });
    await database.execute("UPDATE fleet_trip SET status = 'DEPARTED' WHERE id = ?", [tripId]);
    expect((await queries.dashboard()).counts.out).toBe(before.out + 1);
  });

  it('hides a busy car and driver from availability and lists the PLANNED เที่ยวรถ that cover the range', async () => {
    const busyCar = await vehicle();
    const freeCar = await vehicle();
    const busyDriver = await driver();
    const freeDriver = await driver();
    const inactive = await driver(false);
    const repairCar = await vehicle('IN_REPAIR');
    const { id } = await waiting('2026-12-01T01:00:00Z', '2026-12-01T09:00:00Z');
    const tripId = await assign(id, busyCar.id, busyDriver, '2026-12-01T01:00:00.000Z', '2026-12-01T09:00:00.000Z');
    const during = await queries.availability(new Date('2026-12-01T02:00:00Z'), new Date('2026-12-01T05:00:00Z'));
    expect(during.vehicles.map((car) => car.id)).toContain(freeCar.id);
    expect(during.vehicles.map((car) => car.id)).not.toContain(busyCar.id);
    expect(during.vehicles.map((car) => car.id)).not.toContain(repairCar.id);
    expect(during.vehicles.find((car) => car.id === freeCar.id)).toEqual({ id: freeCar.id, registration: freeCar.registration, makeModel: 'Toyota Commuter', kind: 'VAN', seats: 12 });
    expect(during.drivers.map((entry) => entry.personId)).toContain(freeDriver);
    expect(during.drivers.map((entry) => entry.personId)).not.toContain(busyDriver);
    expect(during.drivers.map((entry) => entry.personId)).not.toContain(inactive);
    expect(during.trips.find((entry) => entry.id === tripId)).toEqual({ id: tripId, registration: busyCar.registration, driverName: expect.stringMatching(/^บุคลากร/), startsAt: '2026-12-01T01:00:00.000Z', endsAt: '2026-12-01T09:00:00.000Z' });
    const after = await queries.availability(new Date('2026-12-01T09:00:00Z'), new Date('2026-12-01T12:00:00Z'));
    expect(after.vehicles.map((car) => car.id)).toContain(busyCar.id);
    expect(after.drivers.map((entry) => entry.personId)).toContain(busyDriver);
    expect(after.trips.map((entry) => entry.id)).not.toContain(tripId);
    const partly = await queries.availability(new Date('2026-12-01T05:00:00Z'), new Date('2026-12-01T12:00:00Z'));
    expect(partly.trips.map((entry) => entry.id)).not.toContain(tripId);
  });

  it('gives the calendar only the car, time, province and status', async () => {
    const car = await vehicle();
    const one = await waiting('2026-11-10T01:00:00Z', '2026-11-10T09:00:00Z', 'ขอนแก่น');
    const two = await waiting('2026-11-10T02:00:00Z', '2026-11-10T08:00:00Z', 'มหาสารคาม');
    const three = await waiting('2026-11-10T02:00:00Z', '2026-11-10T08:00:00Z', 'ขอนแก่น');
    const outside = await waiting('2026-11-20T01:00:00Z', '2026-11-20T09:00:00Z');
    const tripId = await assign(one.id, car.id, await driver());
    await dispatch.assign(manager, two.id, { tripId });
    await dispatch.assign(manager, three.id, { tripId });
    await assign(outside.id, car.id, await driver(), '2026-11-20T01:00:00.000Z', '2026-11-20T09:00:00.000Z');
    const week = await queries.calendar('2026-11-09');
    const row = week.find((entry) => entry.vehicle.id === car.id);
    expect(row?.vehicle).toEqual({ id: car.id, registration: car.registration, makeModel: 'Toyota Commuter', status: 'ACTIVE' });
    expect(row?.blocks).toEqual([{ startsAt: '2026-11-10T01:00:00.000Z', endsAt: '2026-11-10T09:00:00.000Z', province: 'ขอนแก่น, มหาสารคาม', status: 'PLANNED' }]);
    expect(Object.keys(row!.blocks[0]!).sort()).toEqual(['endsAt', 'province', 'startsAt', 'status']);
    expect(JSON.stringify(week.find((entry) => entry.vehicle.id === car.id))).not.toMatch(/ส่งเอกสารลับ|สสจ|บุคลากร/);
    const edge = await queries.calendar('2026-11-10');
    expect(edge.find((entry) => entry.vehicle.id === car.id)?.blocks).toHaveLength(1);
    expect((await queries.calendar('2026-11-11')).find((entry) => entry.vehicle.id === car.id)?.blocks).toEqual([]);
    expect((await queries.calendar('2026-11-03')).find((entry) => entry.vehicle.id === car.id)?.blocks).toEqual([]);
    await expect(queries.calendar('10/11/2026')).rejects.toThrow();
  });

  it('lists my driving with requester names and the ใบ contact phone, never the profile phone, and a trip only to the driver or the หัวหน้าหมวด', async () => {
    const car = await vehicle();
    const driverId = await driver();
    const todayTrip = await waiting('2026-10-27T06:00:00Z', '2026-10-27T10:00:00Z');
    const later = await waiting('2026-11-05T01:00:00Z', '2026-11-05T09:00:00Z');
    const old = await waiting('2026-10-20T01:00:00Z', '2026-10-20T09:00:00Z');
    await database.execute("UPDATE hr_person_profile SET phone = '0899999999' WHERE person_id IN (?, ?)", [todayTrip.requester, later.requester]);
    await database.execute("UPDATE fleet_request SET contact_phone = '0822222222' WHERE id = ?", [todayTrip.id]);
    const t1 = await assign(todayTrip.id, car.id, driverId, '2026-10-27T06:00:00.000Z', '2026-10-27T10:00:00.000Z');
    const t2 = await assign(later.id, car.id, driverId, '2026-11-05T01:00:00.000Z', '2026-11-05T09:00:00.000Z');
    const t3 = await assign(old.id, car.id, driverId, '2026-10-20T01:00:00.000Z', '2026-10-20T09:00:00.000Z');
    await database.execute("UPDATE fleet_trip SET status = 'RETURNED', returned_at = '2026-10-20 08:00:00' WHERE id = ?", [t3]);
    expect(await queries.driverTodayCount(driverId)).toBe(1);
    expect(await queries.driverTodayCount(randomUUID())).toBe(0);
    const mine = await queries.driving(driverId);
    expect(mine.map((entry) => entry.id)).toEqual([t1, t2]);
    expect(mine[0]).toMatchObject({ registration: car.registration, makeModel: 'Toyota Commuter', status: 'PLANNED', startsAt: '2026-10-27T06:00:00.000Z', endsAt: '2026-10-27T10:00:00.000Z' });
    expect(mine[0]?.requests).toEqual([{ id: todayTrip.id, reference: expect.stringMatching(/^VR-T7-/), requesterName: expect.stringMatching(/^บุคลากร/), contactPhone: '0822222222', destination: 'สสจ.มหาสารคาม', passengerCount: 2 }]);
    expect(mine[1]?.requests[0]?.contactPhone).toBe('');
    expect(JSON.stringify(mine)).not.toContain('0899999999');
    await database.execute("UPDATE fleet_trip SET status = 'RETURNED', returned_at = '2026-10-27 05:00:00' WHERE id = ?", [t1]);
    expect((await queries.driving(driverId)).map((entry) => entry.id)).toEqual([t1, t2]);
    expect(await queries.driving(randomUUID())).toEqual([]);
    await database.execute("UPDATE fleet_trip SET status = 'DEPARTED', returned_at = NULL, ends_at = '2026-10-26 09:00:00' WHERE id = ?", [t1]);
    expect((await queries.driving(driverId)).map((entry) => entry.id)).toEqual([t1, t2]);
    await database.execute("UPDATE fleet_trip SET status = 'PLANNED' WHERE id = ?", [t1]);
    expect((await queries.driving(driverId)).map((entry) => entry.id)).toEqual([t2]);

    expect(await queries.trip(t2, subject(driverId))).toMatchObject({ id: t2, registration: car.registration, status: 'PLANNED' });
    expect(await queries.trip(t2, subject(manager, true))).toMatchObject({ id: t2 });
    expect(JSON.stringify(await queries.trip(t2, subject(manager, true)))).not.toContain('0899999999');
    expect(await queries.trip(t2, subject(todayTrip.requester))).toBeNull();
    expect(await queries.trip(t2, subject(await driver()))).toBeNull();
    expect(await queries.trip(randomUUID(), subject(manager, true))).toBeNull();
  });

  it('lists cars and drivers', async () => {
    const car = await vehicle('RETIRED');
    const driverId = await driver(false, '0833333333');
    expect((await queries.vehicles()).find((entry) => entry.id === car.id)).toEqual({ id: car.id, registration: car.registration, makeModel: 'Toyota Commuter', kind: 'VAN', seats: 12, status: 'RETIRED', note: '' });
    expect((await queries.drivers()).find((entry) => entry.personId === driverId)).toEqual({ personId: driverId, displayName: expect.stringMatching(/^บุคลากร/), phone: '0833333333', isActive: false });
  });

  it('tells whether a person is an active พนักงานขับรถ', async () => {
    expect(await queries.isActiveDriver(await driver(true))).toBe(true);
    expect(await queries.isActiveDriver(await driver(false))).toBe(false);
    expect(await queries.isActiveDriver(randomUUID())).toBe(false);
  });

  it('finds the live ใบ filed for a คำขอไปราชการ, and none once it is cancelled', async () => {
    const leader = await createLeavePerson(database, org.section);
    const filedTravel = await new OfficialTravelService(database, commandChainResolver(database)).submit(leader, { subject: 'ประชุมวิชาการ', organiser: 'สสจ.', place: 'โรงแรม', province: 'ขอนแก่น', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', startDate: '2026-11-10', endDate: '2026-11-11', memberPersonIds: [] });
    if (!filedTravel.ok) throw new Error(filedTravel.code);
    const travelId = filedTravel.travelId;
    await database.execute("UPDATE request r JOIN official_travel_member m ON m.request_id = r.id SET r.status = 'APPROVED' WHERE m.travel_id = ?", [travelId]);
    expect(await queries.activeRequestForTravel(travelId)).toBeNull();
    const result = await requests.submit(leader, { ...draft, officialTravelId: travelId });
    if (!result.ok) throw new Error(result.code);
    expect(await queries.activeRequestForTravel(travelId)).toEqual({ id: result.fleetRequestId, reference: expect.stringMatching(/^VR-/), requesterPersonId: leader });
    expect(await requests.cancel(leader, result.fleetRequestId, 'ไม่ไปแล้ว')).toEqual({ ok: true });
    expect(await queries.activeRequestForTravel(travelId)).toBeNull();
  });
  it('lets only the pending head step\'s assignee or an active ผู้แทน decide, and only while the head คำขอ is in review', async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    const deputy = await createLeavePerson(database, org.section);
    await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (?, ?, ?, 'fleet', 'ประชุม', UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP())", [randomUUID(), org.sectionHead, deputy]);
    expect(await queries.detail(id, subject(org.sectionHead))).toMatchObject({ canDecide: true });
    expect(await queries.detail(id, subject(deputy))).toMatchObject({ canDecide: true });
    expect(await queries.detail(id, subject(requester))).toMatchObject({ canDecide: false });
    expect(await queries.detail(id, subject(manager, true))).toMatchObject({ canDecide: false });
    const [row] = await database.query<{ requestId: string }>('SELECT request_id AS requestId FROM fleet_request WHERE id = ?', [id]);
    await new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null }).decideRequest({ requestId: row!.requestId, actorPersonId: org.sectionHead, decision: 'APPROVE' });
    const decided = await queries.detail(id, subject(org.sectionHead));
    expect(decided).toMatchObject({ status: 'WAITING', canDecide: false });
    expect((await queries.detail((await waiting()).id, subject(manager, true)))?.canDecide).toBe(false);
  });
});
