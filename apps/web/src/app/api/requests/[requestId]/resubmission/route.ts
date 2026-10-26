import { NextResponse } from 'next/server';
import { DatabaseWorkflowRepository, LEAVE_MODULE, RequestService } from '@backoffice/core';
import { getSharedDatabase } from '../../../../../lib/database';
import { DatabaseApproverResolver } from '../../../../../lib/database-approver-resolver';
import { requireAuthorized } from '../../../../../lib/require-authorized';
import { lifecycleFailure } from '../../lifecycle-error-status';

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const { requestId } = await context.params;
    // A returned ใบลา is resubmitted with its edited dates through /api/leave; only its requestor learns that.
    const [owned] = await database.query<{ moduleCode: string; requestorPersonId: string }>('SELECT module_code AS moduleCode, requestor_person_id AS requestorPersonId FROM request WHERE id = ? LIMIT 1', [requestId]);
    if (owned?.moduleCode === LEAVE_MODULE && owned.requestorPersonId === session.personId) return NextResponse.json({ error: 'leave_request_route' }, { status: 400 });
    const resubmitted = await new RequestService(new DatabaseWorkflowRepository(database), new DatabaseApproverResolver(database)).resubmitRequest({ requestId, actorPersonId: session.personId! });
    return NextResponse.json({ status: resubmitted.status });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
