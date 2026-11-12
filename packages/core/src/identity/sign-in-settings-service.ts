import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service.ts';
import { DatabaseAuditRepository } from '../audit/database-audit-repository.ts';
import type { ConnectionSecretBox } from '../holidays/connection-secret-box.ts';
import type { ProviderIdConfig } from './provider-id-client.ts';

export type SignInMethod = 'THAID' | 'PROVIDER_ID';
/** What signing in with ThaID (DOPA) needs. Only server code holds the secret. */
export interface ThaidSettings { clientId: string; clientSecret: string; redirectUri: string; apiUrl: string }
export interface SignInMethodView {
  enabled: boolean;
  ready: boolean;
  source: 'SETTINGS' | 'ENV' | 'NONE';
  /** Non-secret values only. */
  values: Record<string, string>;
  /** Whether each secret is set; never the secret itself. */
  secretsSet: Record<string, boolean>;
}
export interface SignInSettingsView { thaid: SignInMethodView; providerId: SignInMethodView; canStoreSecrets: boolean }
export interface SignInSettingInput { enabled: boolean; values: Record<string, string>; secrets: Record<string, string> }
export type SignInSettingSaveResult = { ok: true } | { ok: false; code: 'INVALID_INPUT' | 'NO_SECRET_KEY' | 'LAST_SIGN_IN_ROUTE' };

interface MethodSpec {
  values: readonly string[];
  secrets: readonly string[];
  callbackPath: string;
  /** Environment variable behind each field, the fallback when nothing is saved or a saved field is blank. */
  env: Record<string, string>;
}

const specs: Record<SignInMethod, MethodSpec> = {
  THAID: { values: ['clientId', 'redirectUri'], secrets: ['clientSecret'], callbackPath: '/api/auth/thaid/callback',
    env: { clientId: 'THAID_CLIENT_ID', redirectUri: 'THAID_REDIRECT_URI', clientSecret: 'THAID_CLIENT_SECRET' } },
  PROVIDER_ID: { values: ['environment', 'healthClientId', 'providerClientId', 'redirectUri'], secrets: ['healthClientSecret', 'providerSecretKey'], callbackPath: '/api/auth/provider/callback',
    env: { environment: 'PROVIDER_ID_ENV', healthClientId: 'PROVIDER_ID_HEALTH_CLIENT_ID', providerClientId: 'PROVIDER_ID_CLIENT_ID', redirectUri: 'PROVIDER_ID_REDIRECT_URI',
      healthClientSecret: 'PROVIDER_ID_HEALTH_CLIENT_SECRET', providerSecretKey: 'PROVIDER_ID_SECRET_KEY' } }
};

/** MOPH ID and Provider ID base URLs per environment, as in the radius-server portal. */
const providerEnvironments: Record<string, { healthUrl: string; apiUrl: string }> = {
  prd: { healthUrl: 'https://moph.id.th', apiUrl: 'https://provider.id.th' },
  uat: { healthUrl: 'https://uat-moph.id.th', apiUrl: 'https://uat-provider.id.th' }
};
export const THAID_API_URL = 'https://imauth.bora.dopa.go.th';

type Row = { method: string; enabled: number | boolean; settingsJson: string; secretCiphertext: string | null };
interface Effective { enabled: boolean; source: SignInMethodView['source']; fields: Record<string, string>; stored: { values: Record<string, string>; secrets: Record<string, string> } }

const clientIdPattern = /^[A-Za-z0-9._~:-]{1,128}$/;

function baseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value.replace(/\/$/, '') : null;
  } catch { return null; }
}

