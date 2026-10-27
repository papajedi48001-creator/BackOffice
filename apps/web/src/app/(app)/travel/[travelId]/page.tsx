import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canManageFleet, FleetQueries, OfficialTravelQueries } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { bangkokToday, formatBangkokDate, formatBangkokTime } from '../../../../lib/bangkok-time';
import { attachmentsEnabled } from '../../../../lib/attachments';
import { getSharedDatabase } from '../../../../lib/database';
import { formatLeaveRange, leaveStepLabel } from '../../../../lib/leave-labels';
import { formatBaht, travelFundingLabel, travelTypeLabel, travelVehicleLabel } from '../../../../lib/travel-labels';
import { LeaveStatus } from '../../leave/leave-list';
import { TravelForm } from '../new/travel-form';
import { travelSession } from '../travel-page';
import { MemberDecision, TravelCancel, TravelReportForm } from './travel-actions';

const instant = (value: string | null) => (value ? `${formatBangkokDate(value.slice(0, 10))} ${formatBangkokTime(value)}` : '');
const costRows: Array<[keyof Omit<NonNullable<Awaited<ReturnType<OfficialTravelQueries['detail']>>>['costs'], 'total'>, MessageKey]> = [['allowance', 'travelCostAllowance'], ['lodging', 'travelCostLodging'], ['transport', 'travelCostTransport'], ['registration', 'travelCostRegistration']];
const withoutUnit = (text: string) => text.replace(/ \(บาท\)$/, '');

