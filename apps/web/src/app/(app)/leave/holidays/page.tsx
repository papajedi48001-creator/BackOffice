import Link from 'next/link';
import { LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { HrPageMessage } from '../hr-page-message';
import { hrLeaveContext } from '../leave-page';
import { HolidayAddForm, HolidayRow } from './holiday-forms';

export default async function LeaveHolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await hrLeaveContext();
  if (!context.ok) return <HrPageMessage titleKey="leaveHolidays" reason={context.reason} />;
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2200 ? requested : Number(bangkokToday().slice(0, 4));
  const holidays = await new LeaveSettingsService(context.database).listHolidays(year);
  return <section>
    <h2>{t('leaveHolidays')} {year + 543}</h2>
    <nav className="calendar-toolbar" aria-label={t('leaveYear')}><Link href={`/leave/holidays?year=${year - 1}`}>{year + 542}</Link><strong>{year + 543}</strong><Link href={`/leave/holidays?year=${year + 1}`}>{year + 544}</Link></nav>
    <HolidayAddForm year={year} />
    {holidays.length === 0 ? <p>{t('leaveNoHolidays')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('leaveHolidayDate')}</th><th>{t('leaveHolidayName')}</th><th /></tr></thead>
      <tbody>{holidays.map((holiday) => <HolidayRow key={holiday.date} holiday={holiday} />)}</tbody>
    </table></div>}
  </section>;
}
