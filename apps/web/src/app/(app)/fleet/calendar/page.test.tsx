import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), calendar: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), FleetQueries: class { calendar = mocks.calendar; } }));

import FleetCalendarPage from './page';

afterEach(() => { vi.clearAllMocks(); });

describe('FleetCalendarPage', () => {
  it('shows the week from its Monday, one row per car, with blocks of time, province and status only', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.calendar.mockResolvedValue([
      { vehicle: { id: 'v1', registration: 'กข 1234', makeModel: 'Toyota Commuter', status: 'ACTIVE' }, blocks: [{ startsAt: '2026-10-28T01:00:00.000Z', endsAt: '2026-10-28T09:00:00.000Z', province: 'ขอนแก่น', status: 'PLANNED' }] },
      { vehicle: { id: 'v2', registration: 'นข 5678', makeModel: 'Isuzu D-Max', status: 'IN_REPAIR' }, blocks: [] }
    ]);
    const { container } = render(await FleetCalendarPage({ searchParams: Promise.resolve({ week: '2026-10-29' }) }));
    expect(mocks.calendar).toHaveBeenCalledWith('2026-10-26');
    expect(screen.getByRole('row', { name: /กข 1234/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /นข 5678/ })).toHaveTextContent('ซ่อม');
    const blocks = container.querySelectorAll('.fleet-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveTextContent('08:00–16:00 ขอนแก่น รอออกเดินทาง');
    expect(screen.getByRole('link', { name: 'สัปดาห์ถัดไป' })).toHaveAttribute('href', '/fleet/calendar?week=2026-11-02');
    expect(screen.getByRole('link', { name: 'สัปดาห์ก่อน' })).toHaveAttribute('href', '/fleet/calendar?week=2026-10-19');
  });
});
