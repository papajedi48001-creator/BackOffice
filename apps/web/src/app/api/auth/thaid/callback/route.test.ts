import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThaidError } from '@backoffice/core';
import { openThaidLink, sealThaidFlow, ticketHashOf } from '../../../../../lib/thaid';

const mocks = vi.hoisted(() => ({ config: vi.fn(), citizenIdForCode: vi.fn(), resolve: vi.fn(), findActivePerson: vi.fn(), pendingLogin: vi.fn(), linkPending: vi.fn(), getSharedDatabase: vi.fn(), startSession: vi.fn(), afterSignIn: vi.fn(), recordAudit: vi.fn(), protector: vi.fn() }));
vi.mock('../../../../../lib/thaid', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/thaid')>(), thaidConfig: mocks.config, thaidClient: () => ({ citizenIdForCode: mocks.citizenIdForCode }) }));
vi.mock('../../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.protector }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/after-sign-in', () => ({ afterSignInPath: mocks.afterSignIn }));
vi.mock('../../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/provider-sso')>(), providerSsoConfig: async () => ({ apiUrl: 'https://provider.test' }), externalLoginService: () => ({ linkPendingToPerson: mocks.linkPending, pendingLogin: mocks.pendingLogin }) }));
vi.mock('../../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/session')>(), startSession: mocks.startSession }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), AuditService: class { recordAudit = mocks.recordAudit; }, ThaidLoginService: class { resolve = mocks.resolve; findActivePerson = mocks.findActivePerson; } }));

import { GET } from './route';

const config = { clientId: 'thaid-client', clientSecret: 'thaid-secret', redirectUri: 'https://backoffice.test/api/auth/thaid/callback', apiUrl: 'https://imauth.test' };
const pid = '1101700207584';
function callback(query: string, purpose: 'sign_in' | 'link' = 'sign_in', extraCookie = '') {
  const cookie = `backoffice_thaid_flow=${sealThaidFlow({ state: 'state-1', purpose }, config.clientSecret)}${extraCookie}`;
  return GET(new Request(`http://web:3000/api/auth/thaid/callback?${query}`, { headers: { cookie } }));
}
const location = (response: Response) => response.headers.get('location');

beforeEach(() => {
  mocks.config.mockResolvedValue(config);
  mocks.protector.mockReturnValue({});
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.startSession.mockResolvedValue({ token: 'session-token', maxAgeSeconds: 43_200 });
  mocks.afterSignIn.mockResolvedValue('/dashboard');
});
afterEach(() => vi.clearAllMocks());

describe('GET /api/auth/thaid/callback', () => {
  it('is 404 when ThaID is not set up', async () => {
    mocks.config.mockResolvedValue(null);
    expect((await callback('code=c&state=state-1')).status).toBe(404);
  });

  it.each([['a foreign state', 'code=c&state=other'], ['no code', 'state=state-1'], ['an error answer', 'code=c&state=state-1&error=access_denied'], ['a code over 4096 characters', `code=${'x'.repeat(4097)}&state=state-1`]])(
    '%s goes back to the public sign-in page as failed, audited at stage state', async (_name, query) => {
      expect(location(await callback(query))).toBe('https://backoffice.test/?thaid=failed');
      expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'identity.thaid_login', result: 'FAILURE', metadata: { stage: 'state' } }));
      expect(mocks.citizenIdForCode).not.toHaveBeenCalled();
    });

  it('a refused code is failed (stage token); DOPA being down is unavailable', async () => {
    mocks.citizenIdForCode.mockRejectedValueOnce(new ThaidError('INVALID'));
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?thaid=failed');
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { stage: 'token' } }));
    mocks.citizenIdForCode.mockRejectedValueOnce(new ThaidError('UNAVAILABLE'));
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?thaid=unavailable');
  });

  it('a บุคลากร found by national ID gets a session and the next page, and the flow cookie is cleared', async () => {
    mocks.citizenIdForCode.mockResolvedValue(pid);
    mocks.resolve.mockResolvedValue({ kind: 'active', personId: 'person-1' });
    mocks.afterSignIn.mockResolvedValue('/choose-role');
    const response = await callback('code=c&state=state-1');
    expect(mocks.citizenIdForCode).toHaveBeenCalledWith('c');
    expect(mocks.resolve).toHaveBeenCalledWith(pid);
    expect(mocks.startSession).toHaveBeenCalledWith('person-1');
    expect(location(response)).toBe('https://backoffice.test/choose-role');
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('backoffice_session=session-token');
    expect(cookies).toMatch(/backoffice_thaid_flow=;/);
    expect(cookies).not.toContain(pid);
  });

  it.each([['not_found'], ['inactive']])('%s goes back with that message and no session', async (kind) => {
    mocks.citizenIdForCode.mockResolvedValue(pid);
    mocks.resolve.mockResolvedValue({ kind });
    const response = await callback('code=c&state=state-1');
    expect(location(response)).toBe(`https://backoffice.test/?thaid=${kind}`);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('purpose link: does not link yet; it sends the person to confirm on screen which Provider ID account becomes theirs', async () => {
    mocks.citizenIdForCode.mockResolvedValue(pid);
    mocks.findActivePerson.mockResolvedValue('person-1');
    mocks.pendingLogin.mockResolvedValue({ displayName: 'สมชาย ใจดี' });
    const response = await callback('code=c&state=state-1', 'link', '; backoffice_provider_ticket=ticket-1');
    expect(mocks.findActivePerson).toHaveBeenCalledWith(pid);
    expect(mocks.linkPending).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(location(response)).toBe('https://backoffice.test/link-provider/confirm');
    const sealed = /backoffice_thaid_link=([^;]+)/.exec(response.headers.getSetCookie().join('\n'))?.[1];
    expect(openThaidLink(sealed, config.clientSecret)).toEqual({ personId: 'person-1', ticketHash: ticketHashOf('ticket-1') });
    expect(response.headers.getSetCookie().join('\n')).not.toContain(pid);
  });

  it('purpose link: no matching บุคลากร or no live pending login stays on รอผูกบัญชี with a message', async () => {
    mocks.citizenIdForCode.mockResolvedValue(pid);
    mocks.findActivePerson.mockResolvedValue(null);
    expect(location(await callback('code=c&state=state-1', 'link', '; backoffice_provider_ticket=ticket-1'))).toBe('https://backoffice.test/link-provider?thaid=not_found');
    mocks.findActivePerson.mockResolvedValue('person-1');
    mocks.pendingLogin.mockResolvedValue(null);
    expect(location(await callback('code=c&state=state-1', 'link', '; backoffice_provider_ticket=ticket-1'))).toBe('https://backoffice.test/link-provider?thaid=failed');
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('never logs the citizen ID', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.citizenIdForCode.mockResolvedValue(pid);
    mocks.resolve.mockRejectedValue(new Error(`boom ${pid}`));
    expect(location(await callback('code=c&state=state-1'))).toBe('https://backoffice.test/?thaid=unavailable');
    expect(JSON.stringify(error.mock.calls)).not.toContain(pid);
    error.mockRestore();
  });
});
