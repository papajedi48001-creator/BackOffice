import { afterEach, describe, expect, it, vi } from 'vitest';
import { openThaidFlow } from '../../../../../lib/thaid';

const mocks = vi.hoisted(() => ({ config: vi.fn(), protector: vi.fn() }));
vi.mock('../../../../../lib/thaid', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/thaid')>(), thaidConfig: mocks.config }));
vi.mock('../../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.protector }));

import { GET } from './route';

const config = { clientId: 'thaid-client', clientSecret: 'thaid-secret', redirectUri: 'https://backoffice.test/api/auth/thaid/callback', apiUrl: 'https://imauth.test' };
const start = (query = '') => GET(new Request(`https://backoffice.test/api/auth/thaid/start${query}`));
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
    expect(flowFrom(await start('?purpose=link'))?.purpose).toBe('link');
    expect(flowFrom(await start('?purpose=admin'))?.purpose).toBe('sign_in');
  });
});
