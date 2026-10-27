import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), detail: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { detail = mocks.detail; } }));

import NewFleetRequestPage from './page';

const member = (personId: string, displayName: string, status = 'APPROVED') => ({ requestId: `r-${personId}`, personId, displayName, organizationName: null, status, steps: [], canDecide: false });
const travel = {
  travelId: 'travel-1', subject: 'ประชุมวิชาการการพยาบาล', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', vehicle: 'GOVERNMENT_CAR', status: 'APPROVED',
  startDate: '2026-11-10', endDate: '2026-11-11', startHalf: 'AFTERNOON', endHalf: 'MORNING',
  members: [member('person-a', 'นางพรทิพย์ ใจดี'), member('person-b', 'นายสมชาย ดีมาก'), member('person-c', 'นายไม่ไป', 'REJECTED')]
};
const page = (travelId?: string) => NewFleetRequestPage({ searchParams: Promise.resolve(travelId ? { travel: travelId } : {}) });
function ready(view: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.detail.mockResolvedValue(view);
}

afterEach(() => { vi.clearAllMocks(); });

describe('NewFleetRequestPage', () => {
  it('prefills the form from a คำขอไปราชการ: place, province, subject, half-day times and approved people', async () => {
    ready(travel);
    render(await page('travel-1'));
    expect(mocks.detail).toHaveBeenCalledWith('travel-1', expect.objectContaining({ personId: 'person-a' }));
    expect(screen.getByRole('heading', { name: 'ขอใช้รถสำหรับไปราชการ' })).toBeInTheDocument();
    expect(screen.getByLabelText('ภารกิจ')).toHaveValue('ประชุมวิชาการการพยาบาล');
    expect(screen.getByLabelText('ปลายทาง')).toHaveValue('โรงแรมตักสิลา');
    expect(screen.getByLabelText('จังหวัด')).toHaveValue('มหาสารคาม');
    expect(screen.getByLabelText('เวลาออก')).toHaveValue('2026-11-10T13:00');
    expect(screen.getByLabelText('เวลากลับ')).toHaveValue('2026-11-11T12:00');
    expect(screen.getByLabelText('จำนวนผู้โดยสาร')).toHaveValue(2);
    expect(screen.getByLabelText('รายชื่อผู้โดยสาร')).toHaveValue('นางพรทิพย์ ใจดี, นายสมชาย ดีมาก');
  });

  it('uses 08:00 and 17:00 for full days', async () => {
    ready({ ...travel, startHalf: 'FULL', endHalf: 'FULL' });
    render(await page('travel-1'));
    expect(screen.getByLabelText('เวลาออก')).toHaveValue('2026-11-10T08:00');
    expect(screen.getByLabelText('เวลากลับ')).toHaveValue('2026-11-11T17:00');
  });

  it('opens an empty form without a trip, or when the trip is not one the person may see', async () => {
    ready(null);
    render(await page('travel-x'));
    expect(screen.getByRole('heading', { name: 'ขอใช้รถ' })).toBeInTheDocument();
    expect(screen.getByLabelText('ปลายทาง')).toHaveValue('');
    render(await page());
    expect(mocks.detail).toHaveBeenCalledTimes(1);
  });
});
