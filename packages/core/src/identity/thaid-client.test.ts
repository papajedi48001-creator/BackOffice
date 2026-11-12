import { describe, expect, it, vi } from 'vitest';
import { ThaidClient, ThaidError, validCitizenId } from './thaid-client.ts';

const settings = { clientId: 'thaid-client', clientSecret: 'thaid-secret', redirectUri: 'https://office.test/api/auth/thaid/callback', apiUrl: 'https://imauth.test' };
// 1-1017-00207-58-4 style check digit: computed below so the fixture is a valid citizen ID.
function withCheckDigit(first12: string): string {
  const total = [...first12].reduce((sum, digit, index) => sum + Number(digit) * (13 - index), 0);
  return first12 + String((11 - (total % 11)) % 10);
}
const pid = withCheckDigit('110170020758');
const jwt = (claims: object) => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('validCitizenId', () => {
  it('accepts 13 digits with the mod-11 check digit only', () => {
    expect(validCitizenId(pid)).toBe(true);
    expect(validCitizenId(pid.slice(0, 12) + String((Number(pid[12]) + 1) % 10))).toBe(false);
    expect(validCitizenId(Number(pid))).toBe(false);
    expect(validCitizenId(` ${pid}`)).toBe(false);
    expect(validCitizenId('١١٠١٧٠٠٢٠٧٥٨٤')).toBe(false);
  });
});

describe('ThaidClient', () => {
  it('builds the authorize URL asking for pid only', () => {
    const url = new URL(new ThaidClient(settings).authorizeUrl('state-1'));
    expect(url.origin + url.pathname).toBe('https://imauth.test/api/v2/oauth2/auth/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: 'code', client_id: 'thaid-client', redirect_uri: settings.redirectUri, scope: 'pid', state: 'state-1' });
  });

  it('exchanges the code with HTTP Basic and a form body, without following redirects', async () => {
    const fetchImpl = answer({ access_token: 't', pid });
    expect(await new ThaidClient(settings, fetchImpl).citizenIdForCode('code-1')).toBe(pid);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://imauth.test/api/v2/oauth2/token/');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${Buffer.from('thaid-client:thaid-secret').toString('base64')}`);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ grant_type: 'authorization_code', code: 'code-1', redirect_uri: settings.redirectUri });
  });

  it('reads pid from the id_token when the answer has none, with aud as a string or a list', async () => {
    expect(await new ThaidClient(settings, answer({ id_token: jwt({ aud: 'thaid-client', pid }) })).citizenIdForCode('c')).toBe(pid);
    expect(await new ThaidClient(settings, answer({ id_token: jwt({ aud: ['other', 'thaid-client'], pid }) })).citizenIdForCode('c')).toBe(pid);
  });

  it.each([
    ['an id_token for another client', { pid, id_token: jwt({ aud: 'someone-else', pid }) }],
    ['an id_token that disagrees on pid', { pid, id_token: jwt({ aud: 'thaid-client', pid: withCheckDigit('310170020758') }) }],
    ['a pid sent as a number', { pid: Number(pid) }],
    ['a pid with a wrong check digit', { pid: pid.slice(0, 12) + String((Number(pid[12]) + 1) % 10) }],
    ['no pid at all', { access_token: 't' }],
    ['a broken id_token', { id_token: 'not-a-jwt' }]
  ])('refuses %s as INVALID', async (_name, body) => {
    await expect(new ThaidClient(settings, answer(body)).citizenIdForCode('c')).rejects.toEqual(new ThaidError('INVALID'));
  });

  it('a 4xx is INVALID; a 5xx, a network error or non-JSON is UNAVAILABLE', async () => {
    await expect(new ThaidClient(settings, answer({ error: 'invalid_grant' }, 400)).citizenIdForCode('c')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(new ThaidClient(settings, answer({}, 502)).citizenIdForCode('c')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(new ThaidClient(settings, answer('<html>')).citizenIdForCode('c')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(new ThaidClient(settings, vi.fn(async () => { throw new TypeError('fetch failed'); })).citizenIdForCode('c')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('never puts the citizen ID in an error message', async () => {
    const error = await new ThaidClient(settings, answer({ pid, id_token: jwt({ aud: 'x', pid }) })).citizenIdForCode('c').catch((caught: unknown) => caught);
    expect(String((error as Error).message)).not.toContain(pid);
  });
});
