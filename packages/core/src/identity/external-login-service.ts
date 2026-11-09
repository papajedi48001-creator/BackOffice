import type { AuditInput } from '@backoffice/contracts';

export interface ExternalIdentityLink { id: string; personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; linkedAt: Date }
export interface PendingExternalLogin { id: string; issuer: string; subject: string; displayName: string | null; lastSeenAt: Date }

/** บัญชี Provider ID links and the รอผูกบัญชี list. Every change and its audit row share one transaction. */
export interface ExternalIdentityRepository {
  findLink(issuer: string, subject: string): Promise<ExternalIdentityLink | null>;
  findLinkForPerson(personId: string, issuer: string): Promise<ExternalIdentityLink | null>;
  upsertPending(input: { issuer: string; subject: string; displayName: string | null; ticketHash: string; expiresAt: Date; now: Date }): Promise<void>;
  findPendingByTicket(ticketHash: string, now: Date): Promise<PendingExternalLogin | null>;
  findPending(id: string): Promise<PendingExternalLogin | null>;
  listPending(): Promise<PendingExternalLogin[]>;
  listLinks(issuer: string): Promise<Array<ExternalIdentityLink & { personName: string | null }>>;
  /** Inserts the link, removes its pending row and writes `audit`; a subject or person already linked for the issuer gives ALREADY_LINKED. */
  link(input: { personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; audit: AuditInput }): Promise<{ ok: true } | { ok: false; code: 'ALREADY_LINKED' }>;
  /** Removes the link, records the reason apart from the audit row, revokes every session of the person and writes `audit`. */
  unlink(input: { personId: string; issuer: string; actorPersonId: string; reason: string; audit: AuditInput }): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }>;
}
