// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(),
  submit: vi.fn(), resubmit: vi.fn(), cancel: vi.fn(),
  assign: vi.fn(), unassign: vi.fn(), move: vi.fn(), decline: vi.fn(), updateTrip: vi.fn(), depart: vi.fn(), returnTrip: vi.fn(),
  createVehicle: vi.fn(), updateVehicle: vi.fn(), upsertDriver: vi.fn(),
  detail: vi.fn(), availability: vi.fn(), people: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  FleetRequestService: class { submit = mocks.submit; resubmit = mocks.resubmit; cancel = mocks.cancel; },
  FleetDispatchService: class { assign = mocks.assign; unassign = mocks.unassign; move = mocks.move; decline = mocks.decline; updateTrip = mocks.updateTrip; depart = mocks.depart; returnTrip = mocks.returnTrip; },
  FleetCatalogService: class { createVehicle = mocks.createVehicle; updateVehicle = mocks.updateVehicle; upsertDriver = mocks.upsertDriver; },
  FleetQueries: class { detail = mocks.detail; availability = mocks.availability; },
  OfficialTravelQueries: class { people = mocks.people; }
}));

import { POST as FILE } from './requests/route';
import { GET as DETAIL, PUT as RESUBMIT } from './requests/[id]/route';
import { POST as CANCEL } from './requests/[id]/cancellation/route';
import { DELETE as UNASSIGN, POST as ASSIGN, PUT as MOVE } from './requests/[id]/assignment/route';
import { POST as DECLINE } from './requests/[id]/decline/route';
import { PATCH as PATCH_TRIP } from './trips/[id]/route';
import { POST as DEPART } from './trips/[id]/departure/route';
import { POST as RETURN } from './trips/[id]/return/route';
import { GET as AVAILABILITY } from './availability/route';
import { POST as ADD_VEHICLE } from './vehicles/route';
import { PUT as EDIT_VEHICLE } from './vehicles/[id]/route';
import { POST as ADD_DRIVER } from './drivers/route';
import { PUT as EDIT_DRIVER } from './drivers/[personId]/route';
import { GET as PEOPLE } from './people/route';

const staff = { authenticated: true, personId: 'person-a', roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] };
const manager = { authenticated: true, personId: 'person-m', roles: [{ name: 'fleet-manager', organizationId: null }], dataOwnerModules: [] };
const filing = { purpose: 'ประชุม', destination: 'ศาลากลาง', province: 'มหาสารคาม', departAt: '2026-11-03T01:00:00.000Z', returnAt: '2026-11-03T09:00:00.000Z', passengerCount: 2 };
const vehicle = { registration: 'กข 1234', makeModel: 'Toyota Hilux', kind: 'PICKUP', seats: 5, status: 'ACTIVE' };
const newTrip = { vehicleId: 'v-1', driverPersonId: 'person-d', startsAt: '2026-11-03T00:30:00.000Z', endsAt: '2026-11-03T10:00:00.000Z' };
const url = 'http://localhost/api/fleet/x';
const json = (method: string, value: unknown = {}, target = url) => new Request(target, { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const id = params({ id: 'id-1' });
const ready = (session: object = staff) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.resetAllMocks());

describe('signed out', () => {
  it('answers 401', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await FILE(json('POST', filing))).status).toBe(401);
    expect((await ASSIGN(json('POST', newTrip), id)).status).toBe(401);
    expect((await DEPART(json('POST', { odometer: 1 }), id)).status).toBe(401);
  });
});

describe('POST /api/fleet/requests', () => {
  it('files as the session person and refuses one named in the body', async () => {
    ready();
    mocks.submit.mockResolvedValueOnce({ ok: true, fleetRequestId: 'fr-1' });
    const response = await FILE(json('POST', filing));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, fleetRequestId: 'fr-1' });
    expect(mocks.submit).toHaveBeenCalledWith('person-a', { ...filing, passengerNames: '', contactPhone: '' });
    const forged = await FILE(json('POST', { ...filing, requesterPersonId: 'person-z' }));
    expect(forged.status).toBe(400);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it('maps rule failures and conflicts', async () => {
    ready();
    mocks.submit.mockResolvedValueOnce({ ok: false, code: 'TOO_FAR_AHEAD' }).mockResolvedValueOnce({ ok: false, code: 'TRAVEL_ALREADY_HAS_CAR' });
    const early = await FILE(json('POST', filing));
    expect(early.status).toBe(400);
    await expect(early.json()).resolves.toEqual({ error: 'TOO_FAR_AHEAD' });
    expect((await FILE(json('POST', filing))).status).toBe(409);
  });
});