/** https, or http only for a local stub; and it must be this route's own callback. */
function validRedirectUri(value: string, callbackPath: string): boolean {
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && url.pathname === callbackPath && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

/**
 * ผู้ดูแลระบบ > การเข้าสู่ระบบ: ThaID and Provider ID clients. A saved row wins over the server environment, field by field
 * (a blank saved field falls back to the environment). Secrets are sealed under CONNECTION_SECRET_KEY and never leave this class
 * except to the sign-in routes.
 */
export class SignInSettingsService {
  constructor(private readonly database: Database, private readonly box: ConnectionSecretBox | null, private readonly env: (name: string) => string | undefined, private readonly createId: () => string = randomUUID) {}

  private readEnv(name: string): string {
    try { return this.env(name)?.trim() ?? ''; } catch { return ''; }
  }

  private async rows(): Promise<Map<string, Row>> {
    const rows = await this.database.query<Row>('SELECT method, enabled, settings_json AS settingsJson, secret_ciphertext AS secretCiphertext FROM sign_in_setting');
    return new Map(rows.map((row) => [row.method, row]));
  }

  private openSecrets(row: Row | undefined): Record<string, string> {
    if (!row?.secretCiphertext || !this.box) return {};
    try { return JSON.parse(this.box.open(row.secretCiphertext)) as Record<string, string>; } catch { return {}; }
  }

  private effective(method: SignInMethod, row: Row | undefined): Effective {
    const spec = specs[method];
    const values = row ? (JSON.parse(row.settingsJson) as Record<string, string>) : {};
    const secrets = this.openSecrets(row);
    const fields: Record<string, string> = {};
    let fromEnv = false;
    for (const name of [...spec.values, ...spec.secrets]) {
      const saved = (spec.secrets.includes(name) ? secrets[name] : values[name])?.trim() ?? '';
      const environment = this.readEnv(spec.env[name]!);
      fields[name] = saved || environment;
      if (!saved && environment) fromEnv = true;
    }
    if (method === 'PROVIDER_ID' && !fields.environment) fields.environment = 'prd';
    const source = row ? 'SETTINGS' : fromEnv ? 'ENV' : 'NONE';
    return { enabled: row ? Boolean(Number(row.enabled)) : true, source, fields, stored: { values, secrets } };
  }

  private thaidFrom(effective: Effective): ThaidSettings | null {
    const { fields } = effective;
    if (!effective.enabled || !fields.clientId || !fields.clientSecret || !validRedirectUri(fields.redirectUri ?? '', specs.THAID.callbackPath)) return null;
    const apiUrl = this.readEnv('THAID_API_URL') ? baseUrl(this.readEnv('THAID_API_URL')) : THAID_API_URL;
    if (!apiUrl) return null;
    return { clientId: fields.clientId, clientSecret: fields.clientSecret, redirectUri: fields.redirectUri!, apiUrl };
  }

  private providerFrom(effective: Effective): ProviderIdConfig | null {
    const { fields } = effective;
    const environment = providerEnvironments[fields.environment ?? 'prd'];
    if (!effective.enabled || !environment) return null;
    // The stub base-URL overrides come from the environment only (e2e); they are never set on the web page.
    const healthUrl = this.readEnv('PROVIDER_ID_HEALTH_URL') ? baseUrl(this.readEnv('PROVIDER_ID_HEALTH_URL')) : environment.healthUrl;
    const apiUrl = this.readEnv('PROVIDER_ID_API_URL') ? baseUrl(this.readEnv('PROVIDER_ID_API_URL')) : environment.apiUrl;
    const redirectUri = baseUrl(fields.redirectUri);
    if (!healthUrl || !apiUrl || !redirectUri || !fields.healthClientId || !fields.providerClientId || !fields.healthClientSecret || !fields.providerSecretKey) return null;
    return { healthUrl, apiUrl, healthClientId: fields.healthClientId, healthClientSecret: fields.healthClientSecret, providerClientId: fields.providerClientId, providerSecretKey: fields.providerSecretKey, redirectUri };
  }

  private ready(method: SignInMethod, effective: Effective): boolean {
    return method === 'THAID' ? this.thaidFrom(effective) !== null : this.providerFrom(effective) !== null;
  }

  private methodView(method: SignInMethod, effective: Effective): SignInMethodView {
    const spec = specs[method];
    return {
      enabled: effective.enabled,
      ready: this.ready(method, effective),
      source: effective.source,
      values: Object.fromEntries(spec.values.map((name) => [name, effective.fields[name] ?? ''])),
      secretsSet: Object.fromEntries(spec.secrets.map((name) => [name, Boolean(effective.fields[name])]))
    };
  }

  async view(): Promise<SignInSettingsView> {
    const rows = await this.rows();
    return {
      thaid: this.methodView('THAID', this.effective('THAID', rows.get('THAID'))),
      providerId: this.methodView('PROVIDER_ID', this.effective('PROVIDER_ID', rows.get('PROVIDER_ID'))),
      canStoreSecrets: this.box !== null
    };
  }

  /** Both routes from one read, for the sign-in page. */
  async routes(): Promise<{ thaid: ThaidSettings | null; providerId: ProviderIdConfig | null }> {
    const rows = await this.rows();
    return { thaid: this.thaidFrom(this.effective('THAID', rows.get('THAID'))), providerId: this.providerFrom(this.effective('PROVIDER_ID', rows.get('PROVIDER_ID'))) };
  }

  async thaid(): Promise<ThaidSettings | null> {
    return this.thaidFrom(this.effective('THAID', (await this.rows()).get('THAID')));
  }

  async providerId(): Promise<ProviderIdConfig | null> {
    return this.providerFrom(this.effective('PROVIDER_ID', (await this.rows()).get('PROVIDER_ID')));
  }

  /** A blank secret keeps the stored one. Turning off or breaking the last ready route is refused (LAST_SIGN_IN_ROUTE). */
  async save(method: SignInMethod, input: SignInSettingInput, actorPersonId: string): Promise<SignInSettingSaveResult> {
    const spec = specs[method];
    const values = Object.fromEntries(spec.values.map((name) => [name, String(input.values[name] ?? '').trim()]));
    const typedSecrets = Object.fromEntries(spec.secrets.map((name) => [name, String(input.secrets[name] ?? '')]));
    if (!this.valid(method, values, typedSecrets)) return { ok: false, code: 'INVALID_INPUT' };
    const typed = Object.entries(typedSecrets).filter(([, value]) => value !== '');
    if (typed.length > 0 && !this.box) return { ok: false, code: 'NO_SECRET_KEY' };

    const rows = await this.rows();
    const before = this.effective(method, rows.get(method));
    const secrets = { ...before.stored.secrets, ...Object.fromEntries(typed) };
    const sealed = Object.values(secrets).some(Boolean) && this.box ? this.box.seal(JSON.stringify(secrets)) : rows.get(method)?.secretCiphertext ?? null;
    const next: Row = { method, enabled: input.enabled ? 1 : 0, settingsJson: JSON.stringify(values), secretCiphertext: sealed };

    const other: SignInMethod = method === 'THAID' ? 'PROVIDER_ID' : 'THAID';
    const otherReady = this.ready(other, this.effective(other, rows.get(other)));
    const anyReadyNow = otherReady || this.ready(method, before);
    if (anyReadyNow && !otherReady && !this.ready(method, this.effective(method, next))) return { ok: false, code: 'LAST_SIGN_IN_ROUTE' };

    const changedFields = [...spec.values.filter((name) => values[name] !== (before.stored.values[name] ?? '')), ...typed.map(([name]) => name),
      ...(input.enabled !== before.enabled ? ['enabled'] : [])];
    await this.database.transaction(async (database) => {
      await database.execute(
        'INSERT INTO sign_in_setting (method, enabled, settings_json, secret_ciphertext, updated_by_person_id, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), settings_json = VALUES(settings_json), secret_ciphertext = VALUES(secret_ciphertext), updated_by_person_id = VALUES(updated_by_person_id), updated_at = VALUES(updated_at)',
        [method, next.enabled, next.settingsJson, next.secretCiphertext, actorPersonId]
      );
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'admin.sign_in_setting.update', targetType: 'sign_in_setting', targetId: method, result: 'SUCCESS', metadata: { method, changedFields } });
    });
    return { ok: true };
  }

  private valid(method: SignInMethod, values: Record<string, string>, secrets: Record<string, string>): boolean {
    if (Object.values(secrets).some((secret) => secret.length > 512)) return false;
    if (values.redirectUri && !validRedirectUri(values.redirectUri, specs[method].callbackPath)) return false;
    if (method === 'THAID') return !values.clientId || clientIdPattern.test(values.clientId);
    if (values.environment && !providerEnvironments[values.environment]) return false;
    return [values.healthClientId, values.providerClientId].every((id) => !id || clientIdPattern.test(id!));
  }
}
