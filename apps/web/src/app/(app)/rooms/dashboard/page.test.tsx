import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), calendarForViewer: vi.fn(), listRooms: vi.fn(), pendingForApprover: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), RoomBookingQueries: class { calendarForViewer = mocks.calendarForViewer; listRooms = mocks.listRooms; pendingForApprover = mocks.pendingForApprover; } }));

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import RoomDashboardPage from './page';
import { RoomMonthCalendar } from './room-month-calendar';

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = findElement(child, type); if (found) return found; } return undefined; }
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  return node.type === type ? node : findElement(node.props.children as ReactNode, type);
}

const room = { id: 'r1', name: 'ห้องประชุมใหญ่', place: 'อาคารอำนวยการ ชั้น 2', capacity: 40, equipment: null, ownerOrganizationId: 'o1', ownerOrganizationName: 'งานบริหาร', isBookable: true, upcomingBookingCount: 0 };
const entry = { bookingId: 'b1', reference: 'RB-2569-0007', roomId: 'r1', roomName: 'ห้องประชุมใหญ่', roomPlace: 'อาคารอำนวยการ ชั้น 2', date: '2026-11-02', startsAt: new Date('2026-11-02T02:00:00Z'), endsAt: new Date('2026-11-02T05:00:00Z'), status: 'APPROVED', title: 'ประชุมกรรมการบริหาร', bookerName: 'สมใจ ใจดี', bookerOrganizationName: 'งานการพยาบาล', canOpen: false };

function ready(roles: { name: string; organizationId: string | null }[] = []) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-1', roles, dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.listRooms.mockResolvedValue([room, { ...room, id: 'r2', name: 'ห้องเล็ก', isBookable: false }]);
  mocks.calendarForViewer.mockResolvedValue([entry, { ...entry, bookingId: 'b2', date: '2026-11-20', startsAt: new Date('2026-11-20T02:00:00Z'), endsAt: new Date('2026-11-20T03:00:00Z') }]);
  mocks.pendingForApprover.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T03:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('RoomDashboardPage', () => {
  it('shows this month with every booking, the counts, and links to move between months', async () => {
    ready();
    render(await RoomDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeInTheDocument();
    expect(mocks.calendarForViewer).toHaveBeenCalledWith(new Date('2026-10-25T17:00:00Z'), new Date('2026-12-06T17:00:00Z'), { personId: 'person-1', roles: [] }, undefined);
    const counts = screen.getByRole('list', { name: 'ภาพรวม' });
    for (const [label, value] of [['การจองวันนี้', '1'], ['การจองในเดือนนี้', '2'], ['ห้องที่เปิดให้จอง', '1']]) expect(within(counts).getByText(label).closest('li')).toHaveTextContent(value!);
    expect(within(counts).queryByText('รออนุมัติ')).toBeNull();
    expect(screen.getByRole('link', { name: 'เดือนก่อน' })).toHaveAttribute('href', '/rooms/dashboard?month=2026-10');
    expect(screen.getByRole('link', { name: 'เดือนถัดไป' })).toHaveAttribute('href', '/rooms/dashboard?month=2026-12');
    expect(within(screen.getByRole('region', { name: '20 พ.ย. 2569' })).getByRole('button', { name: /สมใจ ใจดี/ })).toBeInTheDocument();
  });

  it('counts what waits for an approver and keeps the room filter in the month links', async () => {
    ready([{ name: 'room-booking-approver', organizationId: null }]);
    render(await RoomDashboardPage({ searchParams: Promise.resolve({ month: '2027-01', roomId: 'r1' }) }));
    expect(screen.getByRole('heading', { name: 'มกราคม 2570' })).toBeInTheDocument();
    expect(mocks.calendarForViewer).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), expect.anything(), 'r1');
    expect(within(screen.getByRole('list', { name: 'ภาพรวม' })).getByText('รออนุมัติ').closest('li')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'เดือนถัดไป' })).toHaveAttribute('href', '/rooms/dashboard?month=2027-02&roomId=r1');
  });

  it('ignores a room that does not exist', async () => {
    ready();
    render(await RoomDashboardPage({ searchParams: Promise.resolve({ roomId: 'nope' }) }));
    expect(mocks.calendarForViewer).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), expect.anything(), undefined);
  });

  it('hands the client calendar only serialisable props, so the server can render it', async () => {
    ready();
    const calendar = findElement(await RoomDashboardPage({ searchParams: Promise.resolve({ roomId: 'r1' }) }), RoomMonthCalendar)!;
    for (const value of Object.values(calendar.props)) expect(typeof value).not.toBe('function');
    expect(calendar.props.dayHref).toBe('/rooms/calendar?view=day&date={date}&roomId=r1');
  });
});
