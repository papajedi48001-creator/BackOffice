// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updatePositionHistory: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updatePositionHistory = mocks.updatePositionHistory; } }));

import { PUT } from './route';

const staff = { authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [] };
const params = { params: Promise.resolve({ personId: 'p1' }) };
const put = (body: unknown) => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });
afterEach(() => vi.clearAllMocks());

it('replaces the position history through the service and maps refusals', async () => {
  mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({});
  const entries = [{ effectiveOn: '2020-08-24', description: 'บรรจุ' }];
  mocks.updatePositionHistory.mockResolvedValueOnce({ ok: true });
  expect((await PUT(put({ entries }), params)).status).toBe(200);
  expect(mocks.updatePositionHistory).toHaveBeenCalledWith('p1', { entries }, staff);
  mocks.updatePositionHistory.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
  expect((await PUT(put({ entries }), params)).status).toBe(403);
  expect((await PUT(put({ entries: [{ effectiveOn: 'x', description: 'บรรจุ' }] }), params)).status).toBe(400);
});