describe('/api/fleet/requests/[id]', () => {
  it('shows the detail to the viewer or answers 404', async () => {
    ready();
    mocks.detail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'id-1' });
    expect((await DETAIL(new Request(url), id)).status).toBe(404);
    expect((await DETAIL(new Request(url), id)).status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith('id-1', staff);
  });

  it('resubmits as the session person, mapping a race to NOT_PENDING', async () => {
    ready();
    mocks.resubmit.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('REQUEST_NOT_RETURNED'));
    expect((await RESUBMIT(json('PUT', filing), id)).status).toBe(200);
    expect(mocks.resubmit).toHaveBeenCalledWith('person-a', 'id-1', { ...filing, passengerNames: '', contactPhone: '' });
    const raced = await RESUBMIT(json('PUT', filing), id);
    expect(raced.status).toBe(409);
    await expect(raced.json()).resolves.toEqual({ error: 'NOT_PENDING' });
  });

  it('cancels with a reason, validated before the service', async () => {
    ready();
    expect((await CANCEL(json('POST', {}), id)).status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
    mocks.cancel.mockResolvedValueOnce({ ok: false, code: 'NOT_PENDING' }).mockRejectedValueOnce(new Error('REQUEST_NOT_CANCELLABLE'));
    expect((await CANCEL(json('POST', { reason: 'งานเลื่อน' }), id)).status).toBe(409);
    expect(mocks.cancel).toHaveBeenCalledWith('person-a', 'id-1', 'งานเลื่อน');
    expect((await CANCEL(json('POST', { reason: 'งานเลื่อน' }), id)).status).toBe(409);
  });
});

describe('manager routes', () => {
  it('answer 403 without fleet.manage and never reach the service', async () => {
    ready();
    expect((await ASSIGN(json('POST', newTrip), id)).status).toBe(403);
    expect((await MOVE(json('PUT', newTrip), id)).status).toBe(403);
    expect((await UNASSIGN(json('DELETE'), id)).status).toBe(403);
    expect((await DECLINE(json('POST', { reason: 'ไม่มีรถ' }), id)).status).toBe(403);
    expect((await PATCH_TRIP(json('PATCH', { vehicleId: 'v-2' }), id)).status).toBe(403);
    expect((await AVAILABILITY(new Request('http://localhost/api/fleet/availability?from=2026-11-03T01:00:00Z&to=2026-11-03T05:00:00Z'))).status).toBe(403);
    expect((await ADD_VEHICLE(json('POST', vehicle))).status).toBe(403);
    expect((await EDIT_VEHICLE(json('PUT', vehicle), id)).status).toBe(403);
    expect((await ADD_DRIVER(json('POST', { personId: 'p', phone: '081' }))).status).toBe(403);
    expect((await EDIT_DRIVER(json('PUT', { personId: 'p', phone: '081' }), params({ personId: 'p' }))).status).toBe(403);
    expect((await PEOPLE(new Request('http://localhost/api/fleet/people?q=a'))).status).toBe(403);
    for (const mock of [mocks.assign, mocks.move, mocks.unassign, mocks.decline, mocks.updateTrip, mocks.availability, mocks.createVehicle, mocks.updateVehicle, mocks.upsertDriver, mocks.people]) expect(mock).not.toHaveBeenCalled();
  });

  it('assigns as the manager and answers 409 VEHICLE_BUSY', async () => {
    ready(manager);
    mocks.assign.mockResolvedValueOnce({ ok: true, tripId: 't-1' }).mockResolvedValueOnce({ ok: false, code: 'VEHICLE_BUSY' }).mockResolvedValueOnce({ ok: false, code: 'DRIVER_BUSY' });
    const done = await ASSIGN(json('POST', newTrip), id);
    expect(done.status).toBe(200);
    await expect(done.json()).resolves.toEqual({ ok: true, tripId: 't-1' });
    expect(mocks.assign).toHaveBeenCalledWith('person-m', 'id-1', newTrip);
    const busy = await ASSIGN(json('POST', newTrip), id);
    expect(busy.status).toBe(409);
    await expect(busy.json()).resolves.toEqual({ error: 'VEHICLE_BUSY' });
    expect((await ASSIGN(json('POST', newTrip), id)).status).toBe(409);
    expect((await ASSIGN(json('POST', { tripId: 't-1', vehicleId: 'v' }), id)).status).toBe(400);
  });

  it('moves, unassigns, declines and edits a trip', async () => {
    ready(manager);
    mocks.move.mockResolvedValueOnce({ ok: true, tripId: 't-2' });
    mocks.unassign.mockResolvedValueOnce({ ok: true });
    mocks.decline.mockResolvedValueOnce({ ok: true });
    mocks.updateTrip.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await MOVE(json('PUT', { tripId: 't-2' }), id)).status).toBe(200);
    expect(mocks.move).toHaveBeenCalledWith('person-m', 'id-1', { tripId: 't-2' });
    expect((await UNASSIGN(json('DELETE'), id)).status).toBe(200);
    expect((await DECLINE(json('POST', {}), id)).status).toBe(400);
    expect((await DECLINE(json('POST', { reason: 'ไม่มีรถ' }), id)).status).toBe(200);
    expect(mocks.decline).toHaveBeenCalledWith('person-m', 'id-1', 'ไม่มีรถ');
    expect((await PATCH_TRIP(json('PATCH', { vehicleId: 'v-2' }), id)).status).toBe(404);
    expect(mocks.updateTrip).toHaveBeenCalledWith('person-m', 'id-1', { vehicleId: 'v-2' });
    expect((await PATCH_TRIP(json('PATCH', {}), id)).status).toBe(400);
  });
});

