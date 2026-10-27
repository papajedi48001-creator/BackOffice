import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), refresh: vi.fn(), push: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn(), activeRequestForTravel: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { detail = mocks.detail; }, FleetQueries: class { activeRequestForTravel = mocks.activeRequestForTravel; } }));

import TravelPage from './page';

const step = (status: string) => ({ sequence: 1, assigneeDisplayName: 'หัวหน้างาน', status, decidedAt: null, decisionReason: null });
const detail = {
  travelId: 'travel-1', subject: 'ประชุมวิชาการการพยาบาล', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', startDate: '2026-11-10', endDate: '2026-11-11', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'IN_REVIEW', leaderDisplayName: 'นางพรทิพย์ ใจดี', memberCount: 2,
  organiser: 'สสจ.มหาสารคาม', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', costs: { allowance: 240, lodging: 0, transport: 0, registration: 1000, total: 1240 }, leaderPersonId: 'person-a',
  members: [
    { requestId: 'r-a', personId: 'person-a', displayName: 'นางพรทิพย์ ใจดี', organizationName: 'งานผู้ป่วยใน', status: 'IN_REVIEW', steps: [step('PENDING')], canDecide: false },
    { requestId: 'r-b', personId: 'person-b', displayName: 'นายสมชาย ดีมาก', organizationName: 'งานผู้ป่วยใน', status: 'IN_REVIEW', steps: [step('PENDING')], canDecide: true }
  ],
  canEdit: false, canCancel: false, reportStatus: 'NOT_DUE', report: null, canReport: false
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

  it('lets the หัวหน้าคณะ file the report after an approved trip', async () => {
    ready({ ...detail, status: 'APPROVED', canReport: true, reportStatus: 'MISSING' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await TravelPage(params()));
    const form = screen.getByRole('form', { name: 'รายงานการไปราชการ' });
    fireEvent.change(within(form).getByLabelText('สรุปสาระสำคัญที่ได้รับ'), { target: { value: 'ได้แนวทางใหม่' } });
    fireEvent.change(within(form).getByLabelText('การนำไปใช้ประโยชน์'), { target: { value: 'อบรมต่อในหน่วยงาน' } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/travel/travel-1/report');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ summary: 'ได้แนวทางใหม่', application: 'อบรมต่อในหน่วยงาน' });
  });

  it('shows a filed report to everyone who may see the trip, with no form for them', async () => {
    ready({ ...detail, status: 'APPROVED', reportStatus: 'SUBMITTED', report: { summary: 'ได้แนวทางใหม่', application: 'อบรมต่อในหน่วยงาน', submittedAt: '2026-11-12T03:00:00Z', updatedAt: '2026-11-12T03:00:00Z' } });
    render(await TravelPage(params()));
    expect(screen.getByRole('heading', { name: 'รายงานการไปราชการ' })).toBeInTheDocument();
    expect(screen.getByText('อบรมต่อในหน่วยงาน')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'รายงานการไปราชการ' })).toBeNull();
    expect(screen.getByRole('link', { name: 'พิมพ์แบบขออนุมัติ' })).toHaveAttribute('href', '/travel/travel-1/print');
  });
  describe('ขอใช้รถ', () => {
    const approved = { ...detail, status: 'APPROVED', endDate: '2026-11-11', members: detail.members.map((member) => ({ ...member, status: 'APPROVED' })) };
    const asMember = (view: unknown, existing: { id: string; reference: string; requesterPersonId: string } | null = null, personId = 'person-a', roles: unknown[] = []) => {
      ready(view);
      mocks.readSession.mockResolvedValue({ authenticated: true, personId, roles, dataOwnerModules: [] });
      mocks.activeRequestForTravel.mockResolvedValue(existing);
    };
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('offers ขอใช้รถ to an approved member of an approved trip by รถราชการ that has not ended', async () => {
      asMember(approved);
      render(await TravelPage(params()));
      expect(screen.getByRole('link', { name: 'ขอใช้รถ' })).toHaveAttribute('href', '/fleet/new?travel=travel-1');
    });

    it('links the requester to the ใบ already filed instead', async () => {
      asMember(approved, { id: 'f9', reference: 'VR-2570-0009', requesterPersonId: 'person-a' });
      render(await TravelPage(params()));
      expect(screen.queryByRole('link', { name: 'ขอใช้รถ' })).toBeNull();
      expect(screen.getByRole('link', { name: 'ดูใบขอใช้รถ' })).toHaveAttribute('href', '/fleet/requests/f9');
    });

    it('tells a co-traveller who did not file it that the trip has a ใบ, without a link they could not open', async () => {
      asMember(approved, { id: 'f9', reference: 'VR-2570-0009', requesterPersonId: 'person-b' });
      render(await TravelPage(params()));
      expect(screen.queryByRole('link', { name: 'ดูใบขอใช้รถ' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'ขอใช้รถ' })).toBeNull();
      expect(screen.getByText('มีใบขอใช้รถแล้ว VR-2570-0009')).toBeInTheDocument();
    });

    it('links the หัวหน้าหมวดยานพาหนะ to the ใบ when they are going too', async () => {
      asMember(approved, { id: 'f9', reference: 'VR-2570-0009', requesterPersonId: 'person-b' }, 'person-a', [{ name: 'fleet-manager', organizationId: null }]);
      render(await TravelPage(params()));
      expect(screen.getByRole('link', { name: 'ดูใบขอใช้รถ' })).toHaveAttribute('href', '/fleet/requests/f9');
    });

    it('offers nothing for a private car, a trip still in review, an ended trip or someone not going', async () => {
      for (const view of [{ ...approved, vehicle: 'PRIVATE_CAR' }, { ...approved, status: 'IN_REVIEW' }, { ...approved, endDate: '2026-10-26' }]) {
        asMember(view);
        const { unmount } = render(await TravelPage(params()));
        expect(screen.queryByRole('link', { name: 'ขอใช้รถ' })).toBeNull();
        unmount();
      }
      ready(approved);
      mocks.activeRequestForTravel.mockResolvedValue(null);
      render(await TravelPage(params()));
      expect(screen.queryByRole('link', { name: 'ขอใช้รถ' })).toBeNull();
    });
  });
});
