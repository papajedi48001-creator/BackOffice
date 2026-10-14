import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LocalAuthService, hashPassword, loginThrottleKey } from './auth-service';
import { DatabaseAccessSubjectLoader, DatabaseLocalAccountRepository, DatabaseLoginThrottle, DatabaseSessionRepository } from './database-identity-repository';
import { SessionService, hashSessionToken } from './session-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('identity repositories against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const personId = randomUUID();
  const organizationId = randomUUID();
  const roleName = `hr-reader-${randomUUID()}`;

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Identity integration unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID()]);
    const roleId = randomUUID();
    await database.execute('INSERT INTO role (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [roleId, roleName]);
    await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), personId, roleId, organizationId]);
    await database.execute('INSERT INTO data_owner_assignment (id, module_code, organization_id, person_id, created_at) VALUES (?, ?, NULL, ?, UTC_TIMESTAMP())', [randomUUID(), 'hr', personId]);
  });
  afterAll(async () => database.close());

  it('starts, resolves with database roles, and revokes a session stored only as a hash', async () => {
    const sessions = new SessionService(new DatabaseSessionRepository(database), new DatabaseAccessSubjectLoader(database));
    const { token } = await sessions.start(personId);

    const stored = await database.query<{ tokenHash: string; lifetime: number }>('SELECT token_hash AS tokenHash, TIMESTAMPDIFF(SECOND, created_at, expires_at) AS lifetime FROM user_session WHERE person_id = ?', [personId]);
    expect(stored).toEqual([{ tokenHash: hashSessionToken(token), lifetime: 43_200 }]);
    await expect(sessions.resolve(token)).resolves.toEqual({ authenticated: true, personId, roles: [{ name: roleName, organizationId }], dataOwnerModules: ['hr'] });

    await expect(sessions.revoke(token)).resolves.toBe(personId);
    await expect(sessions.resolve(token)).resolves.toBeNull();
  });

  it('rejects a session idle for thirty minutes', async () => {
    const sessions = new SessionService(new DatabaseSessionRepository(database), new DatabaseAccessSubjectLoader(database));
    const { token } = await sessions.start(personId);
    await database.execute('UPDATE user_session SET last_seen_at = UTC_TIMESTAMP() - INTERVAL 31 MINUTE WHERE token_hash = ?', [hashSessionToken(token)]);

    await expect(sessions.resolve(token)).resolves.toBeNull();
  });

  it('locks a username after five failures and clears it after the window has passed', async () => {
    const username = `user-${randomUUID()}`;
    await database.execute('INSERT INTO local_account (id, person_id, username, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), personId, username, await hashPassword('correct-password')]);
    const throttle = new DatabaseLoginThrottle(database);
    const auth = new LocalAuthService(new DatabaseLocalAccountRepository(database), { throttle });

    for (let attempt = 0; attempt < 4; attempt += 1) await expect(auth.authenticateLocal({ username, password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(throttle.isLocked(loginThrottleKey(username))).resolves.toBe(false);
    await expect(auth.authenticateLocal({ username, password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(auth.authenticateLocal({ username, password: 'correct-password' })).rejects.toThrow('LOGIN_LOCKED');

    await database.execute('UPDATE login_throttle SET locked_until = UTC_TIMESTAMP() - INTERVAL 1 SECOND, window_started_at = UTC_TIMESTAMP() - INTERVAL 16 MINUTE WHERE key_hash = ?', [loginThrottleKey(username)]);
    await expect(auth.authenticateLocal({ username, password: 'correct-password' })).resolves.toMatchObject({ personId });
    await expect(database.query('SELECT key_hash FROM login_throttle WHERE key_hash = ?', [loginThrottleKey(username)])).resolves.toEqual([]);
  });

  it('starts a fresh window after an old failure streak expires', async () => {
    const key = loginThrottleKey(`stale-${randomUUID()}`);
    const throttle = new DatabaseLoginThrottle(database);
    for (let attempt = 0; attempt < 4; attempt += 1) await throttle.recordFailure(key);
    await database.execute('UPDATE login_throttle SET window_started_at = UTC_TIMESTAMP() - INTERVAL 16 MINUTE WHERE key_hash = ?', [key]);
    await throttle.recordFailure(key);

    await expect(database.query('SELECT failures, locked_until AS lockedUntil FROM login_throttle WHERE key_hash = ?', [key])).resolves.toEqual([{ failures: 1, lockedUntil: null }]);
  });
});
