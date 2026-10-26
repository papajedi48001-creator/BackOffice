import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), refresh: vi.fn(), push: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn(), listTypes: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveQueries: class { detail = mocks.detail; }, LeaveSettingsService: class { listTypes = mocks.listTypes; } }));

import LeaveRequestPage from './page';

const detail = {
  requestId: 'r1', reference: 'REQ-r1', kind: 'LEAVE', leaveTypeName: 'ลาพักผ่อน', startDate: '2026-11-02', endDate: '2026-11-06', startHalf: 'FULL', endHalf: 'FULL', days: 5, status: 'IN_REVIEW', submittedAt: '2026-10-26T02:00:00Z', personDisplayName: 'สมชาย ใจดี', organizationName: 'งานผู้ป่วยใน',
  reason: 'พาครอบครัวเที่ยว', contactDuringLeave: '0812345678', medicalCertificateRequired: false, warnings: [{ month: '2026-11', workingDays: 14, minimum: 15 }],
  steps: [{ sequence: 1, assigneeDisplayName: 'หัวหน้างาน', status: 'PENDING', decidedAt: null, decisionReason: null }, { sequence: 2, assigneeDisplayName: 'ผู้อำนวยการ', status: 'PENDING', decidedAt: null, decisionReason: null }],
  cancellations: [], canDecide: false, canCancel: false, canRequestCancelDays: false
};
const params = (requestId = 'r1') => ({ params: Promise.resolve({ requestId }) });
function ready(view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.detail.mockResolvedValue(view);
  mocks.listTypes.mockResolvedValue([]);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('LeaveRequestPage', () => {
  it('shows an approver the reason, the warning, the steps and the decide buttons', async () => {
    ready({ ...detail, canDecide: true });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'd1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveRequestPage(params()));
    expect(screen.getByRole('heading', { name: /ใบลา REQ-r1/ })).toBeInTheDocument();
    expect(screen.getByText('พาครอบครัวเที่ยว')).toBeInTheDocument();
    expect(screen.getByText(/เดือน พฤศจิกายน 2569 จะเหลือวันทำการ 14 วัน/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ผู้อำนวยการ' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'ขอยกเลิกวันลา' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งกลับแก้ไข' }));
    expect(await screen.findByText('กรุณาระบุเหตุผล')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/requests/r1/decisions');
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'APPROVE' });
  });

  it('gives no decide buttons to someone who is not the current approver', async () => {
    ready(detail);
    render(await LeaveRequestPage(params()));
    expect(screen.queryByRole('button', { name: 'อนุมัติ' })).toBeNull();
  });

  it('lets the owner of an approved ใบลา ask to cancel days', async () => {
    ready({ ...detail, status: 'APPROVED', canRequestCancelDays: true, warnings: [] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, requestId: 'c1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await LeaveRequestPage(params()));
    const form = screen.getByRole('form', { name: 'ขอยกเลิกวันลา' });
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-11-06' } });
    fireEvent.change(screen.getByLabelText('เหตุผลที่ขอยกเลิก'), { target: { value: 'กลับมาทำงาน' } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/leave/requests/c1'));
    expect((fetchMock.mock.calls[0]! as unknown as [string])[0]).toBe('/api/leave/r1/cancel-days');
  });

  it('is not found for a ใบลา the viewer may not see', async () => {
    ready(null);
    await LeaveRequestPage(params('hidden'));
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
