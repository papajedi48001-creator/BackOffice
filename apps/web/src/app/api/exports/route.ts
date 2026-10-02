import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { AuditService, AuthorizationService, ExportService } from '@backoffice/core';
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
      const audit = new AuditService({ append: async (event) => database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]) });
      const service = new ExportService({ canExport: async (input) => (await new AuthorizationService().canAccess(session, 'data.export', { moduleCode: input.moduleCode, organizationId })).allowed }, audit, { enqueue: async (event) => database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload)]) });
      return NextResponse.json(await service.requestExport({ actorPersonId: session.personId!, reason: body.reason ?? '', moduleCode: body.moduleCode, scope: body.scope ?? {} }), { status: 202 });
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 403;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'export_not_authorized' }, { status });
  }
}
