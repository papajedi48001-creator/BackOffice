import { NextResponse } from 'next/server';
import { DatabaseWorkflowRepository, FLEET_MODULE, OFFICIAL_TRAVEL_MODULE, RequestService } from '@backoffice/core';
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
    // Only the หัวหน้าคณะ cancels a trip, all of it at once, through /api/travel.
    const [owned] = await database.query<{ moduleCode: string }>('SELECT module_code AS moduleCode FROM request WHERE id = ? LIMIT 1', [requestId]);
    if (owned?.moduleCode === OFFICIAL_TRAVEL_MODULE) return NextResponse.json({ error: 'travel_request_route' }, { status: 400 });
    // A ใบขอใช้รถ is cancelled through /api/fleet, which also frees its เที่ยวรถ.
    if (owned?.moduleCode === FLEET_MODULE) return NextResponse.json({ error: 'fleet_request_route' }, { status: 400 });
    const cancelled = await new RequestService(new DatabaseWorkflowRepository(database), new DatabaseApproverResolver(database)).cancelRequest({ requestId, actorPersonId: session.personId!, reason: typeof body?.reason === 'string' ? body.reason : '' });
    return NextResponse.json({ status: cancelled.status });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
