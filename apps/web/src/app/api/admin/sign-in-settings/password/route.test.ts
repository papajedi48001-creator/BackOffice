// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), savePasswordMode: vi.fn(), clearCache: vi.fn(), protector: vi.fn((): object | null => ({})) }));
vi.mock('../../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.protector }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/sign-in-settings', () => ({ signInSettings: () => ({ savePasswordMode: mocks.savePasswordMode }), clearSignInRoutesCache: mocks.clearCache }));

import { PUT } from './route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const staff = { authenticated: true, personId: 'person-s', roles: [], dataOwnerModules: [] };
const request = (value: unknown) => new Request('http://localhost/api/admin/sign-in-settings/password', { method: 'PUT', body: JSON.stringify(value) });
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.resetAllMocks());

describe('password sign-in mode API', () => {
  it('refuses anyone who is not ผู้ดูแลระบบ before saving', async () => {
    ready(staff);
    expect((await PUT(request({ mode: 'ON' }))).status).toBe(403);
    expect(mocks.savePasswordMode).not.toHaveBeenCalled();
  });

  it('saves the mode for the admin and clears the sign-in cache', async () => {
    ready();
    mocks.savePasswordMode.mockResolvedValue({ ok: true });
    expect((await PUT(request({ mode: 'ON' }))).status).toBe(200);
    expect(mocks.savePasswordMode).toHaveBeenCalledWith('ON', 'person-admin', true);
    expect(mocks.clearCache).toHaveBeenCalled();
  });

  it('tells the service ThaID cannot sign anyone in without the national-ID keys', async () => {
    ready();
    mocks.protector.mockReturnValueOnce(null);
    mocks.savePasswordMode.mockResolvedValue({ ok: false, code: 'LAST_SIGN_IN_ROUTE' });
    expect((await PUT(request({ mode: 'OFF' }))).status).toBe(409);
    expect(mocks.savePasswordMode).toHaveBeenCalledWith('OFF', 'person-admin', false);
  });

  it('answers LAST_SIGN_IN_ROUTE as 409 and an unknown mode as 400', async () => {
    ready();
    mocks.savePasswordMode.mockResolvedValue({ ok: false, code: 'LAST_SIGN_IN_ROUTE' });
    const refused = await PUT(request({ mode: 'OFF' }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'LAST_SIGN_IN_ROUTE' });
    expect(mocks.clearCache).not.toHaveBeenCalled();
    expect((await PUT(request({ mode: 'SOMETIMES' }))).status).toBe(400);
  });
});
