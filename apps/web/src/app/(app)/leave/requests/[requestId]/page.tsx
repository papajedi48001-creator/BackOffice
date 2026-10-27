import { notFound } from 'next/navigation';
import { LeaveQueries, LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBangkokDate, formatBangkokTime } from '../../../../../lib/bangkok-time';
import { attachmentsEnabled } from '../../../../../lib/attachments';
import { getSharedDatabase } from '../../../../../lib/database';
import { formatLeaveRange, leaveKindLabel, leaveStepLabel, leaveWarningText } from '../../../../../lib/leave-labels';
import { LeaveForm } from '../../new/leave-form';
import { LeaveStatus, LeaveTable } from '../../leave-list';
import { leaveSession } from '../../leave-page';
import { LeaveActions } from './leave-actions';

const instant = (value: string | null) => (value ? `${formatBangkokDate(value.slice(0, 10))} ${formatBangkokTime(value)}` : '—');

export default async function LeaveRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await leaveSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('leaveRequest')}</h2><p role="alert">{t('leaveLoadError')}</p></section>;
  const { requestId } = await params;
  // Visibility is decided by the query on the server: the person, the approvers, their ผู้แทน and HR.
  const view = await new LeaveQueries(database).detail(requestId, session);
  if (!view) { notFound(); return null; }
  const owner = view.canCancel || view.canRequestCancelDays;
  const editable = view.kind === 'LEAVE' && view.status === 'RETURNED' && view.canCancel;
  const types = editable ? (await new LeaveSettingsService(database).listTypes({ activeOnly: true })).map(({ id, code, name, counting }) => ({ id, code, name, counting })) : [];
  return <section className="leave-detail">
    <div className="page-heading"><h2>{leaveKindLabel(view.kind)} {view.reference}</h2><LeaveStatus status={view.status} /></div>
    <div className="detail-list">
      <div><strong>{t('leavePerson')}</strong><span>{[view.personDisplayName, view.organizationName].filter(Boolean).join(' · ')}</span></div>
      <div><strong>{t('leaveType')}</strong><span>{view.leaveTypeName}</span></div>
      <div><strong>{t('leaveDates')}</strong><span>{formatLeaveRange(view)}</span></div>
      <div><strong>{t('leaveDays')}</strong><span>{view.days}</span></div>
      <div><strong>{view.kind === 'LEAVE' ? t('leaveReason') : t('leaveCancelDaysReason')}</strong><span>{view.reason}</span></div>
      {view.contactDuringLeave && <div><strong>{t('leaveContact')}</strong><span>{view.contactDuringLeave}</span></div>}
      {view.attachment && <div><strong>{t('attachmentFile')}</strong><span><a href={`/api/attachments/${encodeURIComponent(view.attachment.attachmentId)}/download`}>{view.attachment.filename ?? t('attachmentFile')}</a></span></div>}
      <div><strong>{t('leaveSubmittedAt')}</strong><span>{instant(view.submittedAt)}</span></div>
    </div>
    {view.medicalCertificateRequired && <p className="leave-notice">{t('leaveMedicalCertificateFlag')}</p>}
    {view.warnings.length > 0 && <div className="leave-warning">{view.warnings.map((warning) => <p key={warning.month}>{leaveWarningText(warning)}</p>)}</div>}
    <h3>{t('leaveSteps')}</h3>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('leaveStepNumber')}</th><th>{t('leaveStepAssignee')}</th><th>{t('status')}</th><th>{t('leaveStepDecidedAt')}</th><th>{t('leaveStepReason')}</th></tr></thead>
      <tbody>{view.steps.map((step) => <tr key={step.sequence}><td>{step.sequence}</td><td>{step.assigneeDisplayName ?? '—'}</td><td>{leaveStepLabel(step.status)}</td><td>{instant(step.decidedAt)}</td><td>{step.decisionReason ?? ''}</td></tr>)}</tbody>
    </table></div>
    {view.cancellations.length > 0 && <><h3>{t('leaveCancellations')}</h3><LeaveTable items={view.cancellations} /></>}
    <LeaveActions requestId={view.requestId} canDecide={view.canDecide} canCancel={view.canCancel} canRequestCancelDays={view.canRequestCancelDays} returnedCancelDays={view.kind === 'CANCEL_DAYS' && view.status === 'RETURNED' && view.canCancel ? { startDate: view.startDate, endDate: view.endDate, startHalf: view.startHalf, endHalf: view.endHalf, reason: view.reason } : undefined} />
    {editable && <><h3>{t('leaveEditReturned')}</h3><LeaveForm types={types} requestId={view.requestId} attachments={attachmentsEnabled()} initialAttachment={view.attachment} initial={{ leaveTypeId: view.leaveTypeId, startDate: view.startDate, endDate: view.endDate, startHalf: view.startHalf, endHalf: view.endHalf, reason: view.reason, contactDuringLeave: view.contactDuringLeave }} /></>}
    {owner && <p><a href="/leave/mine">{t('leaveBack')}</a></p>}
  </section>;
}
