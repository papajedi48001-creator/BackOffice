// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAuthorized: vi.fn(), getSharedDatabase: vi.fn(), cancelRequest: vi.fn() }));
vi.mock('../../../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), RequestService: class { cancelRequest = mocks.cancelRequest; } }));

import { POST } from './route';

const reason = 'ไม่ต้องการใช้บริการแล้ว';
const cancel = (body: unknown = { reason }) => POST(new Request('http://localhost/api/requests/request-1/cancellation', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ requestId: 'request-1' }) });

function ready() {
  mocks.requireAuthorized.mockResolvedValue({ authenticated: true, personId: 'person-a' });
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/requests/[requestId]/cancellation', () => {
  it('answers 503 without a database', async () => {
    ready();
    mocks.getSharedDatabase.mockReturnValue(null);
    expect((await cancel()).status).toBe(503);
  });

  it('rejects a signed-out user', async () => {
    ready();
    mocks.requireAuthorized.mockRejectedValue(Object.assign(new Error('Unauthenticated'), { status: 401 }));
    const response = await cancel();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
    expect(mocks.cancelRequest).not.toHaveBeenCalled();
  });

  it('cancels as the signed-in person', async () => {
    ready();
    mocks.cancelRequest.mockResolvedValue({ id: 'request-1', status: 'CANCELLED' });
    const response = await cancel();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'CANCELLED' });
    expect(mocks.cancelRequest).toHaveBeenCalledWith({ requestId: 'request-1', actorPersonId: 'person-a', reason });
  });

  it.each([
    ['NOT_REQUESTOR', 404, 'request_not_found'],
    ['REQUEST_NOT_FOUND', 404, 'request_not_found'],
    ['REQUEST_NOT_CANCELLABLE', 409, 'request_not_cancellable'],
    ['REASON_REQUIRED', 422, 'reason_required']
  ])('maps %s to %i without logging the reason', async (code, status, error) => {
    ready();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.cancelRequest.mockRejectedValue(new Error(code));
    const response = await cancel({ reason: code === 'REASON_REQUIRED' ? '   ' : reason });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(log).toHaveBeenCalledWith('backoffice.request_lifecycle_failed', { code });
    expect(JSON.stringify(log.mock.calls)).not.toContain(reason);
  });
});
