// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(),
  saveSettings: vi.fn(), saveShiftType: vi.fn(), saveLocation: vi.fn(), create: vi.fn(), newPairingCode: vi.fn(), revoke: vi.fn(), verifyChain: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  AttendanceSettingsService: class { saveSettings = mocks.saveSettings; saveShiftType = mocks.saveShiftType; saveLocation = mocks.saveLocation; },
  DeviceService: class { create = mocks.create; newPairingCode = mocks.newPairingCode; revoke = mocks.revoke; },
  verifyChain: mocks.verifyChain
}));

import { PUT as SETTINGS } from './settings/route';
import { POST as ADD_SHIFT } from './shift-types/route';
import { PUT as EDIT_SHIFT } from './shift-types/[id]/route';
import { POST as ADD_LOCATION } from './locations/route';
import { PUT as EDIT_LOCATION } from './locations/[id]/route';
import { POST as ADD_DEVICE } from './devices/route';
import { POST as PAIRING_CODE } from './devices/[id]/pairing-code/route';
import { POST as REVOKE } from './devices/[id]/revoke/route';
import { POST as VERIFY } from './audit/verify/route';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const person = (roles: string[]) => ({ authenticated: true, personId: 'person-a', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] });
const staff = person([]);
const manager = person(['attendance-manager']);
const auditor = person(['attendance-auditor']);
const shift = { name: 'เวรทดสอบ', startTime: '07:00', endTime: '19:00', earlyWindowMinutes: 60, lateGraceMinutes: 0, earlyLeaveGraceMinutes: 0, checkoutWindowMinutes: 240, colorHex: '#1D4ED8', isActive: true };
const location = { name: 'ประตูหน้า', latitude: 17.2, longitude: 103.1, radiusMeters: 100, isActive: true };
const settings = { gpsMaxAccuracyMeters: 50, gpsMaxAgeSeconds: 60, retentionDays: 365, requestWindowDays: 30, pinMaxAttempts: 5, pinLockMinutes: 15, defaultRadiusMeters: 100 };
const json = (method: string, value: unknown = {}) => new Request('http://localhost/api/attendance/x', { method, body: JSON.stringify(value) });
const id = { params: Promise.resolve({ id: uuid }) };
const ready = (session: object | null) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.resetAllMocks());

describe('attendance management routes', () => {
  it('refuse a signed-out visitor and plain staff on every write', async () => {
    ready(null);
    expect((await ADD_SHIFT(json('POST', shift))).status).toBe(401);
    ready(staff);
    const calls = [SETTINGS(json('PUT', settings)), ADD_SHIFT(json('POST', shift)), EDIT_SHIFT(json('PUT', shift), id), ADD_LOCATION(json('POST', location)), EDIT_LOCATION(json('PUT', location), id), ADD_DEVICE(json('POST', { name: 'กล่อง', locationId: uuid })), PAIRING_CODE(json('POST'), id), REVOKE(json('POST'), id), VERIFY(json('POST'))];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(403);
    expect(mocks.saveShiftType).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('lets the manager add a location (201) and reports a duplicate shift name as 409', async () => {
    ready(manager);
    mocks.saveLocation.mockResolvedValueOnce({ ok: true, id: uuid });
    const added = await ADD_LOCATION(json('POST', location));
    expect(added.status).toBe(201);
    expect(mocks.saveLocation).toHaveBeenCalledWith('person-a', null, location);
    mocks.saveShiftType.mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_NAME' });
    const duplicate = await ADD_SHIFT(json('POST', shift));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({ error: 'DUPLICATE_NAME' });
    expect((await EDIT_SHIFT(json('PUT', { ...shift, endTime: '07:00' }), id)).status).toBe(400);
  });

  it('returns a new box with its pairing code once, and refuses a code for a revoked box', async () => {
    ready(manager);
    mocks.create.mockResolvedValueOnce({ ok: true, id: uuid, pairingCode: '12345678' });
    const created = await ADD_DEVICE(json('POST', { name: 'กล่อง OPD', locationId: uuid }));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ ok: true, id: uuid, pairingCode: '12345678' });
    expect(created.headers.get('cache-control')).toBe('no-store');
    mocks.newPairingCode.mockResolvedValueOnce({ ok: false, code: 'DEVICE_REVOKED' });
    expect((await PAIRING_CODE(json('POST'), id)).status).toBe(409);
  });

  it('lets the auditor check the chain but not change settings', async () => {
    ready(auditor);
    mocks.verifyChain.mockResolvedValueOnce({ ok: true, length: 12 });
    const verified = await VERIFY(json('POST'));
    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toEqual({ ok: true, length: 12 });
    expect((await SETTINGS(json('PUT', settings))).status).toBe(403);
  });
});
