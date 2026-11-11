import { randomBytes } from 'node:crypto';
import type { ExternalIdentity } from '@backoffice/contracts';

/** MOPH ID (health) and Provider ID (api) base URLs plus both clients; the redirect URI is registered on the MOPH ID client. */
export interface ProviderIdConfig {
  healthUrl: string;
  apiUrl: string;
  healthClientId: string;
  healthClientSecret: string;
  providerClientId: string;
  providerSecretKey: string;
  redirectUri: string;
}
export interface ProviderIdFlow { state: string }
/** `hashCid` is kept apart from the identity so it can only be used to match a บุคลากร, never stored with the link. */
export interface ProviderIdLogin { identity: ExternalIdentity; hashCid: string | null }

/** UNAVAILABLE: a service could not be reached or answered nonsense. INVALID: it refused the code, the token or the account. */
export class ProviderIdError extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'INVALID') { super(`PROVIDER_ID_${code}`); this.name = 'ProviderIdError'; }
}

const TIMEOUT_MS = 10_000;

/** Both services may wrap results as { status, message, data: {...} }. */
function unwrap(body: unknown): Record<string, unknown> {
  const outer = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!outer) throw new ProviderIdError('UNAVAILABLE');
  const inner = outer.data;
  return inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : outer;
}

function accessToken(body: Record<string, unknown>): string {
  if (typeof body.access_token !== 'string' || !body.access_token) throw new ProviderIdError('UNAVAILABLE');
  return body.access_token;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * เข้าสู่ระบบด้วย Provider ID straight against the ministry, as the radius-server portal does:
 * MOPH ID authorization code → MOPH ID token → Provider ID service token → Provider ID profile.
 * The identity carries only account_id and the Thai name; hash_cid rides beside it for matching and organizations are dropped.
 */
export class ProviderIdClient {
  constructor(private readonly config: ProviderIdConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Links are kept per issuer; the Provider ID base URL names the environment (prd or uat). */
  get issuer(): string { return this.config.apiUrl; }

  begin(): { flow: ProviderIdFlow; url: URL } {
    const flow = { state: randomBytes(32).toString('base64url') };
    const url = new URL('/oauth/redirect', this.config.healthUrl);
    url.search = new URLSearchParams({ client_id: this.config.healthClientId, redirect_uri: this.config.redirectUri, response_type: 'code', state: flow.state }).toString();
    return { flow, url };
  }

  async complete(code: string): Promise<ProviderIdLogin> {
    const health = await this.request(`${this.config.healthUrl}/api/v1/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri, client_id: this.config.healthClientId, client_secret: this.config.healthClientSecret }).toString()
    });
    const service = await this.request(`${this.config.apiUrl}/api/v1/services/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: this.config.providerClientId, secret_key: this.config.providerSecretKey, token_by: 'Health ID', token: accessToken(health) })
    });
    const profile = await this.request(`${this.config.apiUrl}/api/v1/services/profile`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken(service)}`, 'client-id': this.config.providerClientId, 'secret-key': this.config.providerSecretKey }
    });
    const subject = text(profile.account_id);
    if (!subject || subject.length > 255) throw new ProviderIdError('INVALID');
    const name = [text(profile.firstname_th), text(profile.lastname_th)].filter(Boolean).join(' ');
    const hash = typeof profile.hash_cid === 'string' ? profile.hash_cid.trim().toLowerCase() : '';
    return { identity: { issuer: this.config.apiUrl, subject, displayName: name ? name.slice(0, 255) : null }, hashCid: /^[0-9a-f]{64}$/.test(hash) ? hash : null };
  }

  /** A 4xx is the person's code, token or account being refused; anything else that is not a JSON success is the service being unavailable. */
  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch { throw new ProviderIdError('UNAVAILABLE'); }
    if (response.status >= 400 && response.status < 500) throw new ProviderIdError('INVALID');
    if (!response.ok) throw new ProviderIdError('UNAVAILABLE');
    let body: unknown;
    try { body = await response.json(); } catch { throw new ProviderIdError('UNAVAILABLE'); }
    return unwrap(body);
  }
}
