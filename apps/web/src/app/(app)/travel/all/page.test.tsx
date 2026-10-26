import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), all: vi.fn(), mine: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { all = mocks.all; mine = mocks.mine; } }));

import AllTravelPage from './page';
import MyTravelPage from '../mine/page';

const item = { travelId: 'travel-1', subject: 'ประชุมวิชาการ', place: 'ศาลากลาง', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', startDate: '2026-11-10', endDate: '2026-11-10', startHalf: 'FULL', endHalf: 'FULL', days: 1, status: 'APPROVED', leaderDisplayName: 'นางพรทิพย์ ใจดี', memberCount: 2, reportStatus: 'MISSING' };
function ready() {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'hr-1', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });
  mocks.getSharedDatabase.mockReturnValue({});
}

afterEach(() => vi.clearAllMocks());

describe('travel lists and the report column', () => {
  it('shows HR which approved trips have no report and filters for them', async () => {
    ready();
    mocks.all.mockResolvedValue([item]);
    render(await AllTravelPage({ searchParams: Promise.resolve({ from: '2026-11-01', to: '2026-11-30', reportMissing: 'on' }) }));
    expect(mocks.all).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30', reportMissing: true });
    expect(within(screen.getByRole('row', { name: /ประชุมวิชาการ/ })).getByText('ยังไม่ส่ง')).toBeInTheDocument();
    expect(screen.getByLabelText('เฉพาะที่ยังไม่ส่งรายงาน')).toBeChecked();
  });

  it('leaves the report filter out when it is not asked for', async () => {
    ready();
    mocks.all.mockResolvedValue([]);
    render(await AllTravelPage({ searchParams: Promise.resolve({ from: '2026-11-01', to: '2026-11-30' }) }));
    expect(mocks.all).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('tells me on my own list that a trip still needs a report', async () => {
    ready();
    mocks.mine.mockResolvedValue([item]);
    render(await MyTravelPage());
    expect(within(screen.getByRole('row', { name: /ประชุมวิชาการ/ })).getByText('ยังไม่ส่ง')).toBeInTheDocument();
  });
});
