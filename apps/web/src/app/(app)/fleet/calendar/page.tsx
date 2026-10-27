import Link from 'next/link';
import type { CalendarBlock } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { addDays, formatBangkokDate, formatBangkokTime, formatWeekday } from '../../../../lib/bangkok-time';
import { fleetStatusTone, toBangkokLocal, tripStatusLabel, vehicleStatusLabel } from '../../../../lib/fleet-labels';
import { parseWeekStart } from '../../../../lib/fleet-week';
import { fleetContext, FleetPageMessage } from '../fleet-page';

/** The block's times as seen on `day`: a block running past midnight shows its start or end only on the day it happens. */
function blockTimes(block: CalendarBlock, day: string): string {
  const start = toBangkokLocal(block.startsAt).slice(0, 10) === day ? formatBangkokTime(block.startsAt) : '00:00';
  const end = toBangkokLocal(block.endsAt).slice(0, 10) === day ? formatBangkokTime(block.endsAt) : '24:00';
  return `${start}–${end}`;
}
const onDay = (block: CalendarBlock, day: string) => toBangkokLocal(block.startsAt).slice(0, 10) <= day && block.endsAt > new Date(Date.parse(`${day}T00:00:00+07:00`)).toISOString();

/** ปฏิทินรถ for everyone signed in: each ACTIVE or IN_REPAIR car over a Bangkok week, with only times, province and status. */
export default async function FleetCalendarPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetCalendar" reason={context.reason} />;
  const weekParam = (await searchParams).week;
  const week = parseWeekStart(Array.isArray(weekParam) ? weekParam[0] : weekParam, new Date());
  const rows = await context.queries.calendar(week);
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  return <section>
    <div className="page-heading"><h2>{t('fleetCalendar')}</h2>
      <nav className="page-actions fleet-week-nav" aria-label={t('fleetCalendar')}>
        <Link href={`/fleet/calendar?week=${addDays(week, -7)}`}>{t('fleetPreviousWeek')}</Link>
        <Link href="/fleet/calendar">{t('fleetThisWeek')}</Link>
        <Link href={`/fleet/calendar?week=${addDays(week, 7)}`}>{t('fleetNextWeek')}</Link>
      </nav>
    </div>
    <p className="permission-notice">{t('fleetCalendarHelp')}</p>
    {rows.length === 0 ? <p>{t('fleetNoVehicles')}</p> : <div className="leave-calendar fleet-calendar"><table>
      <thead><tr><th>{t('fleetVehicle')}</th>{days.map((day) => <th key={day}>{formatWeekday(day)}<br /><small>{formatBangkokDate(day)}</small></th>)}</tr></thead>
      <tbody>{rows.map(({ vehicle, blocks }) => <tr key={vehicle.id}>
        <th scope="row">{vehicle.registration}<br /><small>{vehicle.makeModel}{vehicle.status !== 'ACTIVE' ? ` · ${vehicleStatusLabel(vehicle.status)}` : ''}</small></th>
        {days.map((day) => <td key={day}>{blocks.filter((block) => onDay(block, day)).map((block, index) => <div key={index} className={`fleet-block status-${fleetStatusTone(block.status)}`}>
          <span>{blockTimes(block, day)}</span> <span>{block.province || '—'}</span> <span>{tripStatusLabel(block.status)}</span>
        </div>)}</td>)}
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
