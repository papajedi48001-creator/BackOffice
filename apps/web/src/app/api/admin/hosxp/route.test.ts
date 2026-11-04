// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), readRuntimeValue: vi.fn(), view: vi.fn(), save: vi.fn(), resolve: vi.fn(), sync: vi.fn(), testHosxpConnection: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  HosxpSettingsService: class { view = mocks.view; save = mocks.save; resolve = mocks.resolve; },
  HolidaySyncService: class { sync = mocks.sync; },
  testHosxpConnection: mocks.testHosxpConnection
}));

import { GET, PUT } from './route';
import { POST as TEST } from './test/route';
import { POST as SYNC } from './sync/route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const staff = { authenticated: true, personId: 'person-s', roles: [], dataOwnerModules: [] };
const request = (method: string, value?: unknown) => new Request('http://localhost/api/admin/hosxp', { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };
const settings = { host: '192.168.1.254', port: 3306, database: 'hos', user: 'readonly', password: 'secret-pw', dateColumn: 'holiday_date', nameColumn: 'day_name' };

afterEach(() => { vi.resetAllMocks(); });

describe('HOSxP connection API', () => {
  it('refuses anyone who is not ผู้ดูแลระบบ before reading or connecting', async () => {
    ready(staff);
    expect((await GET(request('GET'))).status).toBe(403);
    expect((await PUT(request('PUT', settings))).status).toBe(403);
    expect((await TEST(request('POST'))).status).toBe(403);
    expect((await SYNC(request('POST'))).status).toBe(403);
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.testHosxpConnection).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('saves the settings for the admin and never answers with the password', async () => {
    ready();
    mocks.save.mockResolvedValue({ ok: true });
    const response = await PUT(request('PUT', settings));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(settings, 'person-admin');
    expect(await response.text()).not.toContain('secret-pw');
    expect((await PUT(request('PUT', { ...settings, port: 'x' }))).status).toBe(400);
  });
  it('tests the connection and pulls holidays now, reporting codes only', async () => {
    ready();
    mocks.resolve.mockResolvedValue({ ...settings });
    mocks.testHosxpConnection.mockResolvedValue({ ok: true, rows: 21 });
    expect(await (await TEST(request('POST'))).json()).toEqual({ ok: true, rows: 21 });
    mocks.sync.mockResolvedValue({ ok: false, code: 'CONNECTION_FAILED' });
    const failed = await SYNC(request('POST'));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'CONNECTION_FAILED' });
    expect(mocks.sync).toHaveBeenCalledWith('person-admin');
    mocks.resolve.mockResolvedValue(null);
    expect(await (await TEST(request('POST'))).json()).toEqual({ error: 'NOT_CONFIGURED' });
  });
});
