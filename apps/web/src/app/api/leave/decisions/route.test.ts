// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), approveMany: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveService: class { approveMany = mocks.approveMany; } }));

import { POST } from './route';

const post = (value: unknown) => POST(new Request('http://localhost/api/leave/decisions', { method: 'POST', body: JSON.stringify(value) }));

afterEach(() => vi.clearAllMocks());

describe('POST /api/leave/decisions', () => {
  it('approves each id as the signed-in person and returns one result per id', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await post({ requestIds: ['a'] })).status).toBe(401);
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-a', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.approveMany.mockResolvedValue([{ requestId: 'a', ok: true }, { requestId: 'b', ok: false, error: 'APPROVER_REQUIRED' }]);
    const response = await post({ requestIds: ['a', 'b'] });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [{ requestId: 'a', ok: true }, { requestId: 'b', ok: false, error: 'APPROVER_REQUIRED' }] });
    expect(mocks.approveMany).toHaveBeenCalledWith('head-a', ['a', 'b']);
    expect((await post({ requestIds: [] })).status).toBe(400);
  });
});
