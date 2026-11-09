import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AuditService, DatabaseAuditRepository, DatabaseExternalIdentityRepository, DatabaseLocalAccountRepository, DatabaseLoginThrottle, ExternalLoginService, LocalAuthService, PortalOidcClient, type OidcClientConfig, type OidcFlow } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { readRuntimeValue } from './runtime-env';

export const providerFlowCookie = 'backoffice_provider_flow';
export const providerTicketCookie = 'backoffice_provider_ticket';
export const providerFlowPath = '/api/auth/provider';
export const providerCookieSeconds = 600;

function absoluteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value.replace(/\/$/, '') : null;
  } catch { return null; }
}

/** เข้าสู่ระบบด้วย Provider ID is on only when the portal issuer, client ID, secret and redirect URI are all set. */
export function providerSsoConfig(): OidcClientConfig | null {
  let clientSecret: string | undefined;
  try { clientSecret = readRuntimeValue('PROVIDER_SSO_CLIENT_SECRET'); } catch { return null; }
  const issuer = absoluteUrl(readRuntimeValue('PROVIDER_SSO_ISSUER'));
  const redirectUri = absoluteUrl(readRuntimeValue('PROVIDER_SSO_REDIRECT_URI'));
  const clientId = readRuntimeValue('PROVIDER_SSO_CLIENT_ID');
  if (!issuer || !redirectUri || !clientId || !clientSecret) return null;
  return { issuer, clientId, clientSecret, redirectUri };
}

export const providerSsoEnabled = (): boolean => providerSsoConfig() !== null;

let cachedClient: { key: string; client: PortalOidcClient } | undefined;

/** One client per configuration so its JWKS cache lives across requests. */
export function portalOidcClient(config: OidcClientConfig): PortalOidcClient {
  const key = JSON.stringify(config);
  if (cachedClient?.key !== key) cachedClient = { key, client: new PortalOidcClient(config) };
  return cachedClient.client;
}

const cookieKey = (secret: string) => createHash('sha256').update(`backoffice-provider-flow:${secret}`).digest();

/** The state, nonce and PKCE verifier ride in an encrypted, ten-minute cookie so nothing about the flow is stored server side or put in a URL. */
export function sealFlow(flow: OidcFlow, secret: string, now: Date = new Date()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...flow, expiresAt: now.getTime() + providerCookieSeconds * 1000 }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openFlow(value: string | undefined, secret: string, now: Date = new Date()): OidcFlow | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as OidcFlow & { expiresAt: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < now.getTime()) return null;
    if (typeof parsed.state !== 'string' || typeof parsed.nonce !== 'string' || typeof parsed.verifier !== 'string') return null;
    return { state: parsed.state, nonce: parsed.nonce, verifier: parsed.verifier };
  } catch { return null; }
}

export function externalLoginService(database: Database, issuer: string): ExternalLoginService {
  const repository = new DatabaseExternalIdentityRepository(database);
  const audit = new AuditService(new DatabaseAuditRepository(database));
  const localAuth = new LocalAuthService(new DatabaseLocalAccountRepository(database), { throttle: new DatabaseLoginThrottle(database), audit });
  return new ExternalLoginService({ repository, localAuth, isActivePerson: (personId) => repository.isActivePerson(personId), audit, issuer });
}

export function providerCookieOptions(path: string) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path, maxAge: providerCookieSeconds };
}
