// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), view: vi.fn(), save: vi.fn(), clearCache: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/sign-in-settings', () => ({ signInSettings: () => ({ view: mocks.view, save: mocks.save }), clearSignInRoutesCache: mocks.clearCache }));

import { GET, PUT } from './route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const staff = { authenticated: true, personId: 'person-s', roles: [], dataOwnerModules: [] };
const request = (method: string, value?: unknown) => new Request('http://localhost/api/admin/sign-in-settings', { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };
const thaid = { method: 'THAID', enabled: true, values: { clientId: 'thaid-client', redirectUri: 'https://office.test/api/auth/thaid/callback' }, secrets: { clientSecret: 'thaid-topsecret' } };

afterEach(() => vi.resetAllMocks());

describe('sign-in settings API', () => {
  it('refuses anyone who is not ผู้ดูแลระบบ before reading or saving', async () => {
    ready(staff);
    expect((await GET(request('GET'))).status).toBe(403);
    expect((await PUT(request('PUT', thaid))).status).toBe(403);
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('saves for the admin, clears the sign-in cache and never echoes a secret', async () => {
    ready();
    mocks.save.mockResolvedValue({ ok: true });
    const response = await PUT(request('PUT', thaid));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('THAID', { enabled: true, values: thaid.values, secrets: thaid.secrets }, 'person-admin');
    expect(mocks.clearCache).toHaveBeenCalled();
    expect(await response.text()).not.toContain('thaid-topsecret');
  });

  it('answers LAST_SIGN_IN_ROUTE as 409 and a bad body as 400', async () => {
    ready();
    mocks.save.mockResolvedValue({ ok: false, code: 'LAST_SIGN_IN_ROUTE' });
    const refused = await PUT(request('PUT', { ...thaid, enabled: false }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'LAST_SIGN_IN_ROUTE' });
    expect((await PUT(request('PUT', { ...thaid, method: 'PASSWORD' }))).status).toBe(400);
  });
});
