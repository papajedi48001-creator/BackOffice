import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), balances: vi.fn(), myLeave: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveQueries: class { balances = mocks.balances; myLeave = mocks.myLeave; } }));

import MyLeavePage from './page';

const vacation = { id: 'lt-3', code: 'VACATION', name: 'ลาพักผ่อน', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: 3 };
const item = { requestId: 'r1', reference: 'REQ-r1', kind: 'LEAVE', leaveTypeName: 'ลาพักผ่อน', startDate: '2026-11-02', endDate: '2026-11-03', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'IN_REVIEW', submittedAt: '2026-10-26T02:00:00Z', personDisplayName: 'สมชาย', organizationName: 'งานผู้ป่วยใน' };

afterEach(() => vi.clearAllMocks());

describe('MyLeavePage', () => {
  it('shows a balance card per type and the person’s ใบลา with Thai statuses', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'me', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.balances.mockResolvedValue([{ leaveType: vacation, balance: { entitled: 10, carried: 5, used: 3, pending: 2, remaining: 10 } }]);
    mocks.myLeave.mockResolvedValue([item, { ...item, requestId: 'r2', reference: 'REQ-r2', kind: 'CANCEL_DAYS', status: 'APPROVED', days: 1 }]);
    render(await MyLeavePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading', { name: 'การลาของฉัน' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'ลาพักผ่อน' });
    expect(card).toHaveTextContent('คงเหลือ10');
    expect(card).toHaveTextContent('วันลาสะสม5');
    expect(screen.getByRole('link', { name: 'REQ-r1' })).toHaveAttribute('href', '/leave/requests/r1');
    expect(screen.getByText('รออนุมัติ', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByText('ขอยกเลิกวันลา')).toBeInTheDocument();
    expect(mocks.balances.mock.calls[0]?.[0]).toBe('me');
  });

  it('redirects a signed-out visitor', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue(null);
    await MyLeavePage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });
});
