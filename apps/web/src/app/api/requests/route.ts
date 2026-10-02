import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { DatabaseWorkflowRepository, RequestService, type ApproverResolver } from '@backoffice/core';
import { requireAuthorized } from '../../../lib/require-authorized';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { requestErrorCode } from './request-error-code';

class DatabaseApproverResolver implements ApproverResolver {
  constructor(private readonly database: ReturnType<typeof createDatabase>) {}
  async resolve(input: { moduleCode: string; requestorPersonId: string; organizationId: string }) {
    const rows = await this.database.query<{ personId: string; organizationId: string }>('SELECT manager_person_id AS personId, organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND organization_id = ? AND effective_until IS NULL AND manager_person_id IS NOT NULL LIMIT 1', [input.requestorPersonId, input.organizationId]);
    return rows;
  }
}

export async function POST(request: Request): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const body = await request.json();
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
