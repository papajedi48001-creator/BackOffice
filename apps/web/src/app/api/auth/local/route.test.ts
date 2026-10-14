import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authenticateLocal: vi.fn(), startSession: vi.fn(), getSharedDatabase: vi.fn() }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LocalAuthService: class { authenticateLocal = mocks.authenticateLocal; } }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/session')>(), startSession: mocks.startSession }));

import { POST } from './route';

function login(body: unknown = { username: 'r0-requestor', password: 'secret-password' }) {
  return POST(new Request('http://localhost/api/auth/local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/local', () => {
  it('sets an http-only session cookie that expires with the session', async () => {
    mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
    mocks.authenticateLocal.mockResolvedValue({ personId: 'person-a', accountId: 'account-a' });
    mocks.startSession.mockResolvedValue({ token: 'opaque-token', maxAgeSeconds: 43_200 });

    const response = await login();

    expect(response.status).toBe(200);
    expect(mocks.startSession).toHaveBeenCalledWith('person-a');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('backoffice_session=opaque-token');
    expect(cookie).toContain('Max-Age=43200');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('answers a locked account with 429 and no session', async () => {
    mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
    mocks.authenticateLocal.mockRejectedValue(new Error('LOGIN_LOCKED'));

    const response = await login();

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'login_locked' });
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('answers wrong credentials with 401', async () => {
    mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
    mocks.authenticateLocal.mockRejectedValue(new Error('INVALID_CREDENTIALS'));

    const response = await login();

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports an unavailable database as 503 instead of a credential failure', async () => {
    mocks.getSharedDatabase.mockReturnValue(null);
    expect((await login()).status).toBe(503);

    mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
    mocks.authenticateLocal.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect((await login()).status).toBe(503);
  });
});
