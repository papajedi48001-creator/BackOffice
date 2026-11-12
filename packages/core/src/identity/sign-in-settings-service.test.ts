import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@backoffice/db';
import { ConnectionSecretBox } from '../holidays/connection-secret-box.ts';
import { SignInSettingsService } from './sign-in-settings-service.ts';

const box = new ConnectionSecretBox('cd'.repeat(32));
const thaidRedirect = 'https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback';
const providerRedirect = 'https://office-waritch-hosp.moph.go.th/api/auth/provider/callback';

function store() {
  const rows = new Map<string, Record<string, unknown>>();
  const executed: string[] = [];
  const database: Database = {
    execute: async (sql, parameters = []) => {
      executed.push(`${sql}|${JSON.stringify(parameters)}`);
      if (sql.startsWith('INSERT INTO sign_in_setting')) {
        const [method, enabled, settingsJson, secretCiphertext] = parameters as unknown[];
        rows.set(String(method), { method, enabled, settingsJson, secretCiphertext });
      }
    },
    query: async <T extends object>(sql: string) => (sql.includes('FROM sign_in_setting') ? [...rows.values()] : []) as T[],
    transaction: async (work) => work(database),
    close: async () => undefined
  };
  return { database, executed, rows };
}

const providerEnv: Record<string, string> = {
  PROVIDER_ID_HEALTH_CLIENT_ID: 'env-health', PROVIDER_ID_CLIENT_ID: 'env-provider', PROVIDER_ID_REDIRECT_URI: providerRedirect,
  PROVIDER_ID_HEALTH_CLIENT_SECRET: 'env-health-secret', PROVIDER_ID_SECRET_KEY: 'env-provider-secret'
};
const envOf = (values: Record<string, string>) => (name: string) => values[name];
const thaidInput = (secret: string, enabled = true) => ({ enabled, values: { clientId: 'thaid-client', redirectUri: thaidRedirect }, secrets: { clientSecret: secret } });

