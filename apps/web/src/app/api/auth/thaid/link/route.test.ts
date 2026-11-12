import { afterEach, describe, expect, it, vi } from 'vitest';
import { sealThaidLink, ticketHashOf } from '../../../../../lib/thaid';

const mocks = vi.hoisted(() => ({ config: vi.fn(), linkPending: vi.fn(), startSession: vi.fn(), afterSignIn: vi.fn(), recordAudit: vi.fn(), database: vi.fn() }));
vi.mock('../../../../../lib/thaid', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/thaid')>(), thaidConfig: mocks.config }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.database }));
vi.mock('../../../../../lib/after-sign-in', () => ({ afterSignInPath: mocks.afterSignIn }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: async () => ({ apiUrl: 'https://provider.test' }), externalLoginService: () => ({ linkPendingToPerson: mocks.linkPending }) }));
vi.mock('../../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/session')>(), startSession: mocks.startSession }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), AuditService: class { recordAudit = mocks.recordAudit; } }));

import { POST } from './route';

const config = { clientId: 'thaid-client', clientSecret: 'thaid-secret', redirectUri: 'https://backoffice.test/api/auth/thaid/callback', apiUrl: 'https://imauth.test' };
const sealed = (ticket = 'ticket-1', personId = 'person-1') => sealThaidLink({ personId, ticketHash: ticketHashOf(ticket) }, config.clientSecret);
const post = (cookie: string) => POST(new Request('https://backoffice.test/api/auth/thaid/link', { method: 'POST', headers: { cookie } }));
const ready = () => {
  mocks.config.mockResolvedValue(config);
  mocks.database.mockReturnValue({});
  mocks.linkPending.mockResolvedValue({ ok: true });
  mocks.startSession.mockResolvedValue({ token: 'session-token', maxAgeSeconds: 3600 });
  mocks.afterSignIn.mockResolvedValue('/choose-role');
};
afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/thaid/link', () => {
  it('links the Provider ID login the person confirmed, signs them in and clears both cookies', async () => {
    ready();
    const response = await post(`backoffice_thaid_link=${sealed()}; backoffice_provider_ticket=ticket-1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: '/choose-role' });
    expect(mocks.linkPending).toHaveBeenCalledWith('ticket-1', 'person-1');
    expect(mocks.startSession).toHaveBeenCalledWith('person-1');
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'identity.thaid_login', actorPersonId: 'person-1', targetId: 'person-1', result: 'SUCCESS', metadata: { stage: 'link' } }));
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/backoffice_thaid_link=;/);
    expect(cookies).toMatch(/backoffice_provider_ticket=;/);
    expect(cookies).toContain('backoffice_session=session-token');
  });

  it('refuses a missing link, a link for another Provider ID ticket, and a link the service rejects, without a session', async () => {
    ready();
    expect((await post('backoffice_provider_ticket=ticket-1')).status).toBe(400);
    expect((await post(`backoffice_thaid_link=${sealed('ticket-2')}; backoffice_provider_ticket=ticket-1`)).status).toBe(400);
    expect((await post(`backoffice_thaid_link=${sealed()}`)).status).toBe(400);
    expect(mocks.linkPending).not.toHaveBeenCalled();
    mocks.linkPending.mockResolvedValue({ ok: false, code: 'ALREADY_LINKED' });
    const refused = await post(`backoffice_thaid_link=${sealed()}; backoffice_provider_ticket=ticket-1`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'link_failed' });
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('is 404 when ThaID is off and 503 when the database is down', async () => {
    ready();
    mocks.config.mockResolvedValue(null);
    expect((await post(`backoffice_thaid_link=${sealed()}; backoffice_provider_ticket=ticket-1`)).status).toBe(404);
    mocks.config.mockResolvedValue(config);
    mocks.database.mockReturnValue(null);
    expect((await post(`backoffice_thaid_link=${sealed()}; backoffice_provider_ticket=ticket-1`)).status).toBe(503);
  });
});
