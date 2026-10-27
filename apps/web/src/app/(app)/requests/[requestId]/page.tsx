import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createDatabase } from '@backoffice/db';
import { readRuntimeValue } from '../../../../lib/runtime-env';
import { readSession } from '../../../../lib/session';
import { FLEET_MODULE, LEAVE_MODULE, OFFICIAL_TRAVEL_MODULE, RequestHistory } from '@backoffice/core';
import { canApproveRequest, canCancelRequest, canResubmitRequest, canViewRequest } from '../../../../lib/request-access';
import type { RequestDisplayStatus } from '../../../../components/status-badge';
import { RequestDetailPanel } from './request-detail-panel';

type RequestRow = { id: string; reference: string; requestorPersonId: string; moduleCode: string; status: RequestDisplayStatus };

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <p role="alert">ไม่สามารถอ่านรายละเอียดคำขอได้</p>;
  const database = createDatabase(databaseUrl);
  try {
    const request = (await database.query<RequestRow>('SELECT id, reference, requestor_person_id AS requestorPersonId, module_code AS moduleCode, status FROM request WHERE id = ? LIMIT 1', [requestId]))[0];
    if (!request) notFound();
    // A ใบลา is resubmitted and cancelled through the leave routes; its page checks who may see it.
    if (request.moduleCode === LEAVE_MODULE) return redirect(`/leave/requests/${request.id}`);
    if (request.moduleCode === OFFICIAL_TRAVEL_MODULE) return redirect(`/travel/requests/${request.id}`);
    if (request.moduleCode === FLEET_MODULE) return redirect(`/fleet/requests/by-request/${request.id}`);
    const history = await new RequestHistory(database).load(request.id);
    if (!history) notFound();
    if (!canViewRequest(session.personId, { requestorPersonId: request.requestorPersonId, approverPersonIds: history.steps.map((step) => step.assigneePersonId).filter(Boolean) })) notFound();
    const pendingSteps = history.steps.filter((step) => step.status === 'PENDING');
    const actions = {
      approve: canApproveRequest(session.personId, { status: request.status, assigneePersonId: pendingSteps[0]?.assigneePersonId }),
      cancel: canCancelRequest(session.personId, request),
      resubmit: canResubmitRequest(session.personId, request)
    };
    return <RequestDetailPanel requestId={request.id} reference={request.reference} requestorName={history.requestorName} organizationName={history.organizationName} status={request.status} history={history.entries} actions={actions} statusAfterApprove={pendingSteps.length > 1 ? 'IN_REVIEW' : 'APPROVED'} />;
  } finally { await database.close(); }
}
