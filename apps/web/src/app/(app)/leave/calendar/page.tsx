import Link from 'next/link';
import { LeaveQueries, LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday, datesBetween } from '../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../lib/database';
import { formatLeaveMonth } from '../../../../lib/leave-labels';
import { leaveSession } from '../leave-page';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => { const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)); return date.toISOString().slice(0, 7); };
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const partKeys = { FULL: 'leaveCalendarFull', MORNING: 'leaveCalendarMorning', AFTERNOON: 'leaveCalendarAfternoon' } as const;

/** Who in the viewer's units is away on which days, on leave or official travel. It never shows the leave type, the reason, the contact or what a trip is about. */
export default async function LeaveCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await leaveSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('leaveCalendar')}</h2><p role="alert">{t('leaveLoadError')}</p></section>;
  const requested = (await searchParams).month;
  const month = typeof requested === 'string' && monthPattern.test(requested) ? requested : bangkokToday().slice(0, 7);
  const queries = new LeaveQueries(database);
  if ((await queries.headedOrganizationIds(session.personId)).length === 0) return <section><h2>{t('leaveCalendar')}</h2><p>{t('leaveCalendarNotHead')}</p></section>;
  const [rows, holidays] = await Promise.all([queries.teamCalendar(session.personId, month), new LeaveSettingsService(database).listHolidays(Number(month.slice(0, 4)))]);
  const days = datesBetween(`${month}-01`, lastDay(month));
  const closed = new Set(holidays.map((holiday) => holiday.date));
  const weekend = (date: string) => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day === 0 || day === 6; };
  return <section>
    <h2>{t('leaveCalendar')} {formatLeaveMonth(month)}</h2>
    <p className="permission-notice">{t('leaveCalendarHelp')}</p>
    <nav className="calendar-toolbar" aria-label={t('leaveMonth')}>
      <Link href={`/leave/calendar?month=${shiftMonth(month, -1)}`}>{t('leavePreviousMonth')}</Link>
      <strong>{formatLeaveMonth(month)}</strong>
      <Link href={`/leave/calendar?month=${shiftMonth(month, 1)}`}>{t('leaveNextMonth')}</Link>
    </nav>
    {rows.length === 0 ? <p>{t('leaveCalendarEmpty')}</p> : <div className="leave-calendar"><table>
      <thead><tr><th scope="col">{t('leavePerson')}</th>{days.map((date) => <th key={date} scope="col" className={weekend(date) || closed.has(date) ? 'leave-day-off' : undefined}>{Number(date.slice(8))}</th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const byDate = new Map(row.days.map((day) => [day.date, day]));
        return <tr key={row.personId}>
          <th scope="row">{row.displayName ?? '—'}<span>{row.organizationName ?? ''}</span></th>
          {days.map((date) => {
            const day = byDate.get(date);
            if (!day) return <td key={date} className={weekend(date) || closed.has(date) ? 'leave-day-off' : undefined}></td>;
            // A trip shows only that it is official travel and where; never what it is about.
            if (day.kind === 'TRAVEL') { const label = `${t('travelCalendarLabel')} · ${day.place ?? ''}`; return <td key={date} className={`leave-cell travel-cell leave-cell-${day.part.toLowerCase()}`} title={label} aria-label={label}>{t('travelCalendarShort')}</td>; }
            return <td key={date} className={`leave-cell leave-cell-${day.part.toLowerCase()}`}>{t(partKeys[day.part])}</td>;
          })}
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
