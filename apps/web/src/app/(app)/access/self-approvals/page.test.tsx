import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), listSelfApprovals: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), listSelfApprovals: mocks.listSelfApprovals }));

import SelfApprovalsPage from './page';

function ready(roles: Array<{ name: string }>) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'admin-1', roles, dataOwnerModules: [], activeRole: roles.length ? 'admin' : 'employee' });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.listSelfApprovals.mockResolvedValue([{ createdAt: '2026-11-08T03:00:00.000Z', actorDisplayName: 'สมชาย ใจดี', actorRole: 'manager', action: 'workflow.request.decided', result: 'APPROVE', reference: 'LV-2569-0001' }]);
}

afterEach(() => { vi.clearAllMocks(); });

describe('SelfApprovalsPage', () => {
  it('lists who decided their own request, which one and when, for an admin', async () => {
    ready([{ name: 'admin' }]);
    render(await SelfApprovalsPage());
    expect(screen.getByRole('heading', { name: 'อนุมัติคำขอของตนเอง' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /LV-2569-0001/ });
    expect(row).toHaveTextContent('สมชาย ใจดี');
    expect(row).toHaveTextContent('ผู้จัดการ');
    expect(row).toHaveTextContent('อนุมัติ');
    expect(row).toHaveTextContent('8 พ.ย.');
  });

  it('is not found for anyone outside the admin tier', async () => {
    ready([{ name: 'hr-manager' }]);
    await SelfApprovalsPage();
    expect(mocks.notFound).toHaveBeenCalled();
    expect(mocks.listSelfApprovals).not.toHaveBeenCalled();
  });
});
