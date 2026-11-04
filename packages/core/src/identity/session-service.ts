import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AccessSubject, Session } from '@backoffice/contracts';
import { canChooseRole, resolveActiveRole } from '../access/active-role';

export interface ActiveSessionRecord { id: string; personId: string; idleSeconds: number; expired: boolean; revoked: boolean; /** The account still has a reset or HR-chosen password. */ mustChangePassword?: boolean; /** The role chosen for this session, if any. */ activeRole?: string | null; }
export interface SessionRepository {
  insert(session: { id: string; tokenHash: string; personId: string; lifetimeSeconds: number }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ActiveSessionRecord | null>;
  touch(sessionId: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  setActiveRole(sessionId: string, role: string): Promise<void>;
}
export interface AccessSubjectLoader { load(personId: string): Promise<Pick<AccessSubject, 'roles' | 'dataOwnerModules' | 'hospitalWideDataOwnerModules'>>; }
export interface SessionServiceOptions { idleTimeoutSeconds?: number; absoluteTimeoutSeconds?: number; touchIntervalSeconds?: number; createId?: () => string; createToken?: () => string; }

export class SessionService {
  private readonly idleTimeoutSeconds: number;
  private readonly absoluteTimeoutSeconds: number;
  private readonly touchIntervalSeconds: number;
  private readonly createId: () => string;
  private readonly createToken: () => string;

  constructor(private readonly sessions: SessionRepository, private readonly access: AccessSubjectLoader, options: SessionServiceOptions = {}) {
    this.idleTimeoutSeconds = options.idleTimeoutSeconds ?? 30 * 60;
    this.absoluteTimeoutSeconds = options.absoluteTimeoutSeconds ?? 12 * 60 * 60;
    this.touchIntervalSeconds = options.touchIntervalSeconds ?? 60;
    this.createId = options.createId ?? randomUUID;
    this.createToken = options.createToken ?? (() => randomBytes(32).toString('base64url'));
  }

  async start(personId: string): Promise<{ token: string; maxAgeSeconds: number }> {
    const token = this.createToken();
    await this.sessions.insert({ id: this.createId(), tokenHash: hashSessionToken(token), personId, lifetimeSeconds: this.absoluteTimeoutSeconds });
    return { token, maxAgeSeconds: this.absoluteTimeoutSeconds };
  }

  async resolve(token: string): Promise<Session | null> {
    const session = await this.findActive(token);
    // Until the owner replaces a reset password the session opens nothing but the change-password step.
    if (!session || session.mustChangePassword) return null;
    if (session.idleSeconds >= this.touchIntervalSeconds) await this.sessions.touch(session.id);
    const access = await this.access.load(session.personId);
    // Only the active role's assignments take effect; while a choice is pending the session holds no role at all.
    const active = resolveActiveRole(access.roles, session.activeRole);
    return { authenticated: true, personId: session.personId, roles: active.roles, dataOwnerModules: access.dataOwnerModules, hospitalWideDataOwnerModules: access.hospitalWideDataOwnerModules ?? [], activeRole: active.activeRole, roleChoices: active.roleChoices, roleSelectionRequired: active.roleSelectionRequired };
  }

  /** Saves the role this session works in; refuses a role the person does not hold (`ROLE_NOT_HELD`). Null for no live session. */
  async chooseRole(token: string, role: string): Promise<{ personId: string; role: string; previousRole: string | null } | null> {
    const session = await this.findActive(token);
    if (!session || session.mustChangePassword) return null;
    const access = await this.access.load(session.personId);
    if (!canChooseRole(access.roles, role)) throw new Error('ROLE_NOT_HELD');
    const previousRole = session.activeRole ?? null;
    await this.sessions.setActiveRole(session.id, role);
    return { personId: session.personId, role, previousRole };
  }

  /** The person of a signed-in session that must change its password first, else null. */
  async pendingPasswordChange(token: string): Promise<{ personId: string } | null> {
    const session = await this.findActive(token);
    return session?.mustChangePassword ? { personId: session.personId } : null;
  }

  async revoke(token: string): Promise<string | null> {
    const session = await this.findActive(token);
    if (!session) return null;
    await this.sessions.revoke(session.id);
    return session.personId;
  }

  private async findActive(token: string): Promise<ActiveSessionRecord | null> {
    if (!token) return null;
    const session = await this.sessions.findByTokenHash(hashSessionToken(token));
    if (!session || session.revoked || session.expired || session.idleSeconds >= this.idleTimeoutSeconds) return null;
    return session;
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
