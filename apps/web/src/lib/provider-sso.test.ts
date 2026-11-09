import { afterEach, describe, expect, it } from 'vitest';
import { openFlow, providerSsoConfig, providerSsoEnabled, sealFlow } from './provider-sso';

const env = { PROVIDER_SSO_ISSUER: 'https://portal.test', PROVIDER_SSO_CLIENT_ID: 'backoffice', PROVIDER_SSO_CLIENT_SECRET: 'secret-value-that-is-long-enough-0123', PROVIDER_SSO_REDIRECT_URI: 'https://backoffice.test/api/auth/provider/callback' };
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('provider SSO configuration', () => {
  it('is disabled until all four values are set', () => {
    for (const key of Object.keys(env)) delete process.env[key];
    expect(providerSsoConfig()).toBeNull();
    Object.assign(process.env, { ...env, PROVIDER_SSO_CLIENT_ID: '' });
    expect(providerSsoEnabled()).toBe(false);
    Object.assign(process.env, env);
    expect(providerSsoConfig()).toEqual({ issuer: 'https://portal.test', clientId: 'backoffice', clientSecret: env.PROVIDER_SSO_CLIENT_SECRET, redirectUri: env.PROVIDER_SSO_REDIRECT_URI });
  });

  it('ignores an issuer or redirect URI that is not an absolute URL', () => {
    Object.assign(process.env, { ...env, PROVIDER_SSO_ISSUER: 'portal.test' });
    expect(providerSsoConfig()).toBeNull();
  });
});

describe('flow cookie', () => {
  const secret = env.PROVIDER_SSO_CLIENT_SECRET;
  const flow = { state: 'state-x', nonce: 'nonce-x', verifier: 'verifier-secret-123' };
  const now = new Date('2026-11-09T06:00:00Z');

  it('round-trips and hides the verifier', () => {
    const sealed = sealFlow(flow, secret, now);
    expect(sealed).not.toContain('verifier-secret-123');
    expect(Buffer.from(sealed, 'base64url').toString('latin1')).not.toContain('verifier-secret-123');
    expect(openFlow(sealed, secret, now)).toEqual(flow);
  });

  it('refuses a tampered, foreign-key or ten-minute-old cookie', () => {
    const sealed = sealFlow(flow, secret, now);
    expect(openFlow(`${sealed.slice(0, -2)}AA`, secret, now)).toBeNull();
    expect(openFlow(sealed, 'another-secret-value-long-enough-012345', now)).toBeNull();
    expect(openFlow(sealed, secret, new Date(now.getTime() + 10 * 60_000 + 1))).toBeNull();
    expect(openFlow('garbage', secret, now)).toBeNull();
    expect(openFlow(undefined, secret, now)).toBeNull();
  });
});
