import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), teamCalendar: vi.fn(), headedOrganizationIds: vi.fn(), listHolidays: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveQueries: class { teamCalendar = mocks.teamCalendar; headedOrganizationIds = mocks.headedOrganizationIds; }, LeaveSettingsService: class { listHolidays = mocks.listHolidays; } }));

import LeaveCalendarPage from './page';

function ready() {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'head-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.listHolidays.mockResolvedValue([]);
}

afterEach(() => vi.clearAllMocks());

describe('LeaveCalendarPage', () => {
  it('shows names and half days of the headed units with no leave type', async () => {
    ready();
    mocks.headedOrganizationIds.mockResolvedValue(['unit-1']);
    mocks.teamCalendar.mockResolvedValue([{ personId: 'p1', displayName: 'สมชาย ใจดี', organizationName: 'งานผู้ป่วยใน', days: [{ date: '2026-12-01', part: 'MORNING', kind: 'LEAVE' }, { date: '2026-12-02', part: 'FULL', kind: 'LEAVE' }, { date: '2026-12-03', part: 'FULL', kind: 'TRAVEL', place: 'ศาลากลาง' }] }]);
    render(await LeaveCalendarPage({ searchParams: Promise.resolve({ month: '2026-12' }) }));
    expect(mocks.teamCalendar).toHaveBeenCalledWith('head-1', '2026-12');
    expect(screen.getByRole('heading', { name: /ธันวาคม 2569/ })).toBeInTheDocument();
    const person = screen.getByRole('row', { name: /สมชาย ใจดี/ });
    expect(within(person).getByText('เช้า')).toBeInTheDocument();
    expect(within(person).getByText('ลา')).toBeInTheDocument();
    expect(within(person).getByTitle('ไปราชการ · ศาลากลาง')).toHaveTextContent('ราชการ');
    expect(screen.queryByText(/ลาพักผ่อน|ลาป่วย/)).toBeNull();
    expect(screen.getByRole('link', { name: 'เดือนถัดไป' })).toHaveAttribute('href', '/leave/calendar?month=2027-01');
  });

  it('shows a leave half and a trip half on the same date in one cell', async () => {
    ready();
    mocks.headedOrganizationIds.mockResolvedValue(['unit-1']);
    mocks.teamCalendar.mockResolvedValue([{ personId: 'p1', displayName: 'สมชาย ใจดี', organizationName: 'งานผู้ป่วยใน', days: [{ date: '2026-12-01', part: 'MORNING', kind: 'LEAVE' }, { date: '2026-12-01', part: 'AFTERNOON', kind: 'TRAVEL', place: 'ศาลากลาง' }] }]);
    render(await LeaveCalendarPage({ searchParams: Promise.resolve({ month: '2026-12' }) }));
    const person = screen.getByRole('row', { name: /สมชาย ใจดี/ });
    const cell = within(person).getByLabelText('ลา เช้า · ไปราชการ บ่าย · ศาลากลาง');
    expect(cell).toHaveTextContent('เช้า/ราชการ');
  });

  it('tells someone who heads no unit what the calendar is for', async () => {
    ready();
    mocks.headedOrganizationIds.mockResolvedValue([]);
    render(await LeaveCalendarPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('ปฏิทินนี้สำหรับหัวหน้าหน่วยงาน คุณยังไม่ได้เป็นหัวหน้าหน่วยงานใด')).toBeInTheDocument();
    expect(mocks.teamCalendar).not.toHaveBeenCalled();
  });
});
