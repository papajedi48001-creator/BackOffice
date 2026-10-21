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
    const body = await request.json().catch(() => ({}));
    const { requestId } = await context.params;
    const cancelled = await new RequestService(new DatabaseWorkflowRepository(database), new DatabaseApproverResolver(database)).cancelRequest({ requestId, actorPersonId: session.personId!, reason: typeof body?.reason === 'string' ? body.reason : '' });
    return NextResponse.json({ status: cancelled.status });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
