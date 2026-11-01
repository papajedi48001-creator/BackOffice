// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(),
  setModuleMode: vi.fn(), grantRole: vi.fn(), revokeRole: vi.fn(), setPersonRoles: vi.fn(), people: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  AdminService: class { setModuleMode = mocks.setModuleMode; grantRole = mocks.grantRole; revokeRole = mocks.revokeRole; setPersonRoles = mocks.setPersonRoles; },
  AdminQueries: class { people = mocks.people; }
}));

import { PUT as TOGGLE } from './modules/[code]/route';
import { POST as GRANT, PUT as SET_ROLES } from './people/[personId]/roles/route';
import { DELETE as REVOKE } from './people/[personId]/roles/[roleName]/route';
import { GET as PEOPLE } from './people/route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const hrManager = { authenticated: true, personId: 'person-hr', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
const personId = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const json = (method: string, value: unknown = {}) => new Request('http://localhost/api/admin/x', { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const ready = (session: object = admin) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); };

afterEach(() => vi.resetAllMocks());

describe('admin API access', () => {
  it('refuses anyone signed out with 401 and anyone who is not ผู้ดูแลระบบ with 403, before touching data', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await TOGGLE(json('PUT', { mode: 'OFF' }), params({ code: 'fleet' }))).status).toBe(401);
    ready(hrManager);
    expect((await TOGGLE(json('PUT', { mode: 'OFF' }), params({ code: 'fleet' }))).status).toBe(403);
    expect((await GRANT(json('POST', { roleName: 'admin' }), params({ personId: 'person-hr' }))).status).toBe(403);
    expect((await SET_ROLES(json('PUT', { roleNames: ['admin'] }), params({ personId }))).status).toBe(403);
    expect((await REVOKE(json('DELETE'), params({ personId, roleName: 'admin' }))).status).toBe(403);
    expect((await PEOPLE(new Request('http://localhost/api/admin/people?q=a'))).status).toBe(403);
    expect(mocks.setModuleMode).not.toHaveBeenCalled();
    expect(mocks.grantRole).not.toHaveBeenCalled();
  });
});

describe('ตั้งค่าโปรแกรม', () => {
  it('switches a live module and refuses an unknown or locked one', async () => {
    ready();
    mocks.setModuleMode.mockResolvedValue({ ok: true, changed: true });
    expect((await TOGGLE(json('PUT', { mode: 'OFF' }), params({ code: 'fleet' }))).status).toBe(200);
    expect((await TOGGLE(json('PUT', { mode: 'DEVELOPMENT' }), params({ code: 'leave' }))).status).toBe(200);
    expect(mocks.setModuleMode).toHaveBeenCalledWith('person-admin', 'leave', 'DEVELOPMENT');
    expect((await TOGGLE(json('PUT', { mode: 'TESTING' }), params({ code: 'fleet' }))).status).toBe(400);
    expect((await TOGGLE(json('PUT', { enabled: false }), params({ code: 'fleet' }))).status).toBe(400);
    expect(mocks.setModuleMode).toHaveBeenCalledWith('person-admin', 'fleet', 'OFF');
    expect((await TOGGLE(json('PUT', { mode: 'OFF' }), params({ code: 'maintenance' }))).status).toBe(404);
    mocks.setModuleMode.mockResolvedValue({ ok: false, code: 'MODULE_LOCKED' });
    const locked = await TOGGLE(json('PUT', { mode: 'OFF' }), params({ code: 'admin' }));
    expect(locked.status).toBe(409);
    await expect(locked.json()).resolves.toEqual({ error: 'MODULE_LOCKED' });
  });
});

describe('กำหนดสิทธิ', () => {
  it('grants one role, sets a whole role set, and revokes', async () => {
    ready();
    mocks.grantRole.mockResolvedValue({ ok: true, changed: true });
    expect((await GRANT(json('POST', { roleName: 'fleet-manager' }), params({ personId }))).status).toBe(201);
    expect(mocks.grantRole).toHaveBeenCalledWith('person-admin', personId, 'fleet-manager');
    mocks.setPersonRoles.mockResolvedValue({ ok: true, granted: ['admin'], revoked: [] });
    expect((await SET_ROLES(json('PUT', { roleNames: ['admin', 'leave-manager'] }), params({ personId }))).status).toBe(200);
    mocks.revokeRole.mockResolvedValue({ ok: true });
    expect((await REVOKE(json('DELETE'), params({ personId, roleName: 'leave-manager' }))).status).toBe(200);
  });

  it('refuses a role outside the admin and manager list', async () => {
    ready();
    const response = await GRANT(json('POST', { roleName: 'data-exporter' }), params({ personId }));
    expect(response.status).toBe(400);
    expect((await REVOKE(json('DELETE'), params({ personId, roleName: 'data-exporter' }))).status).toBe(400);
    expect(mocks.grantRole).not.toHaveBeenCalled();
  });

  it('answers 409 LAST_ADMIN when the last ผู้ดูแลระบบ would go', async () => {
    ready();
    mocks.revokeRole.mockResolvedValue({ ok: false, code: 'LAST_ADMIN' });
    const response = await REVOKE(json('DELETE'), params({ personId, roleName: 'admin' }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'LAST_ADMIN' });
  });

  it('searches active people for the picker', async () => {
    ready();
    mocks.people.mockResolvedValue([{ personId, displayName: 'ก', employeeCode: 'IT001', organizationName: null }]);
    const response = await PEOPLE(new Request('http://localhost/api/admin/people?q=IT0'));
    expect(response.status).toBe(200);
    expect(mocks.people).toHaveBeenCalledWith('IT0');
  });
});
