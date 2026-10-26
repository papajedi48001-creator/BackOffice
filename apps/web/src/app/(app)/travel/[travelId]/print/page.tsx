import { notFound } from 'next/navigation';
import { OfficialTravelQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBangkokDate } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { formatLeaveRange, leaveStepLabel } from '../../../../../lib/leave-labels';
import { formatBaht, travelFundingLabel, travelTypeLabel, travelVehicleLabel } from '../../../../../lib/travel-labels';
import { travelSession } from '../../travel-page';
import { PrintButton } from './print-button';

const going = (status: string) => status !== 'REJECTED' && status !== 'CANCELLED';

/** The paper แบบขออนุมัติไปราชการ of one trip. The same people may see it as the trip page; decision reasons are never printed. */
export default async function TravelPrintPage({ params }: { params: Promise<{ travelId: string }> }) {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('travelPrintTitle')}</h2><p role="alert">{t('travelLoadError')}</p></section>;
  const { travelId } = await params;
  const view = await new OfficialTravelQueries(database).detail(travelId, session);
  if (!view) { notFound(); return null; }
  const travellers = view.members.filter((member) => going(member.status));
  return <article className="travel-print">
    <header className="travel-print-head">
      <h2>{t('travelPrintMemo')}</h2>
      <p>{t('travelPrintDepartment')} {t('travelPrintHospital')} · {travellers[0]?.organizationName ?? ''}</p>
      <p>{t('travelPrintDate')} {formatBangkokDate(view.startDate)}</p>
      <p>{t('travelPrintSubjectLabel')} {t('travelPrintSubjectValue')}</p>
      <p>{t('travelPrintTo')}</p>
    </header>
    <p>{t('travelPrintBody')}</p>
    <dl className="travel-print-list">
      <div><dt>{t('travelSubject')}</dt><dd>{view.subject}</dd></div>
      <div><dt>{t('travelOrganiser')}</dt><dd>{view.organiser}</dd></div>
      <div><dt>{t('travelPlace')}</dt><dd>{view.place} · {view.province}</dd></div>
      <div><dt>{t('travelType')}</dt><dd>{travelTypeLabel(view.travelType)}</dd></div>
      <div><dt>{t('travelDates')}</dt><dd>{formatLeaveRange(view)} ({view.days} {t('leaveDayUnit')})</dd></div>
      <div><dt>{t('travelVehicle')}</dt><dd>{travelVehicleLabel(view.vehicle)}</dd></div>
      <div><dt>{t('travelFunding')}</dt><dd>{travelFundingLabel(view.fundingSource)}</dd></div>
      <div><dt>{t('travelPrintCostPerPerson')}</dt><dd>{formatBaht(view.costs.total)} {t('travelBaht')}</dd></div>
      <div><dt>{t('travelPrintCostAll')}</dt><dd>{formatBaht(Math.round(view.costs.total * travellers.length * 100) / 100)} {t('travelBaht')}</dd></div>
    </dl>
    <h3>{t('travelMembers')}</h3>
    <table className="travel-print-table">
      <thead><tr><th>{t('leaveStepNumber')}</th><th>{t('travelMembers')}</th><th>{t('leaveOrganization')}</th><th>{t('travelPrintApprovals')}</th></tr></thead>
      <tbody>{travellers.map((member, index) => <tr key={member.requestId}>
        <td>{index + 1}</td>
        <td>{member.displayName ?? '—'}{member.personId === view.leaderPersonId ? ` (${t('travelLeader')})` : ''}</td>
        <td>{member.organizationName ?? ''}</td>
        <td>{member.steps.map((step) => `${step.assigneeDisplayName ?? '—'} · ${leaveStepLabel(step.status)}${step.decidedAt ? ` · ${formatBangkokDate(step.decidedAt.slice(0, 10))}` : ''}`).join(' / ')}</td>
      </tr>)}</tbody>
    </table>
    <p className="travel-print-signature">{t('travelPrintSignature')} .......................................... ({view.leaderDisplayName ?? ''}) {t('travelLeader')}</p>
    <PrintButton />
  </article>;
}
