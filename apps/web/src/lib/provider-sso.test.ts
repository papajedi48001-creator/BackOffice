import { afterEach, describe, expect, it } from 'vitest';
import { openFlow, portalSsoConfig, providerSsoConfig, providerSsoEnabled, sealFlow } from './provider-sso';
import { clearSignInRoutesCache } from './sign-in-settings';

const env = {
  PROVIDER_ID_HEALTH_CLIENT_ID: 'health-client', PROVIDER_ID_HEALTH_CLIENT_SECRET: 'health-secret-value-long-enough-0123',
  PROVIDER_ID_CLIENT_ID: 'provider-client', PROVIDER_ID_SECRET_KEY: 'provider-secret-key',
  PROVIDER_ID_REDIRECT_URI: 'https://backoffice.test/api/auth/provider/callback'
};
const keys = [...Object.keys(env), 'PROVIDER_ID_ENV', 'PROVIDER_ID_HEALTH_URL', 'PROVIDER_ID_API_URL', 'PROVIDER_SSO_ISSUER', 'PROVIDER_SSO_CLIENT_ID', 'PROVIDER_SSO_CLIENT_SECRET', 'PROVIDER_SSO_REDIRECT_URI'];
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });
const set = (values: Record<string, string>) => { for (const key of keys) delete process.env[key]; Object.assign(process.env, values); clearSignInRoutesCache(); };

describe('Provider ID configuration', async () => {
  it('is disabled until the two clients and the redirect URI are set', async () => {
    set({});
    expect(await providerSsoConfig()).toBeNull();
    set({ ...env, PROVIDER_ID_SECRET_KEY: '' });
    expect(await providerSsoEnabled()).toBe(false);
    set(env);
    expect(await providerSsoConfig()).toEqual({
      healthUrl: 'https://moph.id.th', apiUrl: 'https://provider.id.th',
      healthClientId: 'health-client', healthClientSecret: env.PROVIDER_ID_HEALTH_CLIENT_SECRET,
      providerClientId: 'provider-client', providerSecretKey: 'provider-secret-key', redirectUri: env.PROVIDER_ID_REDIRECT_URI
    });
  });

  it('uses the UAT services only when asked and refuses another environment', async () => {
    set({ ...env, PROVIDER_ID_ENV: 'uat' });
    expect(await providerSsoConfig()).toMatchObject({ healthUrl: 'https://uat-moph.id.th', apiUrl: 'https://uat-provider.id.th' });
    set({ ...env, PROVIDER_ID_ENV: 'staging' });
    expect(await providerSsoConfig()).toBeNull();
  });

  it('takes base-URL overrides for a stub and ignores a redirect URI that is not absolute', async () => {
    set({ ...env, PROVIDER_ID_HEALTH_URL: 'http://127.0.0.1:4010/', PROVIDER_ID_API_URL: 'http://127.0.0.1:4010' });
    expect(await providerSsoConfig()).toMatchObject({ healthUrl: 'http://127.0.0.1:4010', apiUrl: 'http://127.0.0.1:4010' });
    set({ ...env, PROVIDER_ID_REDIRECT_URI: 'backoffice.test/callback' });
    expect(await providerSsoConfig()).toBeNull();
  });
});

describe('portal photo request configuration', () => {
  it('needs only the portal issuer and the client id the portal signs for, never a portal secret', () => {
    set({});
    expect(portalSsoConfig()).toBeNull();
    set({ PROVIDER_SSO_ISSUER: 'https://aut-waritch-hosp.moph.go.th/' });
    expect(portalSsoConfig()).toBeNull();
    set({ PROVIDER_SSO_ISSUER: 'https://aut-waritch-hosp.moph.go.th/', PROVIDER_SSO_CLIENT_ID: 'backoffice' });
    expect(portalSsoConfig()).toEqual({ issuer: 'https://aut-waritch-hosp.moph.go.th', clientId: 'backoffice' });
    set({ PROVIDER_SSO_ISSUER: 'aut-waritch-hosp', PROVIDER_SSO_CLIENT_ID: 'backoffice' });
    expect(portalSsoConfig()).toBeNull();
  });
});

describe('flow cookie', () => {
  const secret = env.PROVIDER_ID_HEALTH_CLIENT_SECRET;
  const flow = { state: 'state-secret-123' };
  const now = new Date('2026-11-09T06:00:00Z');

  it('round-trips and hides the state', () => {
    const sealed = sealFlow(flow, secret, now);
    expect(Buffer.from(sealed, 'base64url').toString('latin1')).not.toContain('state-secret-123');
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
