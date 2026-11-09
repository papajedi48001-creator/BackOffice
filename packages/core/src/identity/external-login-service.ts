import { createHash, randomBytes } from 'node:crypto';
import type { AuditInput, ExternalIdentity, LocalCredentials } from '@backoffice/contracts';
import type { LocalAuthService, LoginAuditRecorder } from './auth-service';

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

export interface ExternalLoginDependencies {
  repository: ExternalIdentityRepository;
  localAuth: LocalAuthService;
  isActivePerson(personId: string): Promise<boolean>;
  audit: LoginAuditRecorder;
  /** The portal issuer this BackOffice trusts; links are kept per issuer. */
  issuer: string;
  now?: () => Date;
}

export type ExternalResolution = { kind: 'linked'; personId: string } | { kind: 'unlinked'; ticket: string } | { kind: 'inactive' };

const TICKET_MS = 10 * 60_000;
const ticketHash = (ticket: string) => createHash('sha256').update(ticket, 'utf8').digest('hex');

/** เข้าสู่ระบบด้วย Provider ID: finds the บุคลากร a portal account is linked to, or lets the person or an admin link one. */
export class ExternalLoginService {
  private readonly now: () => Date;

  constructor(private readonly deps: ExternalLoginDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  async resolve(identity: ExternalIdentity): Promise<ExternalResolution> {
    const link = await this.deps.repository.findLink(identity.issuer, identity.subject);
    if (link) {
      if (!(await this.deps.isActivePerson(link.personId))) {
        await this.deps.audit.recordAudit({ actorPersonId: link.personId, action: 'identity.provider_login', targetType: 'person', targetId: link.personId, result: 'FAILURE', metadata: { stage: 'inactive' } });
        return { kind: 'inactive' };
      }
      await this.deps.audit.recordAudit({ actorPersonId: link.personId, action: 'identity.provider_login', targetType: 'person', targetId: link.personId, result: 'SUCCESS', metadata: {} });
      return { kind: 'linked', personId: link.personId };
    }
    const ticket = randomBytes(32).toString('base64url');
    const now = this.now();
    await this.deps.repository.upsertPending({ issuer: identity.issuer, subject: identity.subject, displayName: identity.displayName, ticketHash: ticketHash(ticket), expiresAt: new Date(now.getTime() + TICKET_MS), now });
    return { kind: 'unlinked', ticket };
  }

  /** Throws TICKET_EXPIRED, ALREADY_LINKED, or the local sign-in errors (INVALID_CREDENTIALS, LOGIN_LOCKED). */
  async linkWithPassword(ticket: string, credentials: LocalCredentials): Promise<{ personId: string; mustChangePassword: boolean }> {
    const pending = ticket ? await this.deps.repository.findPendingByTicket(ticketHash(ticket), this.now()) : null;
    if (!pending) throw new Error('TICKET_EXPIRED');
    const { personId, mustChangePassword } = await this.deps.localAuth.authenticateLocal(credentials);
    if (await this.deps.repository.findLinkForPerson(personId, pending.issuer)) throw new Error('ALREADY_LINKED');
    const result = await this.deps.repository.link({ personId, issuer: pending.issuer, subject: pending.subject, displayName: pending.displayName, linkedByPersonId: null,
      audit: { actorPersonId: personId, action: 'identity.provider_link', targetType: 'person', targetId: personId, result: 'SUCCESS', metadata: { method: 'self' } } });
    if (!result.ok) throw new Error('ALREADY_LINKED');
    return { personId, mustChangePassword };
  }

  async adminLink(actorPersonId: string, pendingId: string, personId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'ALREADY_LINKED' | 'PERSON_NOT_ACTIVE' }> {
    const pending = await this.deps.repository.findPending(pendingId);
    if (!pending) return { ok: false, code: 'NOT_FOUND' };
    if (!(await this.deps.isActivePerson(personId))) return { ok: false, code: 'PERSON_NOT_ACTIVE' };
    return this.deps.repository.link({ personId, issuer: pending.issuer, subject: pending.subject, displayName: pending.displayName, linkedByPersonId: actorPersonId,
      audit: { actorPersonId, action: 'identity.provider_link', targetType: 'person', targetId: personId, result: 'SUCCESS', metadata: { method: 'admin' } } });
  }

  /** The reason is stored apart from the audit row; audit metadata never carries it. */
  async adminUnlink(actorPersonId: string, personId: string, reason: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    return this.deps.repository.unlink({ personId, issuer: this.deps.issuer, actorPersonId, reason,
      audit: { actorPersonId, action: 'identity.provider_unlink', targetType: 'person', targetId: personId, result: 'SUCCESS', metadata: {} } });
  }
}
