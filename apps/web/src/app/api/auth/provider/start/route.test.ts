import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), begin: vi.fn() }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: mocks.config, portalOidcClient: () => ({ begin: mocks.begin }) }));

import { GET } from './route';

const config = { issuer: 'https://portal.test', clientId: 'backoffice', clientSecret: 'secret-value-that-is-long-enough-0123', redirectUri: 'https://backoffice.test/api/auth/provider/callback' };
afterEach(() => vi.clearAllMocks());

describe('GET /api/auth/provider/start', () => {
  it('is 404 when Provider SSO is not configured', async () => {
    mocks.config.mockReturnValue(null);
    expect((await GET()).status).toBe(404);
  });

  it('redirects to the portal and keeps the flow in an http-only cookie', async () => {
    mocks.config.mockReturnValue(config);
    mocks.begin.mockReturnValue({ flow: { state: 'state-1', nonce: 'nonce-1', verifier: 'verifier-1' }, url: new URL('https://portal.test/oidc/authorize?state=state-1') });
    const response = await GET();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://portal.test/oidc/authorize?state=state-1');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('backoffice_provider_flow=');
    expect(cookie).toContain('Path=/api/auth/provider');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie).not.toContain('verifier-1');
  });
});
