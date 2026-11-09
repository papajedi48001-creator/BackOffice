import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { ExternalIdentityLink, ExternalIdentityRepository, PendingExternalLogin } from './external-login-service';

type LinkRow = { id: string; personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; linkedAt: Date };
type PendingRow = { id: string; issuer: string; subject: string; displayName: string | null; lastSeenAt: Date };
const linkColumns = 'l.id, l.person_id AS personId, l.issuer, l.subject, l.display_name AS displayName, l.linked_by_person_id AS linkedByPersonId, l.created_at AS linkedAt';
const pendingColumns = 'id, issuer, subject, display_name AS displayName, last_seen_at AS lastSeenAt';

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ER_DUP_ENTRY';
}

export class DatabaseExternalIdentityRepository implements ExternalIdentityRepository {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** Only a person still ปฏิบัติงาน may sign in, as with a password. */
  async isActivePerson(personId: string): Promise<boolean> {
    return (await this.database.query<{ id: string }>("SELECT id FROM person WHERE id = ? AND employment_status = 'ACTIVE' LIMIT 1", [personId])).length === 1;
  }

  async findLink(issuer: string, subject: string): Promise<ExternalIdentityLink | null> {
    return (await this.database.query<LinkRow>(`SELECT ${linkColumns} FROM identity_link l WHERE l.issuer = ? AND l.subject = ? LIMIT 1`, [issuer, subject]))[0] ?? null;
  }

  async findLinkForPerson(personId: string, issuer: string): Promise<ExternalIdentityLink | null> {
    return (await this.database.query<LinkRow>(`SELECT ${linkColumns} FROM identity_link l WHERE l.person_id = ? AND l.issuer = ? LIMIT 1`, [personId, issuer]))[0] ?? null;
  }

  async upsertPending(input: { issuer: string; subject: string; displayName: string | null; ticketHash: string; expiresAt: Date; now: Date }): Promise<void> {
    await this.database.execute(
      'INSERT INTO external_login_pending (id, issuer, subject, display_name, ticket_hash, ticket_expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), ticket_hash = VALUES(ticket_hash), ticket_expires_at = VALUES(ticket_expires_at), last_seen_at = VALUES(last_seen_at)',
      [this.createId(), input.issuer, input.subject, input.displayName, input.ticketHash, input.expiresAt, input.now]
    );
  }

  async findPendingByTicket(ticketHash: string, now: Date): Promise<PendingExternalLogin | null> {
    return (await this.database.query<PendingRow>(`SELECT ${pendingColumns} FROM external_login_pending WHERE ticket_hash = ? AND ticket_expires_at > ? LIMIT 1`, [ticketHash, now]))[0] ?? null;
  }

  async findPending(id: string): Promise<PendingExternalLogin | null> {
    return (await this.database.query<PendingRow>(`SELECT ${pendingColumns} FROM external_login_pending WHERE id = ? LIMIT 1`, [id]))[0] ?? null;
  }

  async listPending(): Promise<PendingExternalLogin[]> {
    return this.database.query<PendingRow>(`SELECT ${pendingColumns} FROM external_login_pending ORDER BY last_seen_at DESC`);
  }

  async listLinks(issuer: string): Promise<Array<ExternalIdentityLink & { personName: string | null }>> {
    return this.database.query<LinkRow & { personName: string | null }>(`SELECT ${linkColumns}, p.display_name AS personName FROM identity_link l JOIN person p ON p.id = l.person_id WHERE l.issuer = ? ORDER BY l.created_at DESC`, [issuer]);
  }

  async link(input: { personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; audit: Parameters<AuditService['recordAudit']>[0] }): Promise<{ ok: true } | { ok: false; code: 'ALREADY_LINKED' }> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute('INSERT INTO identity_link (id, person_id, issuer, subject, display_name, linked_by_person_id, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
          [this.createId(), input.personId, input.issuer, input.subject, input.displayName, input.linkedByPersonId]);
        await tx.execute('DELETE FROM external_login_pending WHERE issuer = ? AND subject = ?', [input.issuer, input.subject]);
        await new AuditService(new DatabaseAuditRepository(tx), this.createId).recordAudit(input.audit);
        return { ok: true as const };
      });
    } catch (error) {
      if (isDuplicate(error)) return { ok: false, code: 'ALREADY_LINKED' };
      throw error;
    }
  }

  async unlink(input: { personId: string; issuer: string; actorPersonId: string; reason: string; audit: Parameters<AuditService['recordAudit']>[0] }): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    return this.database.transaction(async (tx) => {
      const [link] = await tx.query<{ id: string; subject: string }>('SELECT id, subject FROM identity_link WHERE person_id = ? AND issuer = ? FOR UPDATE', [input.personId, input.issuer]);
      if (!link) return { ok: false as const, code: 'NOT_FOUND' as const };
      await tx.execute('DELETE FROM identity_link WHERE id = ?', [link.id]);
      await tx.execute('INSERT INTO identity_link_removal (id, person_id, issuer, subject, reason, removed_by_person_id, removed_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
        [this.createId(), input.personId, input.issuer, link.subject, input.reason, input.actorPersonId]);
      await tx.execute('UPDATE user_session SET revoked_at = UTC_TIMESTAMP() WHERE person_id = ? AND revoked_at IS NULL', [input.personId]);
      await new AuditService(new DatabaseAuditRepository(tx), this.createId).recordAudit(input.audit);
      return { ok: true as const };
    });
  }
}
