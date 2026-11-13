import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OidcError, PortalOidcClient } from './oidc-client';

const config = { issuer: 'https://portal.test', clientId: 'backoffice', clientSecret: 'secret-value', redirectUri: 'https://backoffice.test/api/auth/provider/callback' };
const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');

function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' } };
}

function token(privateKey: KeyObject, claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'ES256', kid: 'k1', typ: 'JWT' }) {
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  return `${input}.${b64(sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
}

const nowSeconds = 1_800_000_000;
const baseClaims = (nonce: string) => ({ iss: config.issuer, aud: 'backoffice', sub: 'member-1', iat: nowSeconds, exp: nowSeconds + 300, nonce, auth_time: nowSeconds - 60, name: 'สมชาย ใจดี', preferred_username: 'somchai.s' });

function harness(options: { tokenBody?: (nonce: string) => unknown; tokenStatus?: number; keys?: Array<Record<string, unknown>>; tokenText?: string; fail?: boolean } = {}) {
  const primary = keyPair('k1');
  const calls: string[] = [];
  let nonce = '';
  let keys = options.keys ?? [primary.jwk];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (options.fail) throw new TypeError('fetch failed');
    if (url === `${config.issuer}/oidc/jwks`) return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === `${config.issuer}/oidc/token`) {
      const body = new URLSearchParams(String(init?.body));
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('backoffice:secret-value').toString('base64')}`);
      expect(body.get('redirect_uri')).toBe(config.redirectUri);
      if (options.tokenText !== undefined) return new Response(options.tokenText, { status: options.tokenStatus ?? 200 });
      const payload = options.tokenBody ? options.tokenBody(nonce) : { id_token: token(primary.privateKey, baseClaims(nonce)), token_type: 'Bearer', expires_in: 300 };
      return new Response(JSON.stringify(payload), { status: options.tokenStatus ?? 200 });
    }
    throw new Error(`unexpected ${url}`);
  };
  const client = new PortalOidcClient(config, fetchImpl, () => new Date(nowSeconds * 1000));
  const begin = () => { const started = client.begin(); nonce = started.flow.nonce; return started; };
  return { client, begin, calls, primary, setKeys: (next: Array<Record<string, unknown>>) => { keys = next; } };
}

async function code(options: Parameters<typeof harness>[0] = {}) {
  const h = harness(options);
  const { flow } = h.begin();
  return h.client.complete('the-code', flow);
}

