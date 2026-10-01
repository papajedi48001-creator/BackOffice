import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createDatabase } from '@backoffice/db';
import { readRuntimeValue } from '../../../../lib/runtime-env';
import { readSession } from '../../../../lib/session';
import { canApproveRequest } from '../../../../lib/request-access';
import { RequestDetailPanel } from './request-detail-panel';

type RequestRow = { id: string; reference: string; requestorPersonId: string; organizationSnapshot: string; status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETURNED' };
type StepRow = { assigneeSnapshot: string; status: string };
type OrganizationRow = { name: string };

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const session = readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <p role="alert">ไม่สามารถอ่านรายละเอียดคำขอได้</p>;
  const database = createDatabase(databaseUrl);
  try {
    const request = (await database.query<RequestRow>('SELECT id, reference, requestor_person_id AS requestorPersonId, organization_snapshot AS organizationSnapshot, status FROM request WHERE id = ? LIMIT 1', [requestId]))[0];
    if (!request) notFound();
    const step = (await database.query<StepRow>('SELECT assignee_snapshot AS assigneeSnapshot, status FROM approval_step WHERE request_id = ? AND status = ? ORDER BY sequence LIMIT 1', [request.id, 'PENDING']))[0];
    const assigneePersonId = step ? (JSON.parse(step.assigneeSnapshot) as { personId?: string }).personId : undefined;
    const organizationId = (JSON.parse(request.organizationSnapshot) as { organizationId?: string }).organizationId ?? 'ไม่ระบุ';
    const organization = organizationId === 'ไม่ระบุ' ? undefined : (await database.query<OrganizationRow>('SELECT name FROM organization WHERE id = ? LIMIT 1', [organizationId]))[0];
    return <RequestDetailPanel requestId={request.id} reference={request.reference} organizationId={organization?.name ?? 'ไม่ระบุ'} status={request.status === 'APPROVED' ? 'APPROVED' : 'PENDING'} canApprove={canApproveRequest(session.personId, { status: request.status, assigneePersonId })} />;
  } finally { await database.close(); }
}
