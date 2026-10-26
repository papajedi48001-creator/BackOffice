import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { detail = mocks.detail; } }));

import TravelPrintPage from './page';

const member = (requestId: string, personId: string, displayName: string, status: string, stepStatus: string) => ({ requestId, personId, displayName, organizationName: 'งานผู้ป่วยใน', status, steps: [{ sequence: 1, assigneeDisplayName: 'หัวหน้างาน', status: stepStatus, decidedAt: '2026-11-02T03:00:00Z', decisionReason: 'ลายมือชื่อไม่ครบ' }], canDecide: false });
const detail = {
  travelId: 'travel-1', subject: 'ประชุมวิชาการการพยาบาล', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', startDate: '2026-11-10', endDate: '2026-11-11', startHalf: 'FULL', endHalf: 'FULL', days: 2, status: 'APPROVED', leaderDisplayName: 'นางพรทิพย์ ใจดี', memberCount: 3, reportStatus: 'NOT_DUE',
  organiser: 'สสจ.มหาสารคาม', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', costs: { allowance: 240, lodging: 0, transport: 0, registration: 1000, total: 1240 }, leaderPersonId: 'person-a',
  members: [member('r-a', 'person-a', 'นางพรทิพย์ ใจดี', 'APPROVED', 'APPROVED'), member('r-b', 'person-b', 'นายสมชาย ดีมาก', 'APPROVED', 'APPROVED'), member('r-c', 'person-c', 'นางสาวมาลี สุขใจ', 'REJECTED', 'REJECTED')],
  canEdit: false, canCancel: false, report: null, canReport: false, filedAt: '2026-11-01T02:00:00Z'
};
const params = (travelId = 'travel-1') => ({ params: Promise.resolve({ travelId }) });
function ready(view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.detail.mockResolvedValue(view);
}

afterEach(() => vi.clearAllMocks());

describe('TravelPrintPage', () => {
  it('prints the บันทึกข้อความ with the people going, the costs and no decision reasons', async () => {
    ready(detail);
    render(await TravelPrintPage(params()));
    expect(screen.getByRole('heading', { name: 'บันทึกข้อความ' })).toBeInTheDocument();
    expect(screen.getByText('เรื่อง ขออนุมัติเดินทางไปราชการ')).toBeInTheDocument();
    expect(screen.getByText(/เรียน ผู้อำนวยการโรงพยาบาลวาริชภูมิ/)).toBeInTheDocument();
    expect(screen.getByText('นายสมชาย ดีมาก')).toBeInTheDocument();
    // A rejected person is not going, so the form leaves them out.
    expect(screen.queryByText('นางสาวมาลี สุขใจ')).toBeNull();
    expect(screen.getByText('1,240.00 บาท')).toBeInTheDocument();
    // Two people going × 1,240.
    expect(screen.getByText('2,480.00 บาท')).toBeInTheDocument();
    expect(screen.getByText(/^ลงชื่อ/)).toHaveTextContent('นางพรทิพย์ ใจดี');
    expect(screen.queryByText(/ลายมือชื่อไม่ครบ/)).toBeNull();
    expect(screen.getByText('วันที่ 1 พ.ย. 2569')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'พิมพ์' })).toBeInTheDocument();
  });

  it("names the หัวหน้าคณะ's unit even when the หัวหน้าคณะ is not going", async () => {
    ready({ ...detail, members: [{ ...detail.members[0], status: 'REJECTED', organizationName: 'งานบริหาร' }, { ...detail.members[1], organizationName: 'งานเภสัชกรรม' }] });
    render(await TravelPrintPage(params()));
    expect(screen.getByText(/ส่วนราชการ/)).toHaveTextContent('งานบริหาร');
  });

  it('is not found for someone who may not see the trip', async () => {
    ready(null);
    await TravelPrintPage(params('hidden'));
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
