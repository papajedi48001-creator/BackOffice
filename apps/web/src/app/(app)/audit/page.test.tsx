import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn(),
  createDatabase: vi.fn(),
  readRuntimeValue: vi.fn(),
  readSession: vi.fn(),
  query: vi.fn(),
  close: vi.fn()
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));

import AuditPage from './page';

afterEach(() => { vi.clearAllMocks(); });

describe('AuditPage', () => {
  it('queries only the signed-in actor events and closes the database', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-a', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice');
    mocks.query.mockResolvedValue([{ createdAt: '2026-10-01T07:00:00.000Z', action: 'workflow.request.submitted', result: 'SUCCESS', metadata: '{"requestReference":"REQ-request-1","password":"do-not-render"}' }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    render(await AuditPage());

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('actor_person_id = ?'), ['person-a']);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(screen.getByText('REQ-request-1')).toBeInTheDocument();
    expect(screen.queryByText('do-not-render')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users before querying audit data', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue(null);

    await AuditPage();

    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.createDatabase).not.toHaveBeenCalled();
  });
});
