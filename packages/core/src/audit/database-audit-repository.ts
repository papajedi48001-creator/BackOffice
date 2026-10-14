import type { AuditEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { AuditRepository } from './audit-service';

export class DatabaseAuditRepository implements AuditRepository {
  constructor(private readonly database: Pick<Database, 'execute'>) {}

  async append(event: AuditEvent): Promise<void> {
    await this.database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]);
  }
}
