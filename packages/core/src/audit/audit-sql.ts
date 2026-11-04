import type { AuditEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

/**
 * The one INSERT for audit_event. `actor_role` is the active role of the actor's most recently used live session, so every
 * audited action says which role it was done in; with two concurrent sessions in different roles the latest one is recorded.
 */
export async function insertAuditEvent(database: Pick<Database, 'execute'>, event: AuditEvent): Promise<void> {
  await database.execute(
    `INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at, actor_role) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(),
      (SELECT s.active_role FROM user_session s WHERE s.person_id = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() ORDER BY s.last_seen_at DESC, s.created_at DESC LIMIT 1))`,
    [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata, event.actorPersonId ?? null]
  );
}
