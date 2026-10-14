import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { LocalAccount, LocalAccountRepository, LoginThrottle } from './auth-service';
import type { AccessSubjectLoader, ActiveSessionRecord, SessionRepository } from './session-service';

export class DatabaseSessionRepository implements SessionRepository {
  constructor(private readonly database: Pick<Database, 'execute' | 'query'>) {}

  async insert(session: { id: string; tokenHash: string; personId: string; lifetimeSeconds: number }): Promise<void> {
    await this.database.execute('INSERT INTO user_session (id, token_hash, person_id, created_at, last_seen_at, expires_at, revoked_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ? SECOND, NULL)', [session.id, session.tokenHash, session.personId, session.lifetimeSeconds]);
  }

  async findByTokenHash(tokenHash: string): Promise<ActiveSessionRecord | null> {
    const row = (await this.database.query<{ id: string; personId: string; idleSeconds: number | string; expired: number | string; revoked: number | string }>('SELECT id, person_id AS personId, TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) AS idleSeconds, expires_at <= UTC_TIMESTAMP() AS expired, revoked_at IS NOT NULL AS revoked FROM user_session WHERE token_hash = ? LIMIT 1', [tokenHash]))[0];
    return row ? { id: row.id, personId: row.personId, idleSeconds: Number(row.idleSeconds), expired: Number(row.expired) === 1, revoked: Number(row.revoked) === 1 } : null;
  }

  async touch(sessionId: string): Promise<void> {
    await this.database.execute('UPDATE user_session SET last_seen_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL', [sessionId]);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.execute('UPDATE user_session SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL', [sessionId]);
  }
}

export class DatabaseAccessSubjectLoader implements AccessSubjectLoader {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async load(personId: string): Promise<Pick<AccessSubject, 'roles' | 'dataOwnerModules' | 'hospitalWideDataOwnerModules'>> {
    const roles = await this.database.query<{ name: string; organizationId: string | null }>('SELECT role.name AS name, role_assignment.organization_id AS organizationId FROM role_assignment JOIN role ON role.id = role_assignment.role_id WHERE role_assignment.person_id = ? ORDER BY role.name, role_assignment.organization_id', [personId]);
    const owners = await this.database.query<{ moduleCode: string; hospitalWide: number | string }>('SELECT module_code AS moduleCode, MAX(organization_id IS NULL) AS hospitalWide FROM data_owner_assignment WHERE person_id = ? GROUP BY module_code ORDER BY module_code', [personId]);
    return {
      roles: roles.map((role) => ({ name: role.name, organizationId: role.organizationId ?? null })),
      dataOwnerModules: owners.map((owner) => owner.moduleCode),
      hospitalWideDataOwnerModules: owners.filter((owner) => Number(owner.hospitalWide) === 1).map((owner) => owner.moduleCode)
    };
  }
}

export class DatabaseLocalAccountRepository implements LocalAccountRepository {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async findByUsername(username: string): Promise<LocalAccount | null> {
    return (await this.database.query<LocalAccount>('SELECT id, person_id AS personId, username, password_hash AS passwordHash FROM local_account WHERE username = ? LIMIT 1', [username]))[0] ?? null;
  }
}

export class DatabaseLoginThrottle implements LoginThrottle {
  private readonly maxFailures: number;
  private readonly windowSeconds: number;
  private readonly lockSeconds: number;

  constructor(private readonly database: Pick<Database, 'execute' | 'transaction'>, options: { maxFailures?: number; windowSeconds?: number; lockSeconds?: number } = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowSeconds = options.windowSeconds ?? 15 * 60;
    this.lockSeconds = options.lockSeconds ?? 15 * 60;
  }

  async reserveAttempt(key: string): Promise<boolean> {
    const now = 'UTC_TIMESTAMP()';
    const locked = `(locked_until IS NOT NULL AND locked_until > ${now})`;
    // A streak starts over once its window has passed (unless locked) or its lock has expired.
    const stale = `((window_started_at <= ${now} - INTERVAL ? SECOND AND NOT ${locked}) OR (locked_until IS NOT NULL AND locked_until <= ${now}))`;
    // The row lock taken by the upsert serialises concurrent attempts until this transaction commits, so the count read back is this attempt's own.
    // ON DUPLICATE KEY UPDATE assigns left to right: failures and window_started_at read the stored lock, and locked_until reads the new failures.
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        `INSERT INTO login_throttle (key_hash, failures, window_started_at, locked_until) VALUES (?, 1, ${now}, IF(1 >= ?, ${now} + INTERVAL ? SECOND, NULL)) ON DUPLICATE KEY UPDATE failures = IF(${stale}, 1, failures + 1), window_started_at = IF(${stale}, ${now}, window_started_at), locked_until = IF(failures >= ?, IF(${locked}, locked_until, ${now} + INTERVAL ? SECOND), NULL)`,
        [key, this.maxFailures, this.lockSeconds, this.windowSeconds, this.windowSeconds, this.maxFailures, this.lockSeconds]
      );
      const row = (await transaction.query<{ failures: number }>('SELECT failures FROM login_throttle WHERE key_hash = ?', [key]))[0];
      return Number(row?.failures ?? 0) <= this.maxFailures;
    });
  }

  async reset(key: string): Promise<void> {
    await this.database.execute('DELETE FROM login_throttle WHERE key_hash = ?', [key]);
  }
}
