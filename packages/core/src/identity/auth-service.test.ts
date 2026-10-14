import { describe, expect, it, vi } from 'vitest';
import type { AuditInput } from '@backoffice/contracts';
import { LocalAuthService, hashPassword, type LoginThrottle } from './auth-service';

class MemoryThrottle implements LoginThrottle {
  readonly failures = new Map<string, number>();
  constructor(private readonly limit = 5) {}
  async isLocked(key: string) { return (this.failures.get(key) ?? 0) >= this.limit; }
  async recordFailure(key: string) { this.failures.set(key, (this.failures.get(key) ?? 0) + 1); }
  async reset(key: string) { this.failures.delete(key); }
}

async function setup() {
  const passwordHash = await hashPassword('correct-password');
  const findByUsername = vi.fn(async (username: string) => username === 'hr.admin' ? { id: 'account-a', personId: 'person-a', username, passwordHash } : null);
  const audits: AuditInput[] = [];
  const throttle = new MemoryThrottle();
  const service = new LocalAuthService({ findByUsername }, { throttle, audit: { recordAudit: async (input) => { audits.push(input); } } });
  return { service, audits, throttle, findByUsername };
}

describe('LocalAuthService', () => {
  it('authenticates only a local account with the matching password and audits both outcomes', async () => {
    const { service, audits } = await setup();

    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'correct-password' })).resolves.toEqual({ personId: 'person-a', accountId: 'account-a' });
    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'wrong-password' })).rejects.toThrow('INVALID_CREDENTIALS');

    expect(audits).toEqual([
      { actorPersonId: 'person-a', action: 'identity.local_login', targetType: 'local_account', targetId: 'account-a', result: 'SUCCESS', metadata: {} },
      { actorPersonId: null, action: 'identity.local_login', targetType: 'local_account', targetId: 'account-a', result: 'FAILURE', metadata: {} }
    ]);
    expect(JSON.stringify(audits)).not.toContain('password');
    expect(JSON.stringify(audits)).not.toContain('hr.admin');
  });

  it('locks a username after five failures, even for the correct password', async () => {
    const { service } = await setup();
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(service.authenticateLocal({ username: 'HR.Admin ', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');

    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'correct-password' })).rejects.toThrow('LOGIN_LOCKED');
  });

  it('clears the failure count after a successful login', async () => {
    const { service, throttle } = await setup();
    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
    await service.authenticateLocal({ username: 'hr.admin', password: 'correct-password' });

    expect(throttle.failures.size).toBe(0);
  });

  it('counts failures for an unknown username without auditing it and still verifies a password hash', async () => {
    const { service, audits, throttle } = await setup();
    const started = performance.now();
    await expect(service.authenticateLocal({ username: 'nobody', password: 'guess' })).rejects.toThrow('INVALID_CREDENTIALS');
    const elapsed = performance.now() - started;

    expect(audits).toEqual([]);
    expect([...throttle.failures.values()]).toEqual([1]);
    expect(elapsed).toBeGreaterThan(5);
  });

  it('keys the throttle by a hash, never the raw username', async () => {
    const { service, throttle } = await setup();
    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'wrong' })).rejects.toThrow();

    const [key] = [...throttle.failures.keys()];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
