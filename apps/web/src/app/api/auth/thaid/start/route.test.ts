import { afterEach, describe, expect, it, vi } from 'vitest';
import { openThaidFlow } from '../../../../../lib/thaid';

const mocks = vi.hoisted(() => ({ config: vi.fn(), protector: vi.fn(), pendingLogin: vi.fn() }));
vi.mock('../../../../../lib/thaid', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/thaid')>(), thaidConfig: mocks.config }));
vi.mock('../../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.protector }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: async () => ({ apiUrl: 'https://provider.test' }), externalLoginService: () => ({ pendingLogin: mocks.pendingLogin }) }));

import { GET } from './route';

const config = { clientId: 'thaid-client', clientSecret: 'thaid-secret', redirectUri: 'https://backoffice.test/api/auth/thaid/callback', apiUrl: 'https://imauth.test' };
const start = (query = '', cookie = '') => GET(new Request(`https://backoffice.test/api/auth/thaid/start${query}`, { headers: cookie ? { cookie } : {} }));
const flowFrom = (response: Response) => openThaidFlow(/backoffice_thaid_flow=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1], config.clientSecret);
afterEach(() => vi.clearAllMocks());

describe('GET /api/auth/thaid/start', () => {
  it('is 404 until ThaID and the national-ID keys are both set', async () => {
    mocks.config.mockResolvedValue(null);
    mocks.protector.mockReturnValue({});
    expect((await start()).status).toBe(404);
    mocks.config.mockResolvedValue(config);
    mocks.protector.mockReturnValue(null);
    expect((await start()).status).toBe(404);
  });

  it('sends the browser to ThaID asking for pid, with the state only in a sealed http-only cookie', async () => {
    mocks.config.mockResolvedValue(config);
    mocks.protector.mockReturnValue({});
    const response = await start();
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://imauth.test/api/v2/oauth2/auth/');
    expect(location.searchParams.get('scope')).toBe('pid');
    const flow = flowFrom(response);
    expect(flow).toEqual({ state: location.searchParams.get('state'), purpose: 'sign_in' });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('Path=/api/auth/thaid');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie).not.toContain(flow!.state);
  });

  it('remembers purpose=link from รอผูกบัญชี and treats anything else as sign_in', async () => {
    mocks.config.mockResolvedValue(config);
    mocks.protector.mockReturnValue({});
    mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี' });
    expect(flowFrom(await start('?purpose=link', 'backoffice_provider_ticket=ticket-1'))?.purpose).toBe('link');
    expect(mocks.pendingLogin).toHaveBeenCalledWith('ticket-1');
    expect(flowFrom(await start('?purpose=admin'))?.purpose).toBe('sign_in');
  });

  it('purpose=link without a live pending Provider ID login goes back to the sign-in page instead of to DOPA', async () => {
    mocks.config.mockResolvedValue(config);
    mocks.protector.mockReturnValue({});
    mocks.pendingLogin.mockResolvedValue(null);
    const response = await start('?purpose=link', 'backoffice_provider_ticket=gone');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://backoffice.test/?provider=failed');
    expect(response.headers.get('set-cookie') ?? '').not.toContain('backoffice_thaid_flow=');
    expect((await start('?purpose=link')).headers.get('location')).toBe('https://backoffice.test/?provider=failed');
  });
});
