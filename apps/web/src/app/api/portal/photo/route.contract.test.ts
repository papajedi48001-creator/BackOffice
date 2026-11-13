// @vitest-environment node
/**
 * The contract the radius-server portal relies on (see docs/superpowers/specs/2026-11-13-portal-photo-contract-design.md).
 * Tokens here are signed with a real ES256 key and checked by the real PortalOidcClient against a stubbed portal JWKS,
 * so a change that breaks what the portal sends or expects fails here. Change these tests only together with the portal.
 */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ providerConfig: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), open: vi.fn(), findLink: vi.fn(), isActivePerson: vi.fn(), photoAttachmentOf: vi.fn() }));
vi.mock('../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/provider-sso')>(), providerSsoConfig: mocks.providerConfig }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/attachments', () => ({ attachmentsEnabled: mocks.enabled, attachmentService: () => ({ openAttachment: mocks.open }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  HrProfileService: class { photoAttachmentOf = mocks.photoAttachmentOf; },
  DatabaseExternalIdentityRepository: class { findLink = mocks.findLink; isActivePerson = mocks.isActivePerson; }
}));

import { GET } from './route';

const portal = 'https://portal.contract.test';
const providerIssuer = 'https://provider.id.th';
const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const pair = (kid: string) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' } };
};
const portalKey = pair('portal-2026');
const strangerKey = pair('portal-2026');

const sealed = (privateKey: KeyObject, header: Record<string, unknown>, claims: Record<string, unknown>) => {
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  return `${input}.${b64(sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
};
const now = () => Math.floor(Date.now() / 1000);
const contractHeader = () => ({ alg: 'ES256', kid: portalKey.kid, typ: 'backoffice-photo-request+jwt' });
const contractClaims = (): Record<string, unknown> => ({ iss: portal, aud: 'backoffice', sub: 'member-42', iat: now(), exp: now() + 60, provider_iss: providerIssuer, provider_sub: 'account-7' });
const photoRequest = (overrides: { header?: Record<string, unknown>; claims?: Record<string, unknown>; key?: KeyObject } = {}) =>
  sealed(overrides.key ?? portalKey.privateKey, { ...contractHeader(), ...overrides.header }, { ...contractClaims(), ...overrides.claims });

/** Exactly what the portal sends: a bearer token and an image Accept header, no query string, no cookie, no national ID. */
const portalGet = (token: string | null) => GET(new Request('https://backoffice.test/api/portal/photo', {
  headers: { accept: 'image/jpeg, image/png, image/webp', ...(token === null ? {} : { authorization: `Bearer ${token}` }) }
}));

const fetched: string[] = [];
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeAll(() => {
  vi.stubEnv('PROVIDER_SSO_ISSUER', portal);
  vi.stubEnv('PROVIDER_SSO_CLIENT_ID', '');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetched.push(url);
    expect(init?.redirect).toBe('error');
    if (url === `${portal}/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [portalKey.jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('not found', { status: 404 });
  }));
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

beforeEach(() => {
  mocks.providerConfig.mockResolvedValue({ apiUrl: providerIssuer });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.enabled.mockReturnValue(true);
  mocks.findLink.mockImplementation(async (issuer: string, subject: string) => (issuer === providerIssuer && subject === 'account-7' ? { personId: 'person-9' } : null));
  mocks.isActivePerson.mockResolvedValue(true);
  mocks.photoAttachmentOf.mockResolvedValue('photo-9');
  mocks.open.mockImplementation(async ({ attachmentId }: { attachmentId: string }) => ({ attachment: { id: attachmentId, contentType: 'image/jpeg' }, bytes: photo }));
});
afterEach(() => vi.clearAllMocks());

const expectNoRedirect = (response: Response) => {
  expect(response.status < 300 || response.status >= 400).toBe(true);
  expect(response.headers.get('location')).toBeNull();
};

describe('portal photo contract: GET /api/portal/photo', () => {
  it('200: the photo of the บุคลากร linked to provider_iss + provider_sub, as image/jpeg|png|webp', async () => {
    const response = await portalGet(photoRequest());
    expectNoRedirect(response);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo);
    expect(mocks.findLink).toHaveBeenCalledWith(providerIssuer, 'account-7');
    expect(mocks.photoAttachmentOf).toHaveBeenCalledWith('person-9');
    expect(fetched).toContain(`${portal}/.well-known/jwks.json`);
  });

  it('200 for every content type the portal accepts', async () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      mocks.open.mockResolvedValueOnce({ attachment: { id: 'photo-9', contentType }, bytes: photo });
      const response = await portalGet(photoRequest());
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(contentType);
    }
  });

  it('never sends more than 2 MB', async () => {
    mocks.open.mockResolvedValueOnce({ attachment: { id: 'photo-9', contentType: 'image/png' }, bytes: new Uint8Array(2 * 1024 * 1024 + 1) });
    expect((await portalGet(photoRequest())).status).toBe(404);
  });

  it('404 when nobody is linked or the person has no photo', async () => {
    mocks.findLink.mockResolvedValue(null);
    const unlinked = await portalGet(photoRequest());
    expectNoRedirect(unlinked);
    expect(unlinked.status).toBe(404);
    mocks.findLink.mockResolvedValue({ personId: 'person-9' });
    mocks.photoAttachmentOf.mockResolvedValue(null);
    expect((await portalGet(photoRequest())).status).toBe(404);
  });

  it.each([
    ['no Authorization header', () => null],
    ['a token that is not a JWT', () => 'not-a-jwt'],
    ['typ of an ID token', () => photoRequest({ header: { typ: 'JWT' } })],
    ['no typ', () => photoRequest({ header: { typ: undefined } })],
    ['alg other than ES256', () => photoRequest({ header: { alg: 'HS256' } })],
    ['a kid not in the JWKS', () => photoRequest({ header: { kid: 'unknown-kid' } })],
    ['a signature from another key', () => photoRequest({ key: strangerKey.privateKey })],
    ['another issuer', () => photoRequest({ claims: { iss: 'https://elsewhere.test' } })],
    ['another audience', () => photoRequest({ claims: { aud: 'radius-server' } })],
    ['an expired token', () => photoRequest({ claims: { iat: now() - 400, exp: now() - 300 } })],
    ['a lifetime over 120 seconds', () => photoRequest({ claims: { exp: now() + 121 } })],
    ['no exp', () => photoRequest({ claims: { exp: undefined } })],
    ['no sub', () => photoRequest({ claims: { sub: undefined } })]
  ])('401 for %s', async (_case, token) => {
    const response = await portalGet(token());
    expectNoRedirect(response);
    expect(response.status).toBe(401);
    expect(mocks.findLink).not.toHaveBeenCalled();
  });

  it('accepts a lifetime of exactly 120 seconds and the 60 seconds the portal uses', async () => {
    expect((await portalGet(photoRequest({ claims: { exp: now() + 120 } }))).status).toBe(200);
    expect((await portalGet(photoRequest({ claims: { exp: now() + 60 } }))).status).toBe(200);
  });

  it('answers within three seconds even when the portal keys do not', async () => {
    const stalled = pair('rotated-key');
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => undefined)).mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const started = Date.now();
    const response = await portalGet(sealed(stalled.privateKey, { ...contractHeader(), kid: stalled.kid }, contractClaims()));
    expect(Date.now() - started).toBeLessThan(3_000);
    expectNoRedirect(response);
    expect([401, 503]).toContain(response.status);
  });
});