export default async function TravelPage({ params }: { params: Promise<{ travelId: string }> }) {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('travelRequest')}</h2><p role="alert">{t('travelLoadError')}</p></section>;
  const { travelId } = await params;
  // Visibility is decided by the query on the server: the people going, their approvers and ผู้แทน, and HR.
  const view = await new OfficialTravelQueries(database).detail(travelId, session);
  if (!view) { notFound(); return null; }
  const leader = view.members.find((member) => member.personId === view.leaderPersonId);
  // ขอใช้รถ (fleet rule 2): an approved person going on an approved trip by รถราชการ. A ใบ already filed for the trip is linked instead; the fleet route checks again on submit.
  const going = view.members.find((member) => member.personId === session.personId)?.status === 'APPROVED' && view.status === 'APPROVED' && view.vehicle === 'GOVERNMENT_CAR';
  const carRequest = going ? await new FleetQueries(database).activeRequestForTravel(view.travelId) : null;
  // Only its requester and the หัวหน้าหมวด may open the ใบ; other people going just learn it exists.
  const opensCarRequest = carRequest !== null && (carRequest.requesterPersonId === session.personId || canManageFleet(session));
  const canRequestCar = going && !carRequest && view.endDate >= bangkokToday();
  return <section className="leave-detail travel-detail">
    <div className="page-heading"><h2>{t('travelRequest')}: {view.subject}</h2><LeaveStatus status={view.status} /></div>
    <div className="detail-list">
      <div><strong>{t('travelOrganiser')}</strong><span>{view.organiser}</span></div>
      <div><strong>{t('travelPlace')}</strong><span>{view.place} · {view.province}</span></div>
      <div><strong>{t('travelType')}</strong><span>{travelTypeLabel(view.travelType)}</span></div>
      <div><strong>{t('travelDates')}</strong><span>{formatLeaveRange(view)}</span></div>
      <div><strong>{t('travelDays')}</strong><span>{view.days}</span></div>
      <div><strong>{t('travelVehicle')}</strong><span>{travelVehicleLabel(view.vehicle)}</span></div>
      <div><strong>{t('travelFunding')}</strong><span>{travelFundingLabel(view.fundingSource)}</span></div>
      <div><strong>{t('travelCosts')}</strong><span>{costRows.filter(([key]) => view.costs[key] > 0).map(([key, label]) => `${withoutUnit(t(label))} ${formatBaht(view.costs[key])}`).join(' · ') || '—'}</span></div>
      <div><strong>{t('travelCostTotal')}</strong><span>{formatBaht(view.costs.total)} {t('travelBaht')}</span></div>
      {view.attachment && <div><strong>{t('attachmentFile')}</strong><span><a href={`/api/attachments/${encodeURIComponent(view.attachment.attachmentId)}/download`}>{view.attachment.filename ?? t('attachmentFile')}</a></span></div>}
    </div>
    <h3>{t('travelMembers')}</h3>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('travelMembers')}</th><th>{t('status')}</th><th>{t('leaveSteps')}</th><th></th></tr></thead>
      <tbody>{view.members.map((member) => <tr key={member.requestId} className={member.status === 'REJECTED' || member.status === 'CANCELLED' ? 'travel-member-off' : undefined}>
        <td>{member.displayName ?? '—'}{member.personId === view.leaderPersonId && <span className="travel-leader-tag">{t('travelLeader')}</span>}<br /><small>{member.organizationName ?? ''}</small></td>
        <td><LeaveStatus status={member.status} /></td>
        <td><ol className="travel-steps">{member.steps.map((step) => <li key={step.sequence}>{step.assigneeDisplayName ?? '—'} · {leaveStepLabel(step.status)}{step.decidedAt ? ` · ${instant(step.decidedAt)}` : ''}{step.decisionReason ? ` · ${step.decisionReason}` : ''}</li>)}</ol></td>
        <td>{member.canDecide && <MemberDecision requestId={member.requestId} name={member.displayName ?? '—'} />}</td>
      </tr>)}</tbody>
    </table></div>
    {view.report && <><h3>{t('travelReport')}</h3><div className="detail-list">
      <div><strong>{t('travelReportSummary')}</strong><span>{view.report.summary}</span></div>
      <div><strong>{t('travelReportApplication')}</strong><span>{view.report.application}</span></div>
      <div><strong>{t('travelReportSubmittedAt')}</strong><span>{instant(view.report.submittedAt)}</span></div>
      {view.report.updatedAt !== view.report.submittedAt && <div><strong>{t('travelReportUpdatedAt')}</strong><span>{instant(view.report.updatedAt)}</span></div>}
    </div></>}
    {(carRequest || canRequestCar) && <div className="request-actions">{carRequest
      ? opensCarRequest ? <Link className="button-link" href={`/fleet/requests/${carRequest.id}`}>{t('travelSeeCarRequest')}</Link> : <p className="permission-notice">{`${t('travelHasCarRequest')} ${carRequest.reference}`}</p>
      : <Link className="button-link" href={`/fleet/new?travel=${view.travelId}`}>{t('travelRequestCar')}</Link>}</div>}
    {view.canReport && <TravelReportForm travelId={view.travelId} initial={{ summary: view.report?.summary ?? '', application: view.report?.application ?? '' }} />}
    {view.canCancel && <TravelCancel travelId={view.travelId} />}
    {view.canEdit && <><h3>{t('travelEditReturned')}</h3><TravelForm
      leader={leader ?? { personId: view.leaderPersonId, displayName: view.leaderDisplayName, organizationName: null }}
      travelId={view.travelId}
      fixedMembers={view.members}
      attachments={attachmentsEnabled()}
      initialAttachment={view.attachment}
      initial={{ subject: view.subject, organiser: view.organiser, place: view.place, province: view.province, travelType: view.travelType, vehicle: view.vehicle, fundingSource: view.fundingSource, startDate: view.startDate, endDate: view.endDate, startHalf: view.startHalf, endHalf: view.endHalf, costAllowance: String(view.costs.allowance || ''), costLodging: String(view.costs.lodging || ''), costTransport: String(view.costs.transport || ''), costRegistration: String(view.costs.registration || '') }}
    /></>}
    <p className="travel-detail-links"><a href={`/travel/${view.travelId}/print`}>{t('travelPrint')}</a> · <a href="/travel/mine">{t('travelBack')}</a></p>
  </section>;
}
