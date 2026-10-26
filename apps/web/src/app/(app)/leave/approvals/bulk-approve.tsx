'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LeaveWarning } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { formatLeaveRange, leaveErrorMessage, leaveKindLabel, leaveWarningText } from '../../../../lib/leave-labels';

export interface PendingLeaveRow { requestId: string; reference: string; kind: 'LEAVE' | 'CANCEL_DAYS'; leaveTypeName: string; startDate: string; endDate: string; startHalf: string; endHalf: string; days: number; personDisplayName: string | null; organizationName: string | null; warnings: LeaveWarning[]; medicalCertificateRequired: boolean }
type Outcome = { ok: true } | { ok: false; error: string };

/** Ticks many ใบลา and approves them in one call; each row then shows its own outcome. Returning or rejecting needs a reason, so it is done on the ใบลา page. */
export function BulkApprove({ items }: { items: PendingLeaveRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toggle = (requestId: string) => setSelected((current) => { const next = new Set(current); if (next.has(requestId)) next.delete(requestId); else next.add(requestId); return next; });

  async function approve() {
    if (selected.size === 0) { setError(t('leaveNothingSelected')); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/leave/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestIds: items.map((item) => item.requestId).filter((id) => selected.has(id)) }) });
      if (!response.ok) { setError(leaveErrorMessage(((await response.json()) as { error?: string }).error)); return; }
      const { results } = (await response.json()) as { results: Array<{ requestId: string } & Outcome> };
      setOutcomes(Object.fromEntries(results.map(({ requestId, ...outcome }) => [requestId, outcome])));
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    } catch { setError(leaveErrorMessage(null)); } finally { setBusy(false); }
  }

  const allSelected = items.every((item) => selected.has(item.requestId) || outcomes[item.requestId]?.ok);
  return <div className="leave-bulk">
    <div className="leave-table-scroll"><table>
      <thead><tr>
        <th><input type="checkbox" aria-label={t('leaveSelectAll')} checked={allSelected && selected.size > 0} onChange={() => setSelected(allSelected ? new Set() : new Set(items.filter((item) => !outcomes[item.requestId]?.ok).map((item) => item.requestId)))} /></th>
        <th>{t('requestReference')}</th><th>{t('leavePerson')}</th><th>{t('leaveType')}</th><th>{t('leaveDates')}</th><th>{t('leaveDays')}</th><th>{t('status')}</th>
      </tr></thead>
      <tbody>{items.map((item) => {
        const outcome = outcomes[item.requestId];
        return <tr key={item.requestId}>
          <td><input type="checkbox" aria-label={`${t('leaveSelect')} ${item.reference}`} checked={selected.has(item.requestId)} disabled={outcome?.ok === true} onChange={() => toggle(item.requestId)} /></td>
          <td><Link href={`/leave/requests/${item.requestId}`}>{item.reference}</Link>{item.kind === 'CANCEL_DAYS' && <><br /><span className="leave-kind">{leaveKindLabel(item.kind)}</span></>}</td>
          <td>{[item.personDisplayName, item.organizationName].filter(Boolean).join(' · ')}</td>
          <td>{item.leaveTypeName}</td>
          <td>{formatLeaveRange(item)}{item.warnings.map((warning) => <p key={warning.month} className="leave-warning-inline">{leaveWarningText(warning)}</p>)}{item.medicalCertificateRequired && <p className="leave-notice-inline">{t('leaveMedicalCertificateFlag')}</p>}</td>
          <td>{item.days}</td>
          <td>{outcome ? (outcome.ok ? <span className="status status-approved">{t('leaveApprovedResult')}</span> : <span role="alert" className="form-error">{leaveErrorMessage(outcome.error)}</span>) : <span className="status status-in_review">{t('leaveStatusInReview')}</span>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {error && !confirming && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="button" disabled={busy} onClick={() => { if (selected.size === 0) { setError(t('leaveNothingSelected')); return; } setError(null); setConfirming(true); }}>{t('leaveApproveSelected')}</button></div>
    {confirming && <ActionDialog title={t('leaveApproveSelected')} message={`${t('dialogConfirmQuestion')} ${selected.size}`} confirmLabel={t('confirmAction')} isSubmitting={busy} error={error} onConfirm={() => void approve()} onClose={() => { setConfirming(false); setError(null); }} />}
  </div>;
}
