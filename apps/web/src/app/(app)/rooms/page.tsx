import Link from 'next/link';
import { redirect } from 'next/navigation';
import { bangkokDayStart, RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../lib/actor';
import { addDays, bangkokToday, datesBetween, formatBangkokDate, mondayOf } from '../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../lib/database';
import { RoomCalendar } from './room-calendar';

export default async function RoomCalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; roomId?: string }> }) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomCalendarTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const { week, roomId } = await searchParams;
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokToday());
  const dates = datesBetween(monday, addDays(monday, 6));
  const queries = new RoomBookingQueries(database);
  const rooms = await queries.listRooms({ bookableOnly: false });
  const selectedRoom = rooms.some((room) => room.id === roomId) ? roomId : undefined;
  const entries = await queries.calendar(bangkokDayStart(monday), bangkokDayStart(addDays(monday, 7)), selectedRoom);
  const weekLink = (date: string) => `/rooms?week=${date}${selectedRoom ? `&roomId=${selectedRoom}` : ''}`;
  return <section>
    <div className="page-heading"><h2>{t('roomCalendarTitle')}</h2><nav className="page-actions"><Link href="/rooms/bookings">{t('myRoomBookings')}</Link><Link className="button-link" href="/rooms/bookings/new">{t('bookRoom')}</Link></nav></div>
    <form className="calendar-toolbar" method="get">
      <input type="hidden" name="week" value={monday} />
      <label htmlFor="calendar-room">{t('roomField')}</label>
      <select id="calendar-room" name="roomId" defaultValue={selectedRoom ?? ''}><option value="">{t('allRooms')}</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
      <button type="submit">{t('showCalendar')}</button>
      <Link href={weekLink(addDays(monday, -7))}>{t('previousWeek')}</Link>
      <span>{formatBangkokDate(dates[0]!)} – {formatBangkokDate(dates[6]!)}</span>
      <Link href={weekLink(addDays(monday, 7))}>{t('nextWeek')}</Link>
    </form>
    <RoomCalendar dates={dates} entries={entries.map((entry) => ({ ...entry, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString() }))} />
  </section>;
}
