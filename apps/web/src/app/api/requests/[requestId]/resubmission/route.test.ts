// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAuthorized: vi.fn(), getSharedDatabase: vi.fn(), resubmitRequest: vi.fn() }));
vi.mock('../../../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), RequestService: class { resubmitRequest = mocks.resubmitRequest; } }));

import { POST } from './route';

const resubmit = () => POST(new Request('http://localhost/api/requests/request-1/resubmission', { method: 'POST', body: '{}' }), { params: Promise.resolve({ requestId: 'request-1' }) });

function ready() {
  mocks.requireAuthorized.mockResolvedValue({ authenticated: true, personId: 'person-a' });
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/requests/[requestId]/resubmission', () => {
  it('answers 503 without a database', async () => {
    ready();
    mocks.getSharedDatabase.mockReturnValue(null);
    expect((await resubmit()).status).toBe(503);
  });

  it('rejects a signed-out user', async () => {
    ready();
    mocks.requireAuthorized.mockRejectedValue(Object.assign(new Error('Unauthenticated'), { status: 401 }));
    expect((await resubmit()).status).toBe(401);
    expect(mocks.resubmitRequest).not.toHaveBeenCalled();
  });

  it('resubmits as the signed-in person', async () => {
    ready();
    mocks.resubmitRequest.mockResolvedValue({ id: 'request-1', status: 'IN_REVIEW', approvalSteps: [] });
    const response = await resubmit();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'IN_REVIEW' });
    expect(mocks.resubmitRequest).toHaveBeenCalledWith({ requestId: 'request-1', actorPersonId: 'person-a' });
  });

  it.each([
    ['NO_APPROVER', 422, 'no_approver'],
    ['REQUEST_NOT_RETURNED', 409, 'request_not_returned'],
    ['NOT_REQUESTOR', 404, 'request_not_found']
  ])('maps %s to %i', async (code, status, error) => {
    ready();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.resubmitRequest.mockRejectedValue(new Error(code));
    const response = await resubmit();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });
});
