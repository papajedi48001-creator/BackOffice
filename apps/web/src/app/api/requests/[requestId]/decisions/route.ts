import { NextResponse } from 'next/server';
import { createDatabase, type Database } from '@backoffice/db';
import { ApprovalService, DatabaseWorkflowRepository, FleetRequestService, OFFICIAL_TRAVEL_MODULE } from '@backoffice/core';
import { DatabaseApproverResolver } from '../../../../../lib/database-approver-resolver';
import { DatabaseActiveDelegationFinder } from '../../../../../lib/database-delegation-finder';
import { requireAuthorized } from '../../../../../lib/require-authorized';
import { readRuntimeValue } from '../../../../../lib/runtime-env';

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const body = await request.json();
    const { requestId } = await context.params;
    const database = createDatabase(databaseUrl);
    try {
      const decision = await new ApprovalService(new DatabaseWorkflowRepository(database), new DatabaseActiveDelegationFinder(database)).decideRequest({ requestId, actorPersonId: session.personId!, decision: body.decision, reason: body.reason });
      if (decision.decision !== 'RETURN') await fileCarForTravel(database, requestId, session.personId!);
      return NextResponse.json(decision);
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'decision_not_accepted' }, { status });
  }
}

/** A decision that leaves a ไปราชการ by รถราชการ approved sends its ใบขอใช้รถ to the fleet team. The decision stands even if this fails; the ขอใช้รถ button is the fallback. */
async function fileCarForTravel(database: Database, requestId: string, actorPersonId: string): Promise<void> {
  try {
    const [request] = await database.query<{ moduleCode: string }>('SELECT module_code AS moduleCode FROM request WHERE id = ? LIMIT 1', [requestId]);
    if (request?.moduleCode !== OFFICIAL_TRAVEL_MODULE) return;
    await new FleetRequestService(database, new DatabaseApproverResolver(database)).fileFromTravelDecision(requestId, actorPersonId);
  } catch (error) {
    // Only the code: a database message can carry names.
    console.error('fleet.auto_file_failed', typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown');
  }
}
