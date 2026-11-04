import Link from 'next/link';
import { redirect } from 'next/navigation';
import { bangkokDayStart, RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../lib/actor';
import { addDays, bangkokToday, formatBangkokDate } from '../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../lib/database';
import { calendarView } from '../calendar-view';
import { RoomCalendar } from '../room-calendar';
import { holidayMap } from '../../../../lib/holiday-data';

export default async function RoomCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; week?: string; date?: string; roomId?: string }> }) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomCalendarTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const params = await searchParams;
  const roomId = params.roomId;
  const view = calendarView(params, bangkokToday());
  const { dates } = view;
  const queries = new RoomBookingQueries(database);
  const rooms = await queries.listRooms({ bookableOnly: false });
  const selectedRoom = rooms.some((room) => room.id === roomId) ? roomId : undefined;
  const [entries, holidays] = await Promise.all([queries.calendar(bangkokDayStart(dates[0]!), bangkokDayStart(addDays(dates[dates.length - 1]!, 1)), selectedRoom), holidayMap(database, dates[0]!, dates[dates.length - 1]!)]);
  const roomParam = selectedRoom ? `&roomId=${encodeURIComponent(selectedRoom)}` : '';
  const weekLink = (date: string) => `/rooms/calendar?week=${date}${roomParam}`;
  const dayLink = (date: string) => `/rooms/calendar?view=day&date=${date}${roomParam}`;
  const pageLink = view.view === 'day' ? dayLink : weekLink;
  return <section>
    <div className="page-heading"><h2>{t('roomCalendarTitle')}</h2></div>
    <form className="calendar-toolbar" method="get">
      {view.view === 'day' ? <><input type="hidden" name="view" value="day" /><input type="hidden" name="date" value={view.anchor} /></> : <input type="hidden" name="week" value={view.anchor} />}
      <label htmlFor="calendar-room">{t('roomField')}</label>
      <select id="calendar-room" name="roomId" defaultValue={selectedRoom ?? ''}><option value="">{t('allRooms')}</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
      <button type="submit">{t('showCalendar')}</button>
      <Link href={pageLink(view.previous)}>{view.view === 'day' ? t('previousDay') : t('previousWeek')}</Link>
      <span>{view.view === 'day' ? formatBangkokDate(view.anchor) : `${formatBangkokDate(dates[0]!)} – ${formatBangkokDate(dates[6]!)}`}</span>
      <Link href={pageLink(view.next)}>{view.view === 'day' ? t('nextDay') : t('nextWeek')}</Link>
      {view.view === 'day' ? <Link href={weekLink(view.anchor)}>{t('weekView')}</Link> : <Link href={dayLink(bangkokToday())}>{t('dayView')}</Link>}
    </form>
    <RoomCalendar holidays={holidays} dates={dates} dayHref={view.view === 'week' ? dayLink : undefined} entries={entries.map((entry) => ({ ...entry, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString() }))} />
  </section>;
}
