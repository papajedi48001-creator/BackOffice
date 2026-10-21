import { NextResponse } from 'next/server';
import { DatabaseWorkflowRepository, RequestService } from '@backoffice/core';
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
    const resubmitted = await new RequestService(new DatabaseWorkflowRepository(database), new DatabaseApproverResolver(database)).resubmitRequest({ requestId, actorPersonId: session.personId! });
    return NextResponse.json({ status: resubmitted.status });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
