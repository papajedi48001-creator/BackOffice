import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto';
import type { ExternalIdentity } from '@backoffice/contracts';

export interface OidcClientConfig { issuer: string; clientId: string; clientSecret: string; redirectUri: string }
export interface OidcFlow { state: string; nonce: string; verifier: string }

/** UNAVAILABLE: the portal could not be reached or answered nonsense. INVALID: the answer was refused (bad code, token or signature). */
export class OidcError extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'INVALID') { super(`OIDC_${code}`); this.name = 'OidcError'; }
}

const TIMEOUT_MS = 10_000;
const JWKS_TTL_MS = 10 * 60_000;
const SKEW_SECONDS = 60;
type Jwk = JsonWebKey & { kid?: string; alg?: string };

const random = () => randomBytes(32).toString('base64url');
const decodeJson = (part: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OidcError('INVALID');
  return value as Record<string, unknown>;
};

/** The BackOffice side of the portal's OpenID Connect provider: authorization code + PKCE, ES256 ID tokens checked with node:crypto. */
export class PortalOidcClient {
  private jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

  constructor(private readonly config: OidcClientConfig, private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => Date = () => new Date()) {}

  begin(): { flow: OidcFlow; url: URL } {
    const flow = { state: random(), nonce: random(), verifier: random() + random() };
    const url = new URL('/oidc/authorize', this.config.issuer);
    url.search = new URLSearchParams({
      client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: 'openid',
      state: flow.state, nonce: flow.nonce, code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256'
    }).toString();
    return { flow, url };
  }

  async complete(code: string, flow: OidcFlow): Promise<ExternalIdentity> {
    const body = await this.requestJson(`${this.config.issuer}/oidc/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: flow.verifier, redirect_uri: this.config.redirectUri }).toString()
    }, true);
    if (typeof body.id_token !== 'string') throw new OidcError('INVALID');
    const claims = await this.verifyIdToken(body.id_token);
    const seconds = Math.floor(this.now().getTime() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== this.config.issuer || !audience.includes(this.config.clientId) || claims.nonce !== flow.nonce) throw new OidcError('INVALID');
    if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < seconds || typeof claims.iat !== 'number' || claims.iat - SKEW_SECONDS > seconds) throw new OidcError('INVALID');
    if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 255) throw new OidcError('INVALID');
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 255) : null;
    return { issuer: this.config.issuer, subject: claims.sub, displayName: name };
  }

  private async verifyIdToken(idToken: string): Promise<Record<string, unknown>> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new OidcError('INVALID');
    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    try { header = decodeJson(parts[0]!); claims = decodeJson(parts[1]!); } catch { throw new OidcError('INVALID'); }
    if (header.alg !== 'ES256' || typeof header.kid !== 'string') throw new OidcError('INVALID');
    let key = (await this.keys(false)).find((candidate) => candidate.kid === header.kid);
    if (!key) key = (await this.keys(true)).find((candidate) => candidate.kid === header.kid);
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256') throw new OidcError('INVALID');
    const signature = Buffer.from(parts[2]!, 'base64url');
    let valid = false;
    try {
      valid = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, signature);
    } catch { valid = false; }
    if (!valid) throw new OidcError('INVALID');
    return claims;
  }

  private async keys(refresh: boolean): Promise<Jwk[]> {
    const nowMs = this.now().getTime();
    if (!refresh && this.jwksCache && nowMs - this.jwksCache.fetchedAt < JWKS_TTL_MS) return this.jwksCache.keys;
    const body = await this.requestJson(`${this.config.issuer}/oidc/jwks`, { method: 'GET' }, false);
    if (!Array.isArray(body.keys)) throw new OidcError('UNAVAILABLE');
    this.jwksCache = { keys: body.keys as Jwk[], fetchedAt: nowMs };
    return this.jwksCache.keys;
  }

  /** `grantErrors`: a 400 invalid_grant is the user's code being refused, not the portal being down. */
  private async requestJson(url: string, init: RequestInit, grantErrors: boolean): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch { throw new OidcError('UNAVAILABLE'); }
    let body: Record<string, unknown>;
    try { body = (await response.json()) as Record<string, unknown>; } catch { throw new OidcError('UNAVAILABLE'); }
    if (!body || typeof body !== 'object') throw new OidcError('UNAVAILABLE');
    if (!response.ok) throw new OidcError(grantErrors && response.status === 400 && body.error === 'invalid_grant' ? 'INVALID' : 'UNAVAILABLE');
    return body;
  }
}
