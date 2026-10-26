import { LeaveQueries, LeaveSettingsService, type LeaveFilter } from '@backoffice/core';
import { requestStatusSchema } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { leaveStatusLabel } from '../../../../lib/leave-labels';
import { HrPageMessage } from '../hr-page-message';
import { LeaveTable } from '../leave-list';
import { hrLeaveContext } from '../leave-page';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const statuses = ['IN_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default async function AllLeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await hrLeaveContext();
  if (!context.ok) return <HrPageMessage titleKey="leaveAll" reason={context.reason} />;
  const params = await searchParams;
  const today = bangkokToday();
  const from = datePattern.test(one(params.from)) ? one(params.from) : `${today.slice(0, 7)}-01`;
  const to = datePattern.test(one(params.to)) ? one(params.to) : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const filter: LeaveFilter = { from, to };
  const status = requestStatusSchema.safeParse(one(params.status));
  if (status.success) filter.status = status.data;
  if (one(params.leaveTypeId)) filter.leaveTypeId = one(params.leaveTypeId);
  const [items, types] = await Promise.all([new LeaveQueries(context.database).allLeave(filter), new LeaveSettingsService(context.database).listTypes()]);
  const fields = <>
    <div className="form-field"><label htmlFor="all-from">{t('leaveStartDate')}</label><input id="all-from" name="from" type="date" defaultValue={from} /></div>
    <div className="form-field"><label htmlFor="all-to">{t('leaveEndDate')}</label><input id="all-to" name="to" type="date" defaultValue={to} /></div>
    <div className="form-field"><label htmlFor="all-status">{t('status')}</label><select id="all-status" name="status" defaultValue={filter.status ?? ''}><option value="">{t('leaveAllStatuses')}</option>{statuses.map((value) => <option key={value} value={value}>{leaveStatusLabel(value)}</option>)}</select></div>
    <div className="form-field"><label htmlFor="all-type">{t('leaveType')}</label><select id="all-type" name="leaveTypeId" defaultValue={filter.leaveTypeId ?? ''}><option value="">{t('leaveAllTypes')}</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
  </>;
  return <section>
    <h2>{t('leaveAll')}</h2>
    <form aria-label={t('leaveFilter')} className="leave-filter" method="get" action="/leave/all">{fields}<div className="form-actions"><button type="submit">{t('leaveFilter')}</button></div></form>
    {items.length === 0 ? <p>{t('leaveNoneFound')}</p> : <LeaveTable items={items} showPerson />}
    <form aria-label={t('leaveDownloadCsv')} className="reason-form" method="post" action="/api/leave/all">
      <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />
      {filter.status && <input type="hidden" name="status" value={filter.status} />}
      {filter.leaveTypeId && <input type="hidden" name="leaveTypeId" value={filter.leaveTypeId} />}
      <label htmlFor="all-reason">{t('leaveExportReason')}</label>
      <input id="all-reason" name="reason" required maxLength={500} />
      <div className="form-actions"><button type="submit">{t('leaveDownloadCsv')}</button></div>
    </form>
  </section>;
}
