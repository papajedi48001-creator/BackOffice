import { randomUUID } from 'node:crypto';
import type { OutboxEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

const errorCode = (error: unknown) => (typeof error === 'object' && error !== null ? error as { code?: string; errno?: number } : {});
export const isDuplicateEntry = (error: unknown) => { const { code, errno } = errorCode(error); return code === 'ER_DUP_ENTRY' || errno === 1062; };
export const isMissingReference = (error: unknown) => { const { code, errno } = errorCode(error); return code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_NO_REFERENCED_ROW' || errno === 1452; };

/** One audit row inside the caller's transaction. Metadata carries ids and codes only, never a reason or other free text. */
export function labAudit(database: Database, createId: () => string, actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
  return new AuditService(new DatabaseAuditRepository(database), createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
}

/** One outbox row inside the caller's transaction; a repeated idempotency key is skipped. */
export async function labOutbox(database: Database, type: string, idempotencyKey: string, payload: OutboxEvent['payload'], createId: () => string = randomUUID): Promise<void> {
  await database.execute('INSERT IGNORE INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), NULL)', [createId(), type, idempotencyKey, JSON.stringify(payload)]);
}
