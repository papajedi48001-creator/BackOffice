import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDatabase } from '@backoffice/db';
import { t } from '@backoffice/i18n';
import { StatusBadge } from '../../../components/status-badge';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { readSession } from '../../../lib/session';
import { RequestSubmitForm } from './request-submit-form';

type RequestRow = { id: string; reference: string; status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETURNED' };
type OrganizationRow = { organizationId: string };

export default async function RequestsPage() {
  const session = readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <section><h2>{t('requestsTitle')}</h2><p role="alert">ไม่สามารถอ่านรายการคำขอได้</p></section>;
  const database = createDatabase(databaseUrl);
  try {
    const requests = await database.query<RequestRow>('SELECT id, reference, status FROM request WHERE requestor_person_id = ? ORDER BY created_at DESC', [session.personId]);
    const assignment = (await database.query<OrganizationRow>('SELECT organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND effective_until IS NULL LIMIT 1', [session.personId]))[0];
    return <section><h2>{t('requestsTitle')}</h2>{assignment && <RequestSubmitForm organizationId={assignment.organizationId} />}<table><thead><tr><th>{t('requestReference')}</th><th>{t('status')}</th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id}><td><Link href={`/requests/${request.id}`}>{request.reference}</Link></td><td><StatusBadge status={request.status} /></td></tr>) : <tr><td colSpan={2}>ยังไม่มีคำขอของคุณ</td></tr>}</tbody></table></section>;
  } finally { await database.close(); }
}
