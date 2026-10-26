import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listPendingApprovals: vi.fn(), query: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), listPendingApprovals: mocks.listPendingApprovals }));

import RequestsPage from './page';

afterEach(() => vi.clearAllMocks());

describe('RequestsPage', () => {
  it('lists what waits on me from every module, each opening on its own page', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'director', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: mocks.query });
    mocks.listPendingApprovals.mockResolvedValue([{ requestId: 'r-1', reference: 'REQ-r-1', moduleCode: 'leave', requestorName: 'นางสาวสุดารัตน์ ใจสมมติ', submittedAt: '2026-10-26T03:00:00.000Z', href: '/leave/requests/r-1' }]);
    mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM request') ? [{ id: 'r-9', reference: 'REQ-r-9', moduleCode: 'requests', status: 'IN_REVIEW' }] : []);

    render(await RequestsPage());

    expect(mocks.listPendingApprovals).toHaveBeenCalledWith(expect.anything(), 'director');
    const waiting = screen.getByRole('table', { name: 'รอฉันพิจารณา' });
    expect(within(waiting).getByText('[การลา]')).toBeInTheDocument();
    expect(within(waiting).getByRole('link', { name: 'REQ-r-1' })).toHaveAttribute('href', '/leave/requests/r-1');
    expect(within(waiting).getByText('นางสาวสุดารัตน์ ใจสมมติ')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'คำขอของฉัน' })).getByRole('link', { name: 'REQ-r-9' })).toHaveAttribute('href', '/requests/r-9');
  });

  it('says so when nothing waits on me', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'staff', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: mocks.query });
    mocks.listPendingApprovals.mockResolvedValue([]);
    mocks.query.mockResolvedValue([]);

    render(await RequestsPage());

    expect(screen.getByText('ไม่มีคำขอรอคุณพิจารณา')).toBeInTheDocument();
  });
});
