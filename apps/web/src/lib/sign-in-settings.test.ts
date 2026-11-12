import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn(() => null as object | null) }));
vi.mock('./database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));

import { clearSignInRoutesCache, signInRoutes } from './sign-in-settings';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; clearSignInRoutesCache(); vi.clearAllMocks(); });

describe('signInRoutes', () => {
  it('falls back to the server environment when the database is down', async () => {
    process.env.THAID_CLIENT_ID = 'thaid-env';
    process.env.THAID_CLIENT_SECRET = 'thaid-env-secret';
    process.env.THAID_REDIRECT_URI = 'https://office.test/api/auth/thaid/callback';
    expect((await signInRoutes()).thaid).toMatchObject({ clientId: 'thaid-env', apiUrl: 'https://imauth.bora.dopa.go.th' });
  });

  it('reads the database once per 30 seconds and again after the cache is cleared', async () => {
    const query = vi.fn(async () => []);
    mocks.getSharedDatabase.mockReturnValue({ query, execute: vi.fn(), transaction: vi.fn(), close: vi.fn() });
    await signInRoutes();
    await signInRoutes();
    expect(query).toHaveBeenCalledTimes(1);
    clearSignInRoutesCache();
    await signInRoutes();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('retries the database after 5 seconds when it failed, not 30', async () => {
    const query = vi.fn(async () => { throw new Error('down'); });
    mocks.getSharedDatabase.mockReturnValue({ query, execute: vi.fn(), transaction: vi.fn(), close: vi.fn() });
    await signInRoutes(1_000);
    await signInRoutes(4_000);
    expect(query).toHaveBeenCalledTimes(1);
    await signInRoutes(6_500);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('a database error falls back to the environment instead of failing the sign-in page', async () => {
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn(async () => { throw new Error('down'); }), execute: vi.fn(), transaction: vi.fn(), close: vi.fn() });
    for (const key of Object.keys(process.env)) if (key.startsWith('THAID_') || key.startsWith('PROVIDER_ID_')) delete process.env[key];
    expect(await signInRoutes()).toEqual({ thaid: null, providerId: null, configured: true });
  });
});
