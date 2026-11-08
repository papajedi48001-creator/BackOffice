import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { listSelfApprovals, type SelfApprovalEntry } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../lib/database';
import { roleChoiceName } from '../../../../lib/role-choice-labels';
import { readSession } from '../../../../lib/session';

function decisionLabel(entry: SelfApprovalEntry): string {
  if (entry.result === 'REJECT' || entry.action === 'room_booking.rejected') return t('rejected');
  if (entry.result === 'RETURN') return t('returned');
  return t('leaveApprove');
}

/** อนุมัติคำขอของตนเอง: who decided their own request, which one and when. ผู้ดูแลระบบ only; no reason is shown here. */
export default async function SelfApprovalsPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated || !session.personId) { redirect('/'); return null; }
  // The admin role is in effect only in the admin tier, so this is the server-side check.
  if (!session.roles.some((role) => role.name === 'admin')) { notFound(); return null; }
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('selfApprovalsTitle')}</h2><p role="alert">{t('notificationLoadError')}</p></section>;
  const entries = await listSelfApprovals(database);
  return <section>
    <h2>{t('selfApprovalsTitle')}</h2>
    <p className="permission-notice">{t('selfApprovalsCopy')}</p>
    {entries.length === 0 ? <p>{t('selfApprovalsEmpty')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('selfApprovalWhen')}</th><th>{t('selfApprovalWho')}</th><th>{t('selfApprovalRole')}</th><th>{t('requestReference')}</th><th>{t('selfApprovalDecision')}</th></tr></thead>
      <tbody>{entries.map((entry, index) => <tr key={`${entry.createdAt}-${index}`}>
        <td>{formatBangkokDateTime(entry.createdAt)}</td>
        <td>{entry.actorDisplayName ?? '—'}</td>
        <td>{entry.actorRole ? roleChoiceName(entry.actorRole) : '—'}</td>
        <td>{entry.reference ?? t('unknownRequest')}</td>
        <td>{decisionLabel(entry)}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
