import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), push: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), dashboard: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn(), useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), FleetQueries: class { dashboard = mocks.dashboard; } }));

import FleetDashboardPage from './page';

const item = { id: 'f1', reference: 'VR-2570-0001', requesterName: 'นางพรทิพย์ ใจดี', organizationName: 'งานผู้ป่วยใน', purpose: 'ส่งเอกสาร', destination: 'สสจ.มหาสารคาม', province: 'มหาสารคาม', departAt: '2026-10-27T01:00:00.000Z', returnAt: '2026-10-27T09:00:00.000Z', passengerCount: 2, soon: false, overdue: true };
const view = {
  counts: { waiting: 2, tripsToday: 3, out: 1, inRepair: 4 },
  queue: [item, { ...item, id: 'f2', reference: 'VR-2570-0002', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z', overdue: false }],
  board: [{ vehicle: { id: 'v1', registration: 'กข 1234', makeModel: 'Toyota Commuter', status: 'ACTIVE' }, trips: [{ id: 't1', startsAt: '2026-10-27T01:00:00.000Z', endsAt: '2026-10-27T05:00:00.000Z', driverName: 'นายขับ ดี', status: 'PLANNED', requestCount: 1 }] }],
  flagged: []
};
function ready(manager: boolean) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-m', roles: manager ? [{ name: 'fleet-manager', organizationId: null }] : [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.dashboard.mockResolvedValue(view);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('FleetDashboardPage', () => {
  it('shows the four counts, the queue with จัดรถ and ไม่จัดรถ, an overdue row flagged, and today\'s board', async () => {
    ready(true);
    render(await FleetDashboardPage());
    const counts = screen.getByRole('list', { name: 'แดชบอร์ด' });
    for (const [label, value] of [['รอจัดรถ', '2'], ['เที่ยวรถวันนี้', '3'], ['รถออกอยู่', '1'], ['รถซ่อม', '4']]) expect(within(counts).getByText(label).closest('li')).toHaveTextContent(value!);
    const overdue = screen.getByRole('row', { name: /VR-2570-0001/ });
    expect(overdue).toHaveClass('fleet-queue-overdue');
    expect(within(overdue).getByText('เลยเวลาออกแล้ว')).toBeInTheDocument();
    expect(within(overdue).getByRole('button', { name: 'จัดรถ' })).toBeInTheDocument();
    expect(within(overdue).getByRole('button', { name: 'ไม่จัดรถ' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /VR-2570-0002/ })).not.toHaveClass('fleet-queue-overdue');
    expect(screen.getByRole('link', { name: 'VR-2570-0001' })).toHaveAttribute('href', '/fleet/requests/f1');
    expect(screen.getByText('กข 1234')).toBeInTheDocument();
    expect(screen.getByText(/นายขับ ดี/)).toBeInTheDocument();
  });

  it('declines a ใบ with a reason in the body, never the URL', async () => {
    ready(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await FleetDashboardPage());
    fireEvent.click(within(screen.getByRole('row', { name: /VR-2570-0001/ })).getByRole('button', { name: 'ไม่จัดรถ' }));
    fireEvent.change(screen.getByLabelText('เหตุผล'), { target: { value: 'รถไม่ว่าง' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/requests/f1/decline');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'รถไม่ว่าง' });
  });

  it('tells someone without fleet.manage they have no access and reads nothing', async () => {
    ready(false);
    render(await FleetDashboardPage());
    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
