import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AuditService, DatabaseAuditRepository, DatabaseExternalIdentityRepository, ExternalLoginService, NationalIdHashMatcher, PortalOidcClient, ProviderIdClient, type ProviderIdConfig, type ProviderIdFlow } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getNationalIdProtector } from './national-id';
import { readRuntimeValue } from './runtime-env';

export const providerFlowCookie = 'backoffice_provider_flow';
export const providerTicketCookie = 'backoffice_provider_ticket';
export const providerFlowPath = '/api/auth/provider';
export const providerCookieSeconds = 600;

/** MOPH ID and Provider ID base URLs per environment, as in the radius-server portal. */
const environments: Record<string, { healthUrl: string; apiUrl: string }> = {
  prd: { healthUrl: 'https://moph.id.th', apiUrl: 'https://provider.id.th' },
  uat: { healthUrl: 'https://uat-moph.id.th', apiUrl: 'https://uat-provider.id.th' }
};

function absoluteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value.replace(/\/$/, '') : null;
  } catch { return null; }
}

/** เข้าสู่ระบบด้วย Provider ID is on only when both clients, both secrets and the redirect URI are set. */
export function providerSsoConfig(): ProviderIdConfig | null {
  let healthClientSecret: string | undefined;
  let providerSecretKey: string | undefined;
  try {
    healthClientSecret = readRuntimeValue('PROVIDER_ID_HEALTH_CLIENT_SECRET');
    providerSecretKey = readRuntimeValue('PROVIDER_ID_SECRET_KEY');
  } catch { return null; }
  const environment = environments[readRuntimeValue('PROVIDER_ID_ENV') || 'prd'];
  if (!environment) return null;
  const healthUrl = readRuntimeValue('PROVIDER_ID_HEALTH_URL') ? absoluteUrl(readRuntimeValue('PROVIDER_ID_HEALTH_URL')) : environment.healthUrl;
  const apiUrl = readRuntimeValue('PROVIDER_ID_API_URL') ? absoluteUrl(readRuntimeValue('PROVIDER_ID_API_URL')) : environment.apiUrl;
  const redirectUri = absoluteUrl(readRuntimeValue('PROVIDER_ID_REDIRECT_URI'));
  const healthClientId = readRuntimeValue('PROVIDER_ID_HEALTH_CLIENT_ID');
  const providerClientId = readRuntimeValue('PROVIDER_ID_CLIENT_ID');
  if (!healthUrl || !apiUrl || !redirectUri || !healthClientId || !providerClientId || !healthClientSecret || !providerSecretKey) return null;
  return { healthUrl, apiUrl, healthClientId, healthClientSecret, providerClientId, providerSecretKey, redirectUri };
}

export const providerSsoEnabled = (): boolean => providerSsoConfig() !== null;

export const providerIdClient = (config: ProviderIdConfig): ProviderIdClient => new ProviderIdClient(config);

/** What BackOffice needs to check a request the radius-server portal signed: the portal issuer (for its JWKS) and the audience it signs for. */
export interface PortalRequestConfig { issuer: string; clientId: string }

/**
 * The radius-server portal, kept only for its server-to-server photo requests (/api/portal/photo). Sign-in no longer goes through the
 * portal, so neither the portal client secret nor its redirect URI is needed.
 */
export function portalSsoConfig(): PortalRequestConfig | null {
  const issuer = absoluteUrl(readRuntimeValue('PROVIDER_SSO_ISSUER'));
  const clientId = readRuntimeValue('PROVIDER_SSO_CLIENT_ID');
  if (!issuer || !clientId) return null;
  return { issuer, clientId };
}

let cachedPortalClient: { key: string; client: PortalOidcClient } | undefined;

/** One client per configuration so its JWKS cache lives across requests. Only `verifyPortalRequest` is used, so no secret is passed. */
export function portalOidcClient(config: PortalRequestConfig): PortalOidcClient {
  const key = JSON.stringify(config);
  if (cachedPortalClient?.key !== key) cachedPortalClient = { key, client: new PortalOidcClient({ ...config, clientSecret: '', redirectUri: '' }) };
  return cachedPortalClient.client;
}

const cookieKey = (secret: string) => createHash('sha256').update(`backoffice-provider-flow:${secret}`).digest();

/** The state rides in an encrypted, ten-minute cookie so nothing about the flow is stored server side. */
export function sealFlow(flow: ProviderIdFlow, secret: string, now: Date = new Date()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...flow, expiresAt: now.getTime() + providerCookieSeconds * 1000 }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openFlow(value: string | undefined, secret: string, now: Date = new Date()): ProviderIdFlow | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as ProviderIdFlow & { expiresAt: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < now.getTime()) return null;
    if (typeof parsed.state !== 'string' || !parsed.state) return null;
    return { state: parsed.state };
  } catch { return null; }
}

export function externalLoginService(database: Database, issuer: string): ExternalLoginService {
  const repository = new DatabaseExternalIdentityRepository(database);
  const audit = new AuditService(new DatabaseAuditRepository(database));
  const protector = getNationalIdProtector();
  const matcher = protector ? new NationalIdHashMatcher(database, protector) : null;
  return new ExternalLoginService({ repository, isActivePerson: (personId) => repository.isActivePerson(personId), audit, issuer,
    findPersonByNationalIdHash: matcher ? (hashCid) => matcher.findActivePerson(hashCid) : undefined });
}

export function providerCookieOptions(path: string) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path, maxAge: providerCookieSeconds };
}
