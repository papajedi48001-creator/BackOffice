import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), link: vi.fn(), getSharedDatabase: vi.fn(), startSession: vi.fn() }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: mocks.config, externalLoginService: () => ({ linkWithPassword: mocks.link }) }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/session')>(), startSession: mocks.startSession }));

import { POST } from './route';

function link(body: unknown = { username: 'somchai', password: 'pw' }, ticket: string | null = 'ticket-1') {
  return POST(new Request('https://backoffice.test/api/auth/provider/link', { method: 'POST', headers: { 'content-type': 'application/json', ...(ticket ? { cookie: `backoffice_provider_ticket=${ticket}` } : {}) }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  mocks.config.mockReturnValue({ healthUrl: 'https://moph.test', apiUrl: 'https://provider.test', healthClientId: 'h', healthClientSecret: 's', providerClientId: 'p', providerSecretKey: 'k', redirectUri: 'https://b/cb' });
  mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/provider/link', () => {
  it('links, starts a session and clears the ticket', async () => {
    mocks.link.mockResolvedValue({ personId: 'person-1', mustChangePassword: false });
    mocks.startSession.mockResolvedValue({ token: 'session-token', maxAgeSeconds: 43_200 });
    const response = await link();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, mustChangePassword: false });
    expect(mocks.link).toHaveBeenCalledWith('ticket-1', { username: 'somchai', password: 'pw' });
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('backoffice_session=session-token');
    expect(cookies).toMatch(/backoffice_provider_ticket=;/);
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'invalid_credentials'],
    ['LOGIN_LOCKED', 429, 'login_locked'],
    ['ALREADY_LINKED', 409, 'already_linked'],
    ['TICKET_EXPIRED', 410, 'ticket_expired']
  ])('maps %s to %i', async (message, status, error) => {
    mocks.link.mockRejectedValue(new Error(message));
    const response = await link();
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('without a ticket cookie is ticket_expired', async () => {
    mocks.link.mockRejectedValue(new Error('TICKET_EXPIRED'));
    expect((await link(undefined, null)).status).toBe(410);
  });

  it('a malformed body is invalid_credentials', async () => {
    mocks.link.mockRejectedValue(Object.assign(new Error('bad'), { name: 'ZodError' }));
    expect((await link({ username: '' })).status).toBe(401);
  });

  it('is 404 when not configured', async () => {
    mocks.config.mockReturnValue(null);
    expect((await link()).status).toBe(404);
  });
});
