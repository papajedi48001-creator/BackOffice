import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository, ExportService, LeaveService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { DatabaseApproverResolver } from '../../../lib/database-approver-resolver';
import { DatabaseActiveDelegationFinder } from '../../../lib/database-delegation-finder';

export { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export const leaveService = (database: Database) => new LeaveService(database, new DatabaseApproverResolver(database), new DatabaseActiveDelegationFinder(database));

const statusByCode: Record<string, number> = { NOT_FOUND: 404, NOT_PENDING: 409, DUPLICATE_CODE: 409, DUPLICATE_NAME: 409, DUPLICATE_DATE: 409 };

/** A service result as JSON: rule failures are 400 with their code, except the codes above. */
export function leaveResult(result: { ok: true } | { ok: false; code: string }, createdStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: createdStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}

// The person filing is always the session's; a personId in the body is dropped, not trusted.
export const withoutPersonId = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'personId'));

export const invalidInput = (fields: string[]) => NextResponse.json({ error: 'invalid_input', fields }, { status: 400 });

/** Reads the required export reason (1–500 characters) from the query string. */
export function exportReason(url: URL): string | null {
  const reason = url.searchParams.get('reason')?.trim() ?? '';
  return reason.length >= 1 && reason.length <= 500 ? reason : null;
}

/** Records the export (audit and outbox, one transaction) and only then hands back the file. */
export async function csvDownload(database: Database, input: { actorPersonId: string; reason: string; scope: Record<string, unknown> }, filename: string, build: () => Promise<string>): Promise<Response> {
  await database.transaction(async (transaction) => {
    const audit = new AuditService(new DatabaseAuditRepository(transaction));
    const queue = { enqueue: async (event: { id: string; type: string; idempotencyKey: string; payload: unknown }) => transaction.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload)]) };
    // leave.manage was checked by the route; the export service adds the audit trail.
    await new ExportService({ canExport: async () => true }, audit, queue).requestExport({ actorPersonId: input.actorPersonId, reason: input.reason, moduleCode: 'leave', scope: input.scope });
  });
  return new Response(await build(), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } });
}
