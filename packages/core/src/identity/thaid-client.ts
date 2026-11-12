import type { ThaidSettings } from './sign-in-settings-service.ts';

/** UNAVAILABLE: DOPA could not be reached or answered nonsense. INVALID: it refused the code, or its answer cannot be trusted. */
export class ThaidError extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'INVALID') { super(`THAID_${code}`); this.name = 'ThaidError'; }
}

const TIMEOUT_MS = 10_000;
const AUTHORIZE_PATH = '/api/v2/oauth2/auth/';
const TOKEN_PATH = '/api/v2/oauth2/token/';
/** Only the citizen ID: BackOffice needs nothing else from ThaID to find the บุคลากร. */
const SCOPE = 'pid';

/** A Thai citizen ID: 13 ASCII digits whose last digit is the mod-11 check digit. */
export function validCitizenId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{13}$/.test(value)) return false;
  const total = [...value.slice(0, 12)].reduce((sum, digit, index) => sum + Number(digit) * (13 - index), 0);
  return (11 - (total % 11)) % 10 === Number(value[12]);
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as unknown;
    if (claims && typeof claims === 'object' && !Array.isArray(claims)) return claims as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new ThaidError('INVALID');
}

/**
 * เข้าสู่ระบบด้วย ThaID (DOPA), as the radius-server portal does (portal/thaid/client.py). The citizen ID comes from the token
 * response BackOffice fetched itself over TLS with its client secret (OIDC Core 3.1.3.7 step 6); an ID token beside it must be
 * issued to this client and agree on the pid. The citizen ID is returned to the caller only, never logged or put in an error.
 */
export class ThaidClient {
  constructor(private readonly settings: ThaidSettings, private readonly fetchImpl: typeof fetch = fetch) {}

  authorizeUrl(state: string): string {
    const query = new URLSearchParams({ response_type: 'code', client_id: this.settings.clientId, redirect_uri: this.settings.redirectUri, scope: SCOPE, state });
    return `${this.settings.apiUrl}${AUTHORIZE_PATH}?${query}`;
  }

  async citizenIdForCode(code: string): Promise<string> {
    const credentials = Buffer.from(`${this.settings.clientId}:${this.settings.clientSecret}`, 'utf8').toString('base64');
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.settings.apiUrl}${TOKEN_PATH}`, {
        method: 'POST',
        headers: { authorization: `Basic ${credentials}`, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.settings.redirectUri }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch { throw new ThaidError('UNAVAILABLE'); }
    if (response.status >= 400 && response.status < 500) throw new ThaidError('INVALID');
    if (!response.ok) throw new ThaidError('UNAVAILABLE');
    let body: unknown;
    try { body = await response.json(); } catch { throw new ThaidError('UNAVAILABLE'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ThaidError('UNAVAILABLE');
    return this.citizenId(body as Record<string, unknown>);
  }

  private citizenId(body: Record<string, unknown>): string {
    let pid = body.pid;
    if (typeof body.id_token === 'string' && body.id_token) {
      const claims = jwtClaims(body.id_token);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(this.settings.clientId)) throw new ThaidError('INVALID');
      if (pid === undefined) pid = claims.pid;
      else if (claims.pid !== undefined && claims.pid !== pid) throw new ThaidError('INVALID');
    } else if (body.id_token !== undefined && body.id_token !== null) {
      throw new ThaidError('INVALID');
    }
    if (!validCitizenId(pid)) throw new ThaidError('INVALID');
    return pid;
  }
}