describe('PortalOidcClient', () => {
  it('begin builds the authorize URL with an S256 challenge', () => {
    const { flow, url } = harness().begin();
    expect(`${url.origin}${url.pathname}`).toBe('https://portal.test/oidc/authorize');
    expect(url.searchParams.get('client_id')).toBe('backoffice');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(flow.state);
    expect(url.searchParams.get('nonce')).toBe(flow.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(flow.verifier).digest('base64url'));
    expect(url.searchParams.has('prompt')).toBe(false);
  });

  it('complete returns the identity for a valid token', async () => {
    await expect(code()).resolves.toEqual({ issuer: 'https://portal.test', subject: 'member-1', displayName: 'สมชาย ใจดี' });
  });

  const bad: Array<[string, (h: ReturnType<typeof harness>, nonce: string) => unknown]> = [
    ['wrong iss', (h, n) => ({ id_token: token(h.primary.privateKey, { ...baseClaims(n), iss: 'https://other' }) })],
    ['wrong aud', (h, n) => ({ id_token: token(h.primary.privateKey, { ...baseClaims(n), aud: 'other' }) })],
    ['wrong nonce', (h) => ({ id_token: token(h.primary.privateKey, baseClaims('other')) })],
    ['expired beyond 60s skew', (h, n) => ({ id_token: token(h.primary.privateKey, { ...baseClaims(n), exp: nowSeconds - 61 }) })],
    ['issued in the future beyond skew', (h, n) => ({ id_token: token(h.primary.privateKey, { ...baseClaims(n), iat: nowSeconds + 120 }) })],
    ['alg none', (h, n) => ({ id_token: `${b64(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64(JSON.stringify(baseClaims(n)))}.` })],
    ['RS256 header', (h, n) => ({ id_token: token(h.primary.privateKey, baseClaims(n), { alg: 'RS256', kid: 'k1' }) })],
    ['bad signature', (h, n) => ({ id_token: token(keyPair('k1').privateKey, baseClaims(n)) })],
    ['missing sub', (h, n) => ({ id_token: token(h.primary.privateKey, { ...baseClaims(n), sub: '' }) })],
    ['no id_token', () => ({ token_type: 'Bearer' })]
  ];
  it.each(bad)('rejects %s as INVALID', async (_name, body) => {
    const h = harness();
    const { flow } = h.begin();
    const tokenHarness = harness({ tokenBody: (nonce) => body(tokenHarness, nonce), keys: undefined });
    const started = tokenHarness.begin();
    await expect(tokenHarness.client.complete('the-code', started.flow)).rejects.toMatchObject({ code: 'INVALID' });
    expect(flow).toBeDefined();
  });

  it('treats invalid_grant as INVALID', async () => {
    await expect(code({ tokenStatus: 400, tokenBody: () => ({ error: 'invalid_grant' }) })).rejects.toMatchObject({ code: 'INVALID' });
  });

  it.each([
    ['network error', { fail: true }],
    ['5xx', { tokenStatus: 502, tokenText: '<html>bad gateway</html>' }],
    ['non-JSON success body', { tokenText: '<html>login</html>' }],
    ['invalid_client', { tokenStatus: 401, tokenBody: () => ({ error: 'invalid_client' }) }]
  ] as const)('%s is UNAVAILABLE', async (_name, options) => {
    const error = await code(options as Parameters<typeof harness>[0]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OidcError);
    expect((error as OidcError).code).toBe('UNAVAILABLE');
  });

  it('refetches the JWKS once for an unknown kid', async () => {
    const h = harness();
    const rotated = keyPair('k2');
    const first = h.begin();
    await h.client.complete('the-code', first.flow);
    h.setKeys([rotated.jwk]);
    const tokenHarness = h; // reuse cache
    const second = tokenHarness.begin();
    const client = new PortalOidcClient(config, (async (input: RequestInfo | URL) => {
      const url = String(input);
      h.calls.push(url);
      if (url.endsWith('/oidc/token')) return new Response(JSON.stringify({ id_token: token(rotated.privateKey, baseClaims(second.flow.nonce), { alg: 'ES256', kid: 'k2' }) }), { status: 200 });
      return new Response(JSON.stringify({ keys: [rotated.jwk] }), { status: 200 });
    }) as typeof fetch, () => new Date(nowSeconds * 1000));
    // Prime the cache with the old key, then present a token signed by the new one.
    (client as unknown as { jwksCache: unknown }).jwksCache = { keys: [h.primary.jwk], fetchedAt: nowSeconds * 1000 };
    h.calls.length = 0;
    await expect(client.complete('the-code', second.flow)).resolves.toMatchObject({ subject: 'member-1' });
    expect(h.calls.filter((url) => !url.endsWith('/oidc/token'))).toEqual([`${config.issuer}/.well-known/jwks.json`]);
  });

  it('caches the JWKS for 10 minutes', async () => {
    const h = harness();
    await h.client.complete('the-code', h.begin().flow);
    await h.client.complete('the-code', h.begin().flow);
    expect(h.calls.filter((url) => url.endsWith('/oidc/jwks')).length).toBe(1);
  });
});

