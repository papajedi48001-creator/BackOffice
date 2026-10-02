import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { ApprovalService, DatabaseWorkflowRepository, type ActiveDelegationFinder } from '@backoffice/core';
import { requireAuthorized } from '../../../../../lib/require-authorized';
import { readRuntimeValue } from '../../../../../lib/runtime-env';

class DatabaseActiveDelegationFinder implements ActiveDelegationFinder {
  constructor(private readonly database: ReturnType<typeof createDatabase>) {}
  async findActiveFor(delegatorPersonId: string, delegatePersonId: string, moduleCode: string) {
    const rows = await this.database.query<{ delegatorPersonId: string; delegatePersonId: string; moduleCode: string }>('SELECT delegator_person_id AS delegatorPersonId, delegate_person_id AS delegatePersonId, module_code AS moduleCode FROM delegation WHERE delegator_person_id = ? AND delegate_person_id = ? AND module_code = ? AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP() LIMIT 1', [delegatorPersonId, delegatePersonId, moduleCode]);
    return rows[0] ?? null;
  }
}

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
      return NextResponse.json(decision);
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'decision_not_accepted' }, { status });
  }
}
