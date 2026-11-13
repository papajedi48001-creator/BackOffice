import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

const errorCode = (error: unknown) => (typeof error === 'object' && error !== null ? error as { code?: string; errno?: number } : {});
export const isMissingReference = (error: unknown) => { const { code, errno } = errorCode(error); return code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_NO_REFERENCED_ROW' || errno === 1452; };

/** One audit row inside the caller's transaction. Metadata carries counts and dates only: never HN, names or connection details. */
export function moneyAudit(database: Database, createId: () => string, actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
  return new AuditService(new DatabaseAuditRepository(database), createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
}
