import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionService, type ActiveSessionRecord, type SessionRepository } from './session-service';

class MemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, ActiveSessionRecord & { tokenHash: string; lifetimeSeconds: number }>();
  readonly touched: string[] = [];
  readonly revoked: string[] = [];
  async insert(input: { id: string; tokenHash: string; personId: string; lifetimeSeconds: number }) { this.rows.set(input.tokenHash, { ...input, idleSeconds: 0, expired: false, revoked: false }); }
  async findByTokenHash(tokenHash: string) { return this.rows.get(tokenHash) ?? null; }
  async touch(id: string) { this.touched.push(id); }
  async revoke(id: string) { this.revoked.push(id); for (const row of this.rows.values()) if (row.id === id) row.revoked = true; }
}

const access = { load: async (personId: string) => ({ roles: [{ name: 'hr-reader', organizationId: `unit-of-${personId}` }], dataOwnerModules: ['hr'] }) };

function service(repository: MemorySessionRepository, loader = access) {
  let counter = 0;
  return new SessionService(repository, loader, { createId: () => `session-${++counter}`, createToken: () => `token-${counter}` });
}

describe('SessionService', () => {
  it('stores only a hash of the token and limits the session to twelve hours', async () => {
    const repository = new MemorySessionRepository();
    const started = await service(repository).start('person-a');

    expect(started).toEqual({ token: 'token-0', maxAgeSeconds: 12 * 60 * 60 });
    const [stored] = [...repository.rows.values()];
    expect(stored).toMatchObject({ id: 'session-1', personId: 'person-a', lifetimeSeconds: 43_200, tokenHash: createHash('sha256').update('token-0').digest('hex') });
    expect(JSON.stringify(stored)).not.toContain('"token-0"');
  });

  it('resolves an active session with access loaded from the database on every call', async () => {
    const repository = new MemorySessionRepository();
    const sessions = service(repository);
    const { token } = await sessions.start('person-a');

    await expect(sessions.resolve(token)).resolves.toEqual({ authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-of-person-a' }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: [] });

    const revokedAccess = new SessionService(repository, { load: async () => ({ roles: [], dataOwnerModules: [] }) });
    await expect(revokedAccess.resolve(token)).resolves.toMatchObject({ roles: [], dataOwnerModules: [] });
  });

  it.each([
    ['revoked', { revoked: true }],
    ['past its absolute expiry', { expired: true }],
    ['idle for thirty minutes', { idleSeconds: 30 * 60 }]
  ])('rejects a session that is %s', async (_label, state) => {
    const repository = new MemorySessionRepository();
    const sessions = service(repository);
    const { token } = await sessions.start('person-a');
    Object.assign([...repository.rows.values()][0]!, state);

    await expect(sessions.resolve(token)).resolves.toBeNull();
  });

  it('rejects an unknown or empty token without loading access', async () => {
    let loads = 0;
    const sessions = service(new MemorySessionRepository(), { load: async () => { loads += 1; return { roles: [], dataOwnerModules: [] }; } });
    await expect(sessions.resolve('unknown')).resolves.toBeNull();
    await expect(sessions.resolve('')).resolves.toBeNull();
    expect(loads).toBe(0);
  });

  it('extends idle time at most once a minute', async () => {
    const repository = new MemorySessionRepository();
    const sessions = service(repository);
    const { token } = await sessions.start('person-a');
    const row = [...repository.rows.values()][0]!;

    row.idleSeconds = 30;
    await sessions.resolve(token);
    row.idleSeconds = 90;
    await sessions.resolve(token);

    expect(repository.touched).toEqual(['session-1']);
  });

  it('revokes the session behind a token and reports its person', async () => {
    const repository = new MemorySessionRepository();
    const sessions = service(repository);
    const { token } = await sessions.start('person-a');

    await expect(sessions.revoke(token)).resolves.toBe('person-a');
    await expect(sessions.resolve(token)).resolves.toBeNull();
    await expect(sessions.revoke('unknown')).resolves.toBeNull();
  });
});
