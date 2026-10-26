import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), pendingForApprover: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OfficialTravelQueries: class { pendingForApprover = mocks.pendingForApprover; } }));

import TravelApprovalsPage from './page';

const row = { requestId: 'r-b', travelId: 'travel-1', personId: 'person-b', personDisplayName: 'นายสมชาย ดีมาก', organizationName: 'งานเภสัชกรรม', subject: 'ประชุมวิชาการ', place: 'ศาลากลาง', travelType: 'IN_PROVINCE', startDate: '2026-11-10', endDate: '2026-11-10', startHalf: 'FULL', endHalf: 'FULL', days: 1, submittedAt: null };
function ready(rows: unknown[]) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.pendingForApprover.mockResolvedValue(rows);
}

afterEach(() => vi.clearAllMocks());

describe('TravelApprovalsPage', () => {
  it('lists each person waiting on me with a link to their trip', async () => {
    ready([row]);
    render(await TravelApprovalsPage());
    expect(mocks.pendingForApprover).toHaveBeenCalledWith('head-1');
    const person = screen.getByRole('row', { name: /นายสมชาย ดีมาก/ });
    expect(within(person).getByRole('link', { name: 'ประชุมวิชาการ' })).toHaveAttribute('href', '/travel/travel-1');
    expect(within(person).getByText('ในจังหวัด')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    ready([]);
    render(await TravelApprovalsPage());
    expect(screen.getByText('ไม่มีคำขอไปราชการรอคุณพิจารณา')).toBeInTheDocument();
  });
});
