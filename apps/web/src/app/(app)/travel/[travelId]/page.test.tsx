import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), refresh: vi.fn(), push: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { detail = mocks.detail; } }));

import TravelPage from './page';

const step = (status: string) => ({ sequence: 1, assigneeDisplayName: 'หัวหน้างาน', status, decidedAt: null, decisionReason: null });
const detail = {
  travelId: 'travel-1', subject: 'ประชุมวิชาการการพยาบาล', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', startDate: '2026-11-10', endDate: '2026-11-11', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'IN_REVIEW', leaderDisplayName: 'นางพรทิพย์ ใจดี', memberCount: 2,
  organiser: 'สสจ.มหาสารคาม', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', costs: { allowance: 240, lodging: 0, transport: 0, registration: 1000, total: 1240 }, leaderPersonId: 'person-a',
  members: [
    { requestId: 'r-a', personId: 'person-a', displayName: 'นางพรทิพย์ ใจดี', organizationName: 'งานผู้ป่วยใน', status: 'IN_REVIEW', steps: [step('PENDING')], canDecide: false },
    { requestId: 'r-b', personId: 'person-b', displayName: 'นายสมชาย ดีมาก', organizationName: 'งานผู้ป่วยใน', status: 'IN_REVIEW', steps: [step('PENDING')], canDecide: true }
  ],
  canEdit: false, canCancel: false
};
const params = (travelId = 'travel-1') => ({ params: Promise.resolve({ travelId }) });
function ready(view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.detail.mockResolvedValue(view);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('TravelPage', () => {
  it('shows the trip, each person with their own status, and decide buttons only where the viewer decides', async () => {
    ready(detail);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'd1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await TravelPage(params()));
    expect(screen.getByRole('heading', { name: /ประชุมวิชาการการพยาบาล/ })).toBeInTheDocument();
    expect(screen.getByText('1,240.00 บาท')).toBeInTheDocument();
    expect(screen.getByText('รถราชการ')).toBeInTheDocument();
    const first = screen.getByRole('row', { name: /นางพรทิพย์ ใจดี/ });
    expect(within(first).getByText('หัวหน้าคณะ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อนุมัติ นางพรทิพย์ ใจดี' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติ นายสมชาย ดีมาก' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/requests/r-b/decisions');
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'APPROVE' });
  });

  it('is not found for someone who may not see it', async () => {
    ready(null);
    await TravelPage(params());
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
