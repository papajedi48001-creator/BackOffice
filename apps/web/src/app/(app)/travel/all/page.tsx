import { OfficialTravelQueries, type TravelFilter } from '@backoffice/core';
import { travelTypeCodeSchema } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { leaveStatusLabel } from '../../../../lib/leave-labels';
import { TRAVEL_TYPES, travelTypeLabel } from '../../../../lib/travel-labels';
import { HrPageMessage } from '../../leave/hr-page-message';
import { TravelTable } from '../travel-list';
import { hrTravelContext } from '../travel-page';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const statuses = ['IN_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export default async function AllTravelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await hrTravelContext();
  if (!context.ok) return <HrPageMessage titleKey="travelAll" reason={context.reason} />;
  const params = await searchParams;
  const today = bangkokToday();
  const from = datePattern.test(one(params.from)) ? one(params.from) : `${today.slice(0, 7)}-01`;
  const to = datePattern.test(one(params.to)) ? one(params.to) : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const filter: TravelFilter = { from, to };
  const status = statuses.find((value) => value === one(params.status));
  if (status) filter.status = status;
  const type = travelTypeCodeSchema.safeParse(one(params.travelType));
  if (type.success) filter.travelType = type.data;
  const items = await new OfficialTravelQueries(context.database).all(filter);
  return <section>
    <h2>{t('travelAll')}</h2>
    <form aria-label={t('leaveFilter')} className="leave-filter" method="get" action="/travel/all">
      <div className="form-field"><label htmlFor="all-from">{t('leaveStartDate')}</label><input id="all-from" name="from" type="date" defaultValue={from} /></div>
      <div className="form-field"><label htmlFor="all-to">{t('leaveEndDate')}</label><input id="all-to" name="to" type="date" defaultValue={to} /></div>
      <div className="form-field"><label htmlFor="all-status">{t('status')}</label><select id="all-status" name="status" defaultValue={filter.status ?? ''}><option value="">{t('leaveAllStatuses')}</option>{statuses.map((value) => <option key={value} value={value}>{leaveStatusLabel(value)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="all-type">{t('travelType')}</label><select id="all-type" name="travelType" defaultValue={filter.travelType ?? ''}><option value="">{t('leaveAllTypes')}</option>{TRAVEL_TYPES.map((code) => <option key={code} value={code}>{travelTypeLabel(code)}</option>)}</select></div>
      <div className="form-actions"><button type="submit">{t('leaveFilter')}</button></div>
    </form>
    {items.length === 0 ? <p>{t('travelNoneFound')}</p> : <TravelTable items={items} showLeader />}
  </section>;
}
