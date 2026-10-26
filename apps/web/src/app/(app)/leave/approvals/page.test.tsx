import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), pendingForApprover: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveQueries: class { pendingForApprover = mocks.pendingForApprover; } }));

import LeaveApprovalsPage from './page';

const row = { requestId: 'r1', reference: 'REQ-r1', kind: 'LEAVE', leaveTypeName: 'ลาพักผ่อน', startDate: '2026-11-02', endDate: '2026-11-03', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'IN_REVIEW', submittedAt: null, personDisplayName: 'สมชาย', organizationName: 'งานผู้ป่วยใน', warnings: [], medicalCertificateRequired: false };
function ready(rows: unknown[]) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.pendingForApprover.mockResolvedValue(rows);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('LeaveApprovalsPage', () => {
  it('approves the ticked ใบลา together and reports each result', async () => {
    ready([row, { ...row, requestId: 'r2', reference: 'REQ-r2', personDisplayName: 'สมหญิง', warnings: [{ month: '2026-11', workingDays: 14, minimum: 15 }], medicalCertificateRequired: true }]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ requestId: 'r1', ok: true }, { requestId: 'r2', ok: false, error: 'APPROVER_REQUIRED' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveApprovalsPage());
    expect(mocks.pendingForApprover).toHaveBeenCalledWith('head-1');
    const second = screen.getByRole('row', { name: /REQ-r2/ });
    expect(within(second).getByText(/จะเหลือวันทำการ 14 วัน/)).toBeInTheDocument();
    expect(within(second).getByText('ต้องมีใบรับรองแพทย์ (ส่งที่งาน HR)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติที่เลือก' }));
    expect(await screen.findByText('กรุณาเลือกใบลาอย่างน้อยหนึ่งรายการ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือก REQ-r1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือก REQ-r2' }));
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติที่เลือก' }));
    expect(await within(screen.getByRole('row', { name: /REQ-r1/ })).findByText('อนุมัติแล้ว')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /REQ-r2/ })).getByText('ไม่ใช่ลำดับที่คุณต้องพิจารณา')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/leave/decisions');
    expect(JSON.parse(init.body as string)).toEqual({ requestIds: ['r1', 'r2'] });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('shows the empty state', async () => {
    ready([]);
    render(await LeaveApprovalsPage());
    expect(screen.getByText('ไม่มีใบลารอคุณพิจารณา')).toBeInTheDocument();
  });
});
