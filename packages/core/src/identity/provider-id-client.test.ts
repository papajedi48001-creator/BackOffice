import { describe, expect, it } from 'vitest';
import { ProviderIdClient, ProviderIdError } from './provider-id-client';

const config = {
  healthUrl: 'https://moph.test', apiUrl: 'https://provider.test',
  healthClientId: 'health-client', healthClientSecret: 'health-secret',
  providerClientId: 'provider-client', providerSecretKey: 'provider-secret',
  redirectUri: 'https://backoffice.test/api/auth/provider/callback'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Step = 'health' | 'providerToken' | 'profile';
function harness(answers: Partial<Record<Step, () => Response>> = {}, fail = false) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (fail) throw new TypeError('fetch failed');
    if (url === 'https://moph.test/api/v1/token') return answers.health?.() ?? json({ access_token: 'health-token' });
    if (url === 'https://provider.test/api/v1/services/token') return answers.providerToken?.() ?? json({ status: 200, data: { access_token: 'provider-token' } });
    if (url === 'https://provider.test/api/v1/services/profile') return answers.profile?.() ?? json({ status: 200, data: { account_id: 'acc-1', hash_cid: 'a'.repeat(64), firstname_th: 'สมชาย', lastname_th: 'ใจดี', organization: [{ hcode: '10953' }] } });
    throw new Error(`unexpected ${url}`);
  };
  return { client: new ProviderIdClient(config, fetchImpl), calls };
}

async function failure(promise: Promise<unknown>): Promise<ProviderIdError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(ProviderIdError);
  return error as ProviderIdError;
}

describe('ProviderIdClient', () => {
  it('begin sends the browser to MOPH ID with a random state', () => {
    const { client } = harness();
    const { flow, url } = client.begin();
    expect(`${url.origin}${url.pathname}`).toBe('https://moph.test/oauth/redirect');
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: 'health-client', redirect_uri: config.redirectUri, response_type: 'code', state: flow.state });
    expect(flow.state.length).toBeGreaterThanOrEqual(43);
    expect(client.begin().flow.state).not.toBe(flow.state);
    expect(url.toString()).not.toContain('health-secret');
  });

  it('complete exchanges the code at MOPH ID, then reads the Provider ID profile', async () => {
    const { client, calls } = harness();
    const { identity } = await client.complete('the-code');
    expect(identity).toEqual({ issuer: 'https://provider.test', subject: 'acc-1', displayName: 'สมชาย ใจดี' });
    expect(client.issuer).toBe('https://provider.test');

    const [health, providerToken, profile] = calls;
    expect(health!.init?.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(health!.init?.body)))).toEqual({ grant_type: 'authorization_code', code: 'the-code', redirect_uri: config.redirectUri, client_id: 'health-client', client_secret: 'health-secret' });
    expect(providerToken!.init?.method).toBe('POST');
    expect(JSON.parse(String(providerToken!.init?.body))).toEqual({ client_id: 'provider-client', secret_key: 'provider-secret', token_by: 'Health ID', token: 'health-token' });
    expect(profile!.init?.method ?? 'GET').toBe('GET');
    expect(profile!.init?.headers).toMatchObject({ authorization: 'Bearer provider-token', 'client-id': 'provider-client', 'secret-key': 'provider-secret' });
    for (const call of calls) expect(call.init?.redirect).toBe('error');
  });

  it('keeps hash_cid apart from the identity, for matching only', async () => {
    const { identity, hashCid } = await harness().client.complete('the-code');
    expect(JSON.stringify(identity)).not.toContain('a'.repeat(64));
    expect(Object.keys(identity).sort()).toEqual(['displayName', 'issuer', 'subject']);
    expect(hashCid).toBe('a'.repeat(64));
  });

  it('lower-cases hash_cid and drops a missing or malformed one', async () => {
    const profile = (hash: unknown) => () => json({ data: { account_id: 'acc-1', hash_cid: hash } });
    expect((await harness({ profile: profile('AB'.repeat(32)) }).client.complete('c')).hashCid).toBe('ab'.repeat(32));
    expect((await harness({ profile: profile(undefined) }).client.complete('c')).hashCid).toBeNull();
    expect((await harness({ profile: profile('not-a-hash') }).client.complete('c')).hashCid).toBeNull();
    expect((await harness({ profile: profile(12) }).client.complete('c')).hashCid).toBeNull();
  });

  it('a profile without a name has a null display name', async () => {
    const { identity } = await harness({ profile: () => json({ data: { account_id: 'acc-2' } }) }).client.complete('c');
    expect(identity.displayName).toBeNull();
  });

  it('a refused code, a refused Provider ID token or a missing account is INVALID', async () => {
    expect((await failure(harness({ health: () => json({ message: 'invalid code' }, 400) }).client.complete('c'))).code).toBe('INVALID');
    expect((await failure(harness({ providerToken: () => json({ message: 'not a provider' }, 401) }).client.complete('c'))).code).toBe('INVALID');
    expect((await failure(harness({ profile: () => json({ data: { account_id: '' } }) }).client.complete('c'))).code).toBe('INVALID');
  });

  it('a server error, a non-JSON answer or no network is UNAVAILABLE', async () => {
    expect((await failure(harness({ health: () => json({}, 503) }).client.complete('c'))).code).toBe('UNAVAILABLE');
    expect((await failure(harness({ profile: () => new Response('<html>', { status: 200 }) }).client.complete('c'))).code).toBe('UNAVAILABLE');
    expect((await failure(harness({}, true).client.complete('c'))).code).toBe('UNAVAILABLE');
  });

  it('a health answer without an access token is UNAVAILABLE', async () => {
    expect((await failure(harness({ health: () => json({ data: {} }) }).client.complete('c'))).code).toBe('UNAVAILABLE');
  });
});