describe('PortalOidcClient.verifyPortalRequest', () => {
  const typ = 'backoffice-photo-request+jwt';
  const header = { alg: 'ES256', kid: 'k1', typ };
  const claims = { iss: config.issuer, aud: 'backoffice', sub: 'member-1', iat: nowSeconds, exp: nowSeconds + 60 };
  const check = (build: (h: ReturnType<typeof harness>) => string) => {
    const h = harness();
    return h.client.verifyPortalRequest(build(h), typ);
  };

  it('returns the member a portal-signed request names', async () => {
    await expect(check((h) => token(h.primary.privateKey, claims, header))).resolves.toEqual({ memberId: 'member-1', provider: null });
  });

  it('returns the Provider ID account the portal names alongside the member', async () => {
    const provider = { provider_iss: 'https://provider.id.th', provider_sub: 'acc-1' };
    await expect(check((h) => token(h.primary.privateKey, { ...claims, ...provider }, header)))
      .resolves.toEqual({ memberId: 'member-1', provider: { issuer: 'https://provider.id.th', subject: 'acc-1' } });
  });

  it('refuses a request with half a Provider ID account or a malformed one', async () => {
    for (const extra of [{ provider_iss: 'https://provider.id.th' }, { provider_sub: 'acc-1' }, { provider_iss: 'https://provider.id.th', provider_sub: 7 },
      { provider_iss: 'https://provider.id.th', provider_sub: '' }, { provider_iss: 'https://provider.id.th', provider_sub: 'a'.repeat(256) }, { provider_iss: 'not a url', provider_sub: 'acc-1' }]) {
      await expect(check((h) => token(h.primary.privateKey, { ...claims, ...extra }, header))).rejects.toEqual(new OidcError('INVALID'));
    }
  });

  it('refuses an ID token, another type, issuer or audience', async () => {
    await expect(check((h) => token(h.primary.privateKey, { ...claims, nonce: 'n' }))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check((h) => token(h.primary.privateKey, claims, { ...header, typ: 'other+jwt' }))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check((h) => token(h.primary.privateKey, { ...claims, iss: 'https://elsewhere.test' }, header))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check((h) => token(h.primary.privateKey, { ...claims, aud: 'other-client' }, header))).rejects.toEqual(new OidcError('INVALID'));
  });

  it('refuses an expired, long-lived or forged request', async () => {
    await expect(check((h) => token(h.primary.privateKey, { ...claims, iat: nowSeconds - 400, exp: nowSeconds - 300 }, header))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check((h) => token(h.primary.privateKey, { ...claims, exp: nowSeconds + 3600 }, header))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check(() => token(keyPair('k1').privateKey, claims, header))).rejects.toEqual(new OidcError('INVALID'));
    await expect(check(() => 'not-a-token')).rejects.toEqual(new OidcError('INVALID'));
  });
});

describe('PortalOidcClient JWKS location', () => {
  const typ = 'backoffice-photo-request+jwt';
  const header = { alg: 'ES256', kid: 'k1', typ };
  const claims = { iss: config.issuer, aud: 'backoffice', sub: 'member-1', iat: nowSeconds, exp: nowSeconds + 60 };
  const client = (answer: (url: string, init?: RequestInit) => Promise<Response>, options: { timeoutMs?: number } = {}) => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push(String(input)); return answer(String(input), init); }) as typeof fetch;
    return { calls, client: new PortalOidcClient({ ...config, ...options }, fetchImpl, () => new Date(nowSeconds * 1000)) };
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('checks a portal request against <portal>/.well-known/jwks.json', async () => {
    const key = keyPair('k1');
    const { calls, client: portal } = client(async (url) => (url === `${config.issuer}/.well-known/jwks.json` ? json({ keys: [key.jwk] }) : json({ error: 'nope' }, 404)));
    await expect(portal.verifyPortalRequest(token(key.privateKey, claims, header), typ)).resolves.toEqual({ memberId: 'member-1', provider: null });
    expect(calls).toEqual([`${config.issuer}/.well-known/jwks.json`]);
  });

  it('falls back to <portal>/oidc/jwks for a portal that does not publish /.well-known/jwks.json, and remembers it', async () => {
    const key = keyPair('k1');
    const { calls, client: portal } = client(async (url) => (url === `${config.issuer}/oidc/jwks` ? json({ keys: [key.jwk] }) : new Response('<html>not found</html>', { status: 404 })));
    await expect(portal.verifyPortalRequest(token(key.privateKey, claims, header), typ)).resolves.toMatchObject({ memberId: 'member-1' });
    expect(calls).toEqual([`${config.issuer}/.well-known/jwks.json`, `${config.issuer}/oidc/jwks`]);
    // An unknown kid refetches from the address that worked, not the missing one first.
    calls.length = 0;
    await expect(portal.verifyPortalRequest(token(key.privateKey, claims, { ...header, kid: 'k9' }), typ)).rejects.toEqual(new OidcError('INVALID'));
    expect(calls[0]).toBe(`${config.issuer}/oidc/jwks`);
  });

  it('is UNAVAILABLE when neither address answers, and never follows a redirect', async () => {
    const seen: Array<RequestInit | undefined> = [];
    const { client: portal } = client(async (_url, init) => { seen.push(init); throw new TypeError('fetch failed'); });
    await expect(portal.verifyPortalRequest(token(keyPair('k1').privateKey, claims, header), typ)).rejects.toEqual(new OidcError('UNAVAILABLE'));
    expect(seen.map((init) => init?.redirect)).toEqual(['error', 'error']);
  });

  it('gives each JWKS fetch the configured timeout', async () => {
    const started = Date.now();
    const { client: portal } = client((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 100 });
    await expect(portal.verifyPortalRequest(token(keyPair('k1').privateKey, claims, header), typ)).rejects.toEqual(new OidcError('UNAVAILABLE'));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
