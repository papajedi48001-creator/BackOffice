import { describe, expect, it } from 'vitest';
import { LocalAuthService, hashPassword } from './auth-service';

describe('LocalAuthService', () => {
  it('authenticates only a local account with the matching password', async () => {
    const service = new LocalAuthService({
      findByUsername: async (username) => username === 'hr.admin'
        ? { personId: 'person-a', username, passwordHash: await hashPassword('correct-password') }
        : null
    });

    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'correct-password' })).resolves.toMatchObject({ authenticated: true, personId: 'person-a' });
    await expect(service.authenticateLocal({ username: 'hr.admin', password: 'wrong-password' })).rejects.toThrow('Invalid local credentials');
  });
});
