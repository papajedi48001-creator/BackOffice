import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { DatabaseWorkflowRepository, LEAVE_MODULE, FLEET_MODULE, OFFICIAL_TRAVEL_MODULE, RequestService } from '@backoffice/core';
import { DatabaseApproverResolver } from '../../../lib/database-approver-resolver';
import { requireAuthorized } from '../../../lib/require-authorized';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { requestErrorCode } from './request-error-code';

export async function POST(request: Request): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const body = await request.json();
    // ใบลา carry their own checks and records, so they are filed only through /api/leave.
    if (body.moduleCode === LEAVE_MODULE) return NextResponse.json({ error: 'leave_request_route' }, { status: 400 });
    if (body.moduleCode === OFFICIAL_TRAVEL_MODULE) return NextResponse.json({ error: 'travel_request_route' }, { status: 400 });
    // A ใบขอใช้รถ is filed with its trip details only through /api/fleet.
    if (body.moduleCode === FLEET_MODULE) return NextResponse.json({ error: 'fleet_request_route' }, { status: 400 });
    const database = createDatabase(databaseUrl);
    try {
      const submitted = await new RequestService(new DatabaseWorkflowRepository(database), new DatabaseApproverResolver(database)).submitRequest({ moduleCode: body.moduleCode, requestorPersonId: session.personId!, organizationSnapshot: { organizationId: body.organizationId } });
      return NextResponse.json(submitted, { status: 201 });
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    console.error('backoffice.request_submission_failed', { code: requestErrorCode(error) });
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'request_not_accepted' }, { status });
  }
}
