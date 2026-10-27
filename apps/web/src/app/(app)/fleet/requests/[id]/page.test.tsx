import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), refresh: vi.fn(), push: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), FleetQueries: class { detail = mocks.detail; } }));

import FleetRequestPage from './page';

const base = {
  id: 'f1', reference: 'VR-2570-0001', purpose: 'ส่งเอกสาร', destination: 'สสจ.มหาสารคาม', province: 'มหาสารคาม', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z', status: 'WAITING',
  requesterPersonId: 'person-a', requesterName: 'นางพรทิพย์ ใจดี', organizationName: 'งานผู้ป่วยใน', passengerCount: 2, passengerNames: 'นายเอ นายบี', officialTravelId: null, requestId: 'r1', filedAt: '2026-10-27T03:00:00.000Z',
  history: [{ action: 'SUBMITTED', actorName: 'นางพรทิพย์ ใจดี', reason: null, createdAt: '2026-10-27T03:00:00.000Z' }],
  trip: null, canCancel: true, canResubmit: false, canDispatch: false
};
const assigned = { ...base, status: 'ASSIGNED', canCancel: false, trip: { id: 't1', registration: 'กข 1234', makeModel: 'Toyota Commuter', driverName: 'นายขับ ดี', driverPhone: '0811111111', status: 'PLANNED' } };
const params = (id = 'f1') => ({ params: Promise.resolve({ id }) });
function ready(view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.detail.mockResolvedValue(view);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('FleetRequestPage', () => {
  it('shows the car, registration, driver name and work phone once assigned, with no cancel when canCancel is false', async () => {
    ready(assigned);
    render(await FleetRequestPage(params()));
    expect(screen.getByRole('heading', { name: /VR-2570-0001/ })).toBeInTheDocument();
    expect(screen.getByText('จัดรถแล้ว')).toBeInTheDocument();
    expect(screen.getByText(/กข 1234/)).toBeInTheDocument();
    expect(screen.getByText('นายขับ ดี')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0811111111' })).toHaveAttribute('href', 'tel:0811111111');
    expect(screen.queryByRole('button', { name: 'ยกเลิกใบขอใช้รถ' })).toBeNull();
  });

  it('lets the requester cancel with a reason while canCancel, and lists the history', async () => {
    ready(base);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await FleetRequestPage(params()));
    expect(screen.getByText('รอจัดรถ')).toBeInTheDocument();
    expect(screen.getByText(/ยื่นใบขอใช้รถ/)).toBeInTheDocument();
    expect(screen.queryByText('กข 1234')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกใบขอใช้รถ' }));
    fireEvent.change(screen.getByLabelText('เหตุผล'), { target: { value: 'ไม่ไปแล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/requests/f1/cancellation');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'ไม่ไปแล้ว' });
  });

  it('is not found for someone who may not see it', async () => {
    ready(null);
    await FleetRequestPage(params());
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
