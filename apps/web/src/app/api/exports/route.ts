import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { AuditService, AuthorizationService, DatabaseAuditRepository, ExportService } from '@backoffice/core';
import { requireAuthorized } from '../../../lib/require-authorized';
import { readRuntimeValue } from '../../../lib/runtime-env';

export async function POST(request: Request): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const body = await request.json();
    const organizationId = typeof body.scope?.organizationId === 'string' ? body.scope.organizationId : '';
    const database = createDatabase(databaseUrl);
    try {
      const audit = new AuditService(new DatabaseAuditRepository(database));
      const service = new ExportService({ canExport: async (input) => (await new AuthorizationService().canAccess(session, 'data.export', { moduleCode: input.moduleCode, organizationId })).allowed }, audit, { enqueue: async (event) => database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload)]) });
      return NextResponse.json(await service.requestExport({ actorPersonId: session.personId!, reason: body.reason ?? '', moduleCode: body.moduleCode, scope: body.scope ?? {} }), { status: 202 });
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 403;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'export_not_authorized' }, { status });
  }
}
