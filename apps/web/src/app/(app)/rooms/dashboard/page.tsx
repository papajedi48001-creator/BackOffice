import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthorizationService, bangkokDayStart, RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../lib/actor';
import { addDays, bangkokToday } from '../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../lib/database';
import { monthGrid } from '../month-grid';
import { RoomMonthCalendar } from './room-month-calendar';

const monthFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** ภาพรวม: a month of bookings from everyone; a booking opens its details in a popup. */
export default async function RoomDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string; roomId?: string }> }) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomDashboard')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const params = await searchParams;
  const today = bangkokToday();
  const grid = monthGrid({ month: params.month }, today);
  const queries = new RoomBookingQueries(database);
  const rooms = await queries.listRooms({ bookableOnly: false });
  const selectedRoom = rooms.some((room) => room.id === params.roomId) ? params.roomId : undefined;
  const entries = await queries.calendarForViewer(bangkokDayStart(grid.first), bangkokDayStart(addDays(grid.last, 1)), actor, selectedRoom);
  const scope = new AuthorizationService().organizationScope({ authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }, 'room.booking.decide');
  const pending = scope === 'all' || scope.length > 0 ? (await queries.pendingForApprover(actor)).length : null;
  const monthLink = (month: string) => `/rooms/dashboard?month=${month}${selectedRoom ? `&roomId=${encodeURIComponent(selectedRoom)}` : ''}`;
  const dayHref = `/rooms/calendar?view=day&date={date}${selectedRoom ? `&roomId=${encodeURIComponent(selectedRoom)}` : ''}`;
  const counts: [string, number][] = [
    [t('roomCountToday'), entries.filter((entry) => entry.date === today).length],
    [t('roomCountMonth'), entries.filter((entry) => entry.date.startsWith(grid.month)).length],
    [t('roomCountRooms'), rooms.filter((room) => room.isBookable).length],
    ...(pending === null ? [] : [[t('roomCountPending'), pending] as [string, number]])
  ];
  return <section className="room-dashboard">
    <div className="page-heading"><h2>{t('roomDashboard')}</h2></div>
    <ul className="summary-grid room-dashboard-stats" aria-label={t('roomDashboard')}>
      {counts.map(([label, value]) => <li key={label}><article><span>{label}</span><strong>{value}</strong></article></li>)}
    </ul>
    <div className="calendar-toolbar room-month-toolbar">
      <h2>{monthFormatter.format(new Date(`${grid.month}-01T00:00:00Z`))}</h2>
      <nav aria-label={t('roomDashboard')}>
        <Link href={monthLink(grid.previous)}>{t('roomPreviousMonth')}</Link>
        <Link href={monthLink(today.slice(0, 7))}>{t('roomThisMonth')}</Link>
        <Link href={monthLink(grid.next)}>{t('roomNextMonth')}</Link>
      </nav>
      <form method="get">
        <input type="hidden" name="month" value={grid.month} />
        <label htmlFor="dashboard-room">{t('roomField')}</label>
        <select id="dashboard-room" name="roomId" defaultValue={selectedRoom ?? ''}><option value="">{t('allRooms')}</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
        <button type="submit">{t('showCalendar')}</button>
      </form>
    </div>
    <RoomMonthCalendar grid={grid} dayHref={dayHref} entries={entries.map((entry) => ({ bookingId: entry.bookingId, reference: entry.reference, roomName: entry.roomName, roomPlace: entry.roomPlace, date: entry.date, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString(), status: entry.status, title: entry.title, bookerName: entry.bookerName, bookerOrganizationName: entry.bookerOrganizationName, canOpen: entry.canOpen }))} />
    <p className="room-month-legend"><span>{t('roomLegendApproved')}</span><span className="legend-pending">{t('roomLegendPending')}</span><em>{t('roomDashboardHelp')}</em></p>
  </section>;
}