describe('SignInSettingsService', () => {
  it('reads Provider ID from the environment when nothing is saved, as before', async () => {
    const service = new SignInSettingsService(store().database, box, envOf(providerEnv));
    expect(await service.providerId()).toEqual({ healthUrl: 'https://moph.id.th', apiUrl: 'https://provider.id.th', healthClientId: 'env-health', healthClientSecret: 'env-health-secret',
      providerClientId: 'env-provider', providerSecretKey: 'env-provider-secret', redirectUri: providerRedirect });
    expect(await service.view()).toMatchObject({ providerId: { source: 'ENV', ready: true, enabled: true }, thaid: { source: 'NONE', ready: false } });
  });

  it('saves ThaID with the secret sealed, never shows it, and audits field names only', async () => {
    const { database, executed } = store();
    const service = new SignInSettingsService(database, box, envOf({}));
    expect(await service.save('THAID', thaidInput('thaid-topsecret'), 'admin-1')).toEqual({ ok: true });
    expect(executed.join('\n')).not.toContain('thaid-topsecret');
    expect(executed.some((sql) => sql.includes('admin.sign_in_setting.update') || sql.includes('"changedFields"'))).toBe(true);
    expect(await service.thaid()).toEqual({ clientId: 'thaid-client', clientSecret: 'thaid-topsecret', redirectUri: thaidRedirect, apiUrl: 'https://imauth.bora.dopa.go.th' });
    const view = await service.view();
    expect(JSON.stringify(view)).not.toContain('thaid-topsecret');
    expect(view.thaid).toMatchObject({ source: 'SETTINGS', ready: true, values: { clientId: 'thaid-client', redirectUri: thaidRedirect }, secretsSet: { clientSecret: true } });
  });

  it('keeps the stored secret when the field is left blank', async () => {
    const service = new SignInSettingsService(store().database, box, envOf({}));
    await service.save('THAID', thaidInput('first-secret'), 'admin-1');
    await service.save('THAID', { ...thaidInput(''), values: { clientId: 'thaid-client-2', redirectUri: thaidRedirect } }, 'admin-1');
    expect(await service.thaid()).toMatchObject({ clientId: 'thaid-client-2', clientSecret: 'first-secret' });
  });

  it('a saved Provider ID row wins over the environment, and a blank secret falls back to the server value', async () => {
    const service = new SignInSettingsService(store().database, box, envOf(providerEnv));
    await service.save('PROVIDER_ID', { enabled: true, values: { environment: 'uat', healthClientId: 'web-health', providerClientId: 'web-provider', redirectUri: providerRedirect }, secrets: { healthClientSecret: '', providerSecretKey: 'web-provider-secret' } }, 'admin-1');
    expect(await service.providerId()).toMatchObject({ healthUrl: 'https://uat-moph.id.th', apiUrl: 'https://uat-provider.id.th', healthClientId: 'web-health', healthClientSecret: 'env-health-secret', providerSecretKey: 'web-provider-secret' });
    expect((await service.view()).providerId).toMatchObject({ source: 'SETTINGS', ready: true });
  });

  it('is not ready when a secret is blank with nothing stored and nothing on the server', async () => {
    const service = new SignInSettingsService(store().database, box, envOf(providerEnv));
    await service.save('THAID', thaidInput(''), 'admin-1');
    expect(await service.thaid()).toBeNull();
    expect((await service.view()).thaid).toMatchObject({ ready: false, secretsSet: { clientSecret: false } });
  });

  it('a switched-off route is not ready', async () => {
    const service = new SignInSettingsService(store().database, box, envOf(providerEnv));
    await service.save('THAID', thaidInput('s', false), 'admin-1');
    expect(await service.thaid()).toBeNull();
  });

  it('refuses a secret without CONNECTION_SECRET_KEY, and a redirect URI that is not https or not the callback', async () => {
    expect(await new SignInSettingsService(store().database, null, envOf({})).save('THAID', thaidInput('s'), 'a')).toEqual({ ok: false, code: 'NO_SECRET_KEY' });
    const service = new SignInSettingsService(store().database, box, envOf({}));
    expect(await service.save('THAID', { ...thaidInput('s'), values: { clientId: 'c', redirectUri: 'http://office-waritch-hosp.moph.go.th/api/auth/thaid/callback' } }, 'a')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await service.save('THAID', { ...thaidInput('s'), values: { clientId: 'c', redirectUri: providerRedirect } }, 'a')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await service.save('PROVIDER_ID', { enabled: true, values: { environment: 'dev', healthClientId: 'h', providerClientId: 'p', redirectUri: providerRedirect }, secrets: {} }, 'a')).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('refuses to switch off the last ready route, so nobody is locked out', async () => {
    const service = new SignInSettingsService(store().database, box, envOf(providerEnv));
    expect(await service.save('PROVIDER_ID', { enabled: false, values: { environment: 'prd', healthClientId: 'env-health', providerClientId: 'env-provider', redirectUri: providerRedirect }, secrets: {} }, 'a')).toEqual({ ok: false, code: 'LAST_SIGN_IN_ROUTE' });
    await service.save('THAID', thaidInput('s'), 'a');
    expect(await service.save('PROVIDER_ID', { enabled: false, values: { environment: 'prd', healthClientId: 'env-health', providerClientId: 'env-provider', redirectUri: providerRedirect }, secrets: {} }, 'a')).toEqual({ ok: true });
    expect(await service.providerId()).toBeNull();
  });
});

describe('SignInSettingsService.routes', () => {
  it('gives both routes from one read', async () => {
    const { database } = store();
    const query = vi.spyOn(database, 'query');
    const routes = await new SignInSettingsService(database, box, envOf(providerEnv)).routes();
    expect(routes.thaid).toBeNull();
    expect(routes.providerId).toMatchObject({ healthClientId: 'env-health' });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('SignInSettingsService when saved secrets cannot be opened', () => {
  it('says the route was set up on the web (so password sign-in stays closed) and that its secrets are unreadable', async () => {
    const { database } = store();
    await new SignInSettingsService(database, box, envOf({})).save('THAID', thaidInput('s'), 'a');
    const rotated = new SignInSettingsService(database, new ConnectionSecretBox('ef'.repeat(32)), envOf({}));
    const routes = await rotated.routes();
    expect(routes.thaid).toBeNull();
    expect(routes.configured).toBe(true);
    expect((await rotated.view()).thaid).toMatchObject({ ready: false, secretsUnreadable: true });
    const withoutKey = new SignInSettingsService(database, null, envOf({}));
    expect((await withoutKey.routes()).configured).toBe(true);
    expect((await withoutKey.view()).thaid).toMatchObject({ secretsUnreadable: true });
  });

  it('nothing saved and nothing enabled on the web is not configured', async () => {
    expect((await new SignInSettingsService(store().database, box, envOf({})).routes()).configured).toBe(false);
  });

  it('a corrupt settings row reads as empty instead of failing the admin page', async () => {
    const { database, rows } = store();
    rows.set('THAID', { method: 'THAID', enabled: 1, settingsJson: '{not json', secretCiphertext: null });
    await expect(new SignInSettingsService(database, box, envOf({})).view()).resolves.toMatchObject({ thaid: { source: 'SETTINGS', ready: false } });
  });
});