describe('trip departure and return', () => {
  it('passes asManager from the session, never the body', async () => {
    ready(manager);
    mocks.depart.mockResolvedValue({ ok: true });
    expect((await DEPART(json('POST', { odometer: 1200 }), id)).status).toBe(200);
    expect(mocks.depart).toHaveBeenLastCalledWith('person-m', 'id-1', 1200, true);
    ready();
    expect((await DEPART(json('POST', { odometer: 1200, asManager: true }), id)).status).toBe(400);
    expect((await DEPART(json('POST', { odometer: 1200 }), id)).status).toBe(200);
    expect(mocks.depart).toHaveBeenLastCalledWith('person-a', 'id-1', 1200, false);
  });

  it('records a return and maps odometer and state failures', async () => {
    ready();
    mocks.returnTrip.mockResolvedValueOnce({ ok: false, code: 'ODOMETER_BELOW_OUT' }).mockResolvedValueOnce({ ok: false, code: 'NOT_PENDING' }).mockResolvedValueOnce({ ok: true });
    expect((await RETURN(json('POST', { odometer: 5 }), id)).status).toBe(400);
    expect((await RETURN(json('POST', { odometer: 5 }), id)).status).toBe(409);
    expect((await RETURN(json('POST', { odometer: -1 }), id)).status).toBe(400);
    expect((await RETURN(json('POST', { odometer: 9 }), id)).status).toBe(200);
    expect(mocks.returnTrip).toHaveBeenLastCalledWith('person-a', 'id-1', 9, false);
  });
});

describe('GET /api/fleet/availability', () => {
  const get = (query: string) => AVAILABILITY(new Request(`http://localhost/api/fleet/availability?${query}`));
  it('needs from before to, both as ISO times', async () => {
    ready(manager);
    mocks.availability.mockResolvedValue({ vehicles: [], drivers: [], trips: [] });
    expect((await get('')).status).toBe(400);
    expect((await get('from=2026-11-03T05:00:00Z&to=2026-11-03T01:00:00Z')).status).toBe(400);
    expect((await get('from=2026-11-03T01:00:00Z&to=2026-11-03T01:00:00Z')).status).toBe(400);
    expect((await get('from=yesterday&to=tomorrow')).status).toBe(400);
    expect(mocks.availability).not.toHaveBeenCalled();
    expect((await get('from=2026-11-03T01:00:00Z&to=2026-11-03T05:00:00Z')).status).toBe(200);
    expect(mocks.availability).toHaveBeenCalledWith(new Date('2026-11-03T01:00:00Z'), new Date('2026-11-03T05:00:00Z'));
  });
});

describe('vehicles and drivers', () => {
  it('creates and edits cars, mapping a duplicate registration to 409', async () => {
    ready(manager);
    mocks.createVehicle.mockResolvedValueOnce({ ok: true, vehicleId: 'v-9' }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_REGISTRATION' });
    const created = await ADD_VEHICLE(json('POST', vehicle));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ ok: true, vehicleId: 'v-9' });
    expect((await ADD_VEHICLE(json('POST', vehicle))).status).toBe(409);
    expect((await ADD_VEHICLE(json('POST', { ...vehicle, seats: 0 }))).status).toBe(400);
    mocks.updateVehicle.mockResolvedValueOnce({ ok: true });
    expect((await EDIT_VEHICLE(json('PUT', vehicle), id)).status).toBe(200);
    expect(mocks.updateVehicle).toHaveBeenCalledWith('person-m', 'id-1', { ...vehicle, note: '' });
  });

  it('takes the driver from the path and maps DRIVER_HAS_TRIPS to 409', async () => {
    ready(manager);
    mocks.upsertDriver.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'DRIVER_HAS_TRIPS' });
    expect((await ADD_DRIVER(json('POST', { personId: 'person-d', phone: '081' }))).status).toBe(201);
    expect(mocks.upsertDriver).toHaveBeenCalledWith('person-m', { personId: 'person-d', phone: '081', isActive: true });
    const blocked = await EDIT_DRIVER(json('PUT', { personId: 'someone-else', phone: '081', isActive: false }), params({ personId: 'person-d' }));
    expect(blocked.status).toBe(409);
    expect(mocks.upsertDriver).toHaveBeenLastCalledWith('person-m', { personId: 'person-d', phone: '081', isActive: false });
  });

  it('searches staff for the driver form', async () => {
    ready(manager);
    mocks.people.mockResolvedValueOnce([{ personId: 'p', displayName: 'ก', organizationName: null }]);
    const response = await PEOPLE(new Request('http://localhost/api/fleet/people?q=%E0%B8%81'));
    await expect(response.json()).resolves.toEqual({ people: [{ personId: 'p', displayName: 'ก', organizationName: null }] });
    expect(mocks.people).toHaveBeenCalledWith('ก');
  });
});
