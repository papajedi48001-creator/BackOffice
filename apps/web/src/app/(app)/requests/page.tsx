import { OwnRequestMarker } from '../../../components/own-request-marker';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { listPendingApprovals, requestHref } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { StatusBadge } from '../../../components/status-badge';
import { formatBangkokDateTime } from '../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../lib/database';
import { moduleLabel } from '../../../lib/modules';
import { readSession } from '../../../lib/session';

type RequestRow = { id: string; reference: string; moduleCode: string; status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETURNED' };

export default async function RequestsPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('requestsTitle')}</h2><p role="alert">ไม่สามารถอ่านรายการคำขอได้</p></section>;
  const [waiting, requests] = await Promise.all([
    listPendingApprovals(database, session.personId),
    database.query<RequestRow>('SELECT id, reference, module_code AS moduleCode, status FROM request WHERE requestor_person_id = ? ORDER BY created_at DESC', [session.personId])
  ]);
  return <section>
    <h2>{t('requestsTitle')}</h2>
    <h3 id="requests-waiting">{t('requestsWaitingOnMe')}</h3>
    {waiting.length ? <table aria-labelledby="requests-waiting"><thead><tr><th>{t('requestsModule')}</th><th>{t('requestReference')}</th><th>{t('requestsRequestor')}</th><th>{t('requestsSubmittedAt')}</th></tr></thead><tbody>{waiting.map((item) => <tr key={item.requestId}><td>[{moduleLabel(item.moduleCode)}]</td><td><Link href={item.href}>{item.reference}</Link></td><td>{item.requestorName ?? '—'}{item.ownRequest && <> <OwnRequestMarker /></>}</td><td>{formatBangkokDateTime(item.submittedAt)}</td></tr>)}</tbody></table> : <p>{t('requestsNoneWaiting')}</p>}
    <h3 id="requests-mine">{t('requestsMine')}</h3>
    <table aria-labelledby="requests-mine"><thead><tr><th>{t('requestsModule')}</th><th>{t('requestReference')}</th><th>{t('status')}</th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id}><td>[{moduleLabel(request.moduleCode)}]</td><td><Link href={requestHref(request.moduleCode, request.id)}>{request.reference}</Link></td><td><StatusBadge status={request.status} /></td></tr>) : <tr><td colSpan={3}>{t('requestsNoneMine')}</td></tr>}</tbody></table>
  </section>;
}
