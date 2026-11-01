'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type MessageKey } from '@backoffice/i18n';

const errorMessages: Record<string, MessageKey> = {
  invalid_code: 'setupErrorInvalidCode', connection_failed: 'setupErrorConnectionFailed', access_denied: 'setupErrorAccessDenied',
  migration_privilege_missing: 'setupErrorMigrationPrivilege', unsupported_server: 'setupErrorUnsupportedServer', accounts_exist: 'setupErrorAccountsExist',
  keys_missing: 'setupErrorKeysMissing', invalid_input: 'setupErrorInvalidInput', already_configured: 'setupErrorAlreadyConfigured', config_write_failed: 'setupErrorConfigWriteFailed'
};
const messageFor = (code: unknown) => t(errorMessages[String(code)] ?? 'setupErrorConnectionFailed');

type Fields = Record<'code' | 'host' | 'port' | 'database' | 'dbUser' | 'dbPassword' | 'firstName' | 'lastName' | 'employeeCode' | 'nationalId' | 'username' | 'password' | 'confirm', string>;
const empty: Fields = { code: '', host: '', port: '3306', database: 'backoffice', dbUser: '', dbPassword: '', firstName: '', lastName: '', employeeCode: '', nationalId: '', username: '', password: '', confirm: '' };
type Check = { serverVersion: string; pendingMigrations: number; hasAccounts: boolean };

export function SetupForm({ missingKeys }: { missingKeys: string[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(empty);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);

  const set = (name: keyof Fields) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [name]: event.target.value }));
  const database = () => ({ host: fields.host.trim(), port: Number(fields.port) || 3306, database: fields.database.trim(), username: fields.dbUser.trim(), password: fields.dbPassword });

  async function send(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return response.json().catch(() => ({ ok: false })) as Promise<Record<string, unknown>>;
  }

  async function testConnection() {
    if (busy) return;
    setError(null); setCheck(null); setBusy('test');
    try {
      const result = await send('/api/setup/test-connection', { code: fields.code.trim(), database: database() });
      if (result.ok) setCheck(result as unknown as Check); else setError(messageFor(result.error));
    } catch { setError(messageFor('connection_failed')); } finally { setBusy(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || missingKeys.length > 0) return;
    if (Object.values(fields).some((value) => !value.trim())) { setError(t('setupFillAll')); return; }
    if (fields.password !== fields.confirm) { setError(t('setupPasswordMismatch')); return; }
    setError(null); setBusy('save');
    try {
      const admin = { firstName: fields.firstName.trim(), lastName: fields.lastName.trim(), employeeCode: fields.employeeCode.trim(), nationalId: fields.nationalId.trim(), username: fields.username.trim(), password: fields.password };
      const result = await send('/api/setup/complete', { code: fields.code.trim(), database: database(), admin });
      if (result.ok) router.push('/'); else setError(messageFor(result.error));
    } catch { setError(messageFor('connection_failed')); } finally { setBusy(null); }
  }

  const field = (name: keyof Fields, label: MessageKey, options: { type?: string; autoComplete?: string; hint?: MessageKey; inputMode?: 'numeric' } = {}) => (
    <div className="form-field">
      <label htmlFor={`setup-${name}`}>{t(label)}</label>
      <input id={`setup-${name}`} name={name} type={options.type ?? 'text'} autoComplete={options.autoComplete ?? 'off'} inputMode={options.inputMode} value={fields[name]} onChange={set(name)} aria-describedby={options.hint ? `setup-${name}-hint` : undefined} />
      {options.hint && <small id={`setup-${name}-hint`} className="form-hint">{t(options.hint)}</small>}
    </div>
  );

  return (
    <form className="sign-in-form setup-form" noValidate onSubmit={submit}>
      {missingKeys.length > 0 && (
        <div className="form-error" role="status">
          <p>{t('setupMissingKeys')}</p>
          <ul>{missingKeys.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        </div>
      )}
      <fieldset>
        <legend>{t('setupCodeSection')}</legend>
        {field('code', 'setupCode', { hint: 'setupCodeHint' })}
      </fieldset>
      <fieldset>
        <legend>{t('setupDatabaseSection')}</legend>
        {field('host', 'setupHost')}
        {field('port', 'setupPort', { inputMode: 'numeric' })}
        {field('database', 'setupDatabaseName')}
        {field('dbUser', 'setupDatabaseUser')}
        {fields.dbUser.trim() === 'root' && <p className="form-hint" role="note">{t('setupRootWarning')}</p>}
        {field('dbPassword', 'setupDatabasePassword', { type: 'password', autoComplete: 'new-password' })}
        <button type="button" className="secondary-button" onClick={testConnection} disabled={busy !== null}>{busy === 'test' ? t('setupTesting') : t('setupTestConnection')}</button>
        {check && (
          <p className="form-hint" role="status">
            {t('setupConnected')}: MariaDB {check.serverVersion.split('-')[0]} · {t('setupPendingMigrations')} {check.pendingMigrations} {t('setupItems')}
            {check.hasAccounts && <><br />{t('setupHasAccounts')}</>}
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>{t('setupAdminSection')}</legend>
        <p className="form-hint">{t('setupAdminHint')}</p>
        {field('firstName', 'setupFirstName')}
        {field('lastName', 'setupLastName')}
        {field('employeeCode', 'employeeCode')}
        {field('nationalId', 'nationalIdLabel', { inputMode: 'numeric' })}
        {field('username', 'setupUsername', { autoComplete: 'off' })}
        {field('password', 'setupPassword', { type: 'password', autoComplete: 'new-password', hint: 'setupPasswordHint' })}
        {field('confirm', 'setupConfirmPassword', { type: 'password', autoComplete: 'new-password' })}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy !== null || missingKeys.length > 0}>{busy === 'save' ? t('setupSaving') : t('setupSave')}</button>
    </form>
  );
}
