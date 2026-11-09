import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcError } from '@backoffice/core';
import { sealFlow } from '../../../../../lib/provider-sso';

const mocks = vi.hoisted(() => ({ config: vi.fn(), complete: vi.fn(), resolve: vi.fn(), getSharedDatabase: vi.fn(), startSession: vi.fn(), pending: vi.fn(), recordAudit: vi.fn() }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: mocks.config, portalOidcClient: () => ({ complete: mocks.complete }), externalLoginService: () => ({ resolve: mocks.resolve }) }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/session')>(), startSession: mocks.startSession, sessionService: () => ({ pendingPasswordChange: mocks.pending }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), AuditService: class { recordAudit = mocks.recordAudit; } }));

import { GET } from './route';

const config = { issuer: 'https://portal.test', clientId: 'backoffice', clientSecret: 'secret-value-that-is-long-enough-0123', redirectUri: 'https://backoffice.test/api/auth/provider/callback' };
const flow = { state: 'state-1', nonce: 'nonce-1', verifier: 'verifier-1' };

function callback(query: string, cookie: string | null = sealFlow(flow, config.clientSecret)) {
  return GET(new Request(`https://backoffice.test/api/auth/provider/callback?${query}`, { headers: cookie ? { cookie: `backoffice_provider_flow=${cookie}` } : {} }));
}
const location = (response: Response) => response.headers.get('location');

beforeEach(() => {
  mocks.config.mockReturnValue(config);
  mocks.getSharedDatabase.mockReturnValue({ execute: vi.fn(), query: vi.fn() });
  mocks.pending.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

describe('GET /api/auth/provider/callback', () => {
  it('is 404 when not configured', async () => {
    mocks.config.mockReturnValue(null);
    expect((await callback('code=c&state=state-1')).status).toBe(404);
  });

  it('without the flow cookie goes back to sign-in as failed and never calls the portal', async () => {
    const response = await callback('code=c&state=state-1', null);
    expect(location(response)).toBe('https://backoffice.test/?provider=failed');
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'identity.provider_login', result: 'FAILURE', metadata: { stage: 'state' } }));
  });

  it('a state from another tab is failed', async () => {
    expect(location(await callback('code=c&state=other-tab'))).toBe('https://backoffice.test/?provider=failed');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('a portal error answer is failed', async () => {
    expect(location(await callback('error=invalid_request&state=state-1'))).toBe('https://backoffice.test/?provider=failed');
  });

  it('the portal being down is unavailable', async () => {
    mocks.complete.mockRejectedValue(new OidcError('UNAVAILABLE'));
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?provider=unavailable');
  });

  it('a refused token is failed and audited', async () => {
    mocks.complete.mockRejectedValue(new OidcError('INVALID'));
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?provider=failed');
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { stage: 'token' } }));
  });

  it('a linked person gets a session and the dashboard, and the flow cookie is cleared', async () => {
    mocks.complete.mockResolvedValue({ issuer: config.issuer, subject: 'member-1', displayName: 'สมชาย' });
    mocks.resolve.mockResolvedValue({ kind: 'linked', personId: 'person-1' });
    mocks.startSession.mockResolvedValue({ token: 'session-token', maxAgeSeconds: 43_200 });
    const response = await callback('code=c&state=state-1');
    expect(mocks.complete).toHaveBeenCalledWith('c', flow);
    expect(location(response)).toBe('https://backoffice.test/dashboard');
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('backoffice_session=session-token');
    expect(cookies).toMatch(/backoffice_provider_flow=;/);
  });

  it('a linked person who must change the password goes to change-password', async () => {
    mocks.complete.mockResolvedValue({ issuer: config.issuer, subject: 'member-1', displayName: null });
    mocks.resolve.mockResolvedValue({ kind: 'linked', personId: 'person-1' });
    mocks.startSession.mockResolvedValue({ token: 'session-token', maxAgeSeconds: 43_200 });
    mocks.pending.mockResolvedValue({ personId: 'person-1' });
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/change-password');
  });

  it('an unlinked login gets a ticket cookie and the link page', async () => {
    mocks.complete.mockResolvedValue({ issuer: config.issuer, subject: 'member-1', displayName: 'สมชาย' });
    mocks.resolve.mockResolvedValue({ kind: 'unlinked', ticket: 'ticket-1' });
    const response = await callback('code=c&state=state-1');
    expect(location(response)).toBe('https://backoffice.test/link-provider');
    expect(response.headers.getSetCookie().join('\n')).toContain('backoffice_provider_ticket=ticket-1');
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('an inactive person is sent back with inactive', async () => {
    mocks.complete.mockResolvedValue({ issuer: config.issuer, subject: 'member-1', displayName: null });
    mocks.resolve.mockResolvedValue({ kind: 'inactive' });
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?provider=inactive');
  });

  it('never logs the code, state or token', async () => {
    const spies = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'info').mockImplementation(() => {}), vi.spyOn(console, 'log').mockImplementation(() => {})];
    mocks.complete.mockRejectedValue(new Error('boom secret-code-123'));
    await callback('code=secret-code-123&state=state-1');
    const logged = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    expect(logged).not.toContain('secret-code-123');
    expect(logged).not.toContain('state-1');
    spies.forEach((spy) => spy.mockRestore());
  });
});
