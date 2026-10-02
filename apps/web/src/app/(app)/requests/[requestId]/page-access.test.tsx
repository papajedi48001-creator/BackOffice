import { afterEach, describe, expect, it, vi } from 'vitest';

const denied = new Error('not found');
const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(() => { throw denied; }), createDatabase: vi.fn(), readRuntimeValue: vi.fn(), readSession: vi.fn(), query: vi.fn(), close: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('../../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('./request-detail-panel', () => ({ RequestDetailPanel: () => null }));

import RequestDetailPage from './page';

afterEach(() => vi.clearAllMocks());

describe('RequestDetailPage access', () => {
  it('does not render a guessed request for an unrelated signed-in person', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-unrelated', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.query.mockResolvedValueOnce([{ id: 'request-1', reference: 'REQ-1', requestorPersonId: 'person-requestor', organizationSnapshot: '{"organizationId":"unit-1"}', status: 'IN_REVIEW' }]).mockResolvedValueOnce([{ assigneeSnapshot: '{"personId":"person-approver"}', status: 'PENDING' }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    await expect(RequestDetailPage({ params: Promise.resolve({ requestId: 'request-1' }) })).rejects.toBe(denied);
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
