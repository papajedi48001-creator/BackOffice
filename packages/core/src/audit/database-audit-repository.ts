import { insertAuditEvent } from './audit-sql.ts';
import type { AuditEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { AuditRepository } from './audit-service.ts';

export class DatabaseAuditRepository implements AuditRepository {
  constructor(private readonly database: Pick<Database, 'execute'>) {}

  async append(event: AuditEvent): Promise<void> {
    await insertAuditEvent(this.database, event);
  }
}
