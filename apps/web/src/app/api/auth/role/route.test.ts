import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn(), chooseRole: vi.fn(), execute: vi.fn() }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), SessionService: class { chooseRole = mocks.chooseRole; } }));

import { POST } from './route';

function choose(body: unknown, cookie = 'backoffice_session=opaque-token') {
  return POST(new Request('http://localhost/api/auth/role', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }));
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/role', () => {
  const database = { execute: mocks.execute, query: vi.fn(), transaction: async (work: (db: unknown) => unknown) => work(database) };

  it('saves a held role and audits the switch with role codes only, in one transaction', async () => {
    mocks.getSharedDatabase.mockReturnValue(database);
    mocks.chooseRole.mockResolvedValue({ personId: 'person-a', role: 'leave-manager', previousRole: 'admin' });

    const response = await choose({ role: 'leave-manager' });

    expect(response.status).toBe(200);
    expect(mocks.chooseRole).toHaveBeenCalledWith('opaque-token', 'leave-manager');
    const audit = mocks.execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO audit_event'));
    expect(audit?.[1]).toEqual(expect.arrayContaining(['person-a', 'session.role.selected', 'person', 'SUCCESS', JSON.stringify({ roleName: 'leave-manager', previousRoleName: 'admin' })]));
  });

  it('refuses a role the person does not hold with 403 role_not_held and no audit', async () => {
    mocks.getSharedDatabase.mockReturnValue(database);
    mocks.chooseRole.mockRejectedValue(new Error('ROLE_NOT_HELD'));

    const response = await choose({ role: 'admin' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'role_not_held' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('answers 401 without a live session and 400 for a malformed body', async () => {
    mocks.getSharedDatabase.mockReturnValue(database);
    mocks.chooseRole.mockResolvedValue(null);
    expect((await choose({ role: 'admin' })).status).toBe(401);
    expect((await choose({ role: 'admin' }, '')).status).toBe(401);
    expect((await choose({ role: 42 })).status).toBe(400);
  });
});
