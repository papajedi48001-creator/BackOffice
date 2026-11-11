import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), begin: vi.fn() }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: mocks.config, providerIdClient: () => ({ begin: mocks.begin }) }));

import { GET } from './route';

const config = { healthUrl: 'https://moph.test', apiUrl: 'https://provider.test', healthClientId: 'health-client', healthClientSecret: 'secret-value-that-is-long-enough-0123', providerClientId: 'provider-client', providerSecretKey: 'provider-secret', redirectUri: 'https://backoffice.test/api/auth/provider/callback' };
afterEach(() => vi.clearAllMocks());

describe('GET /api/auth/provider/start', () => {
  it('is 404 when Provider SSO is not configured', async () => {
    mocks.config.mockReturnValue(null);
    expect((await GET()).status).toBe(404);
  });

  it('redirects to MOPH ID and keeps the state in an http-only cookie', async () => {
    mocks.config.mockReturnValue(config);
    mocks.begin.mockReturnValue({ flow: { state: 'state-secret-1' }, url: new URL('https://moph.test/oauth/redirect?state=state-secret-1') });
    const response = await GET();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://moph.test/oauth/redirect?state=state-secret-1');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('backoffice_provider_flow=');
    expect(cookie).toContain('Path=/api/auth/provider');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie).not.toContain('state-secret-1');
  });
});
