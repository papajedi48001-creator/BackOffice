'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SignInMethodView, SignInSettingsView } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';

type Method = 'THAID' | 'PROVIDER_ID';
interface Field { name: string; label: string; secret?: boolean; options?: string[] }

const routes: Record<Method, { title: string; other: string; fields: Field[] }> = {
  THAID: { title: 'ThaID', other: 'ThaID', fields: [{ name: 'clientId', label: 'Client ID' }, { name: 'clientSecret', label: 'Client Secret', secret: true }, { name: 'redirectUri', label: 'Redirect URI' }] },
  PROVIDER_ID: { title: 'Provider ID', other: 'Provider ID', fields: [
    { name: 'environment', label: t('signInEnvironment'), options: ['prd', 'uat'] },
    { name: 'healthClientId', label: t('signInHealthClientId') }, { name: 'healthClientSecret', label: t('signInHealthClientSecret'), secret: true },
    { name: 'providerClientId', label: t('signInProviderClientId') }, { name: 'providerSecretKey', label: t('signInProviderSecretKey'), secret: true },
    { name: 'redirectUri', label: 'Redirect URI' }] }
};

function errorText(code: unknown, method: Method): string {
  // The last route can only be switched off once the other one is ready, so the message names the other one.
  if (code === 'LAST_SIGN_IN_ROUTE') return t(method === 'THAID' ? 'signInErrorLAST_SIGN_IN_ROUTE_PROVIDER' : 'signInErrorLAST_SIGN_IN_ROUTE');
  if (code === 'INVALID_INPUT' || code === 'invalid_input') return t('signInErrorINVALID_INPUT');
  if (code === 'NO_SECRET_KEY') return t('signInErrorNO_SECRET_KEY');
  return t('signInErrorFailed');
}

const statusOf = (view: SignInMethodView): { key: MessageKey; tone: string } =>
  !view.enabled ? { key: 'signInOff', tone: 'cancelled' } : view.ready ? { key: 'signInReady', tone: 'approved' } : { key: 'signInIncomplete', tone: 'rejected' };

async function put(method: Method, enabled: boolean, values: Record<string, string>, secrets: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch('/api/admin/sign-in-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, enabled, values, secrets }) });
    if (response.ok) return null;
    const body = await response.json().catch(() => ({})) as { error?: string };
    return errorText(body.error, method);
  } catch { return t('signInErrorFailed'); }
}

function RouteCard({ method, view, canStoreSecrets, defaultRedirectUri }: { method: Method; view: SignInMethodView; canStoreSecrets: boolean; defaultRedirectUri: string }) {
  const router = useRouter();
  const route = routes[method];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const status = statusOf(view);
  const valueFields = route.fields.filter((field) => !field.secret);
  const currentValues = Object.fromEntries(valueFields.map((field) => [field.name, view.values[field.name] ?? '']));
  const shownRedirect = view.values.redirectUri || defaultRedirectUri;

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<boolean> {
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '');
    setSaving(true); setError(null);
    const failure = await put(method, view.enabled,
      Object.fromEntries(valueFields.map((field) => [field.name, read(field.name)])),
      Object.fromEntries(route.fields.filter((field) => field.secret).map((field) => [field.name, read(field.name)])));
    setSaving(false);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    setSaving(true); setError(null);
    const failure = await put(method, enabled, { ...currentValues, redirectUri: currentValues.redirectUri || defaultRedirectUri }, {});
    setSaving(false);
    if (failure) { setError(failure); return; }
    setConfirming(false);
    router.refresh();
  }

  const titleId = `sign-in-${method.toLowerCase()}-title`;
  return <section className="admin-hosxp" aria-labelledby={titleId}>
    <h3 id={titleId}>{route.title}</h3>
    <dl className="admin-line-facts">
      <div><dt>{t('signInStatus')}</dt><dd><span className={`status status-${status.tone}`}>{t(status.key)}</span></dd></div>
      <div><dt>{t('signInSource')}</dt><dd>{t(`signInSource${view.source}` as MessageKey)}</dd></div>
      {route.fields.filter((field) => field.name !== 'redirectUri').map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{field.secret
        ? t(view.secretsSet[field.name] ? 'signInSecretSet' : 'signInSecretNotSet')
        : view.values[field.name] ? <code>{view.values[field.name]}</code> : '-'}</dd></div>)}
      <div><dt>Redirect URI</dt><dd><code>{shownRedirect}</code><br /><small>{t('signInRedirectNote')}</small></dd></div>
    </dl>
    <div className="request-actions">
      <FormDialog title={`${t('signInEdit')} ${route.title}`} triggerLabel={`${t('signInEdit')} ${route.title}`} submitLabel={t('signInSave')} isSubmitting={saving} error={error} onSubmit={save}>
        {route.fields.map((field) => {
          const id = `sign-in-${method.toLowerCase()}-${field.name}`;
          if (field.options) return <div className="form-field" key={field.name}><label htmlFor={id}>{field.label}</label>
            <select id={id} name={field.name} defaultValue={view.values[field.name] || field.options[0]}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
          if (field.secret) return <div className="form-field" key={field.name}><label htmlFor={id}>{field.label}</label>
            <input id={id} name={field.name} type="password" autoComplete="new-password" defaultValue="" maxLength={512} disabled={!canStoreSecrets} aria-describedby={`${id}-hint`} />
            <small id={`${id}-hint`}>{view.secretsSet[field.name] ? t('signInSecretKeep') : t('signInSecretNotSet')}{canStoreSecrets ? '' : ` · ${t('signInErrorNO_SECRET_KEY')}`}</small></div>;
          const value = field.name === 'redirectUri' ? shownRedirect : view.values[field.name] ?? '';
          return <div className="form-field" key={field.name}><label htmlFor={id}>{field.label}</label>
            <input id={id} name={field.name} defaultValue={value} maxLength={512} autoComplete="off" /></div>;
        })}
      </FormDialog>
      {view.enabled
        ? <button type="button" className="button-secondary" disabled={saving} onClick={() => { setError(null); setConfirming(true); }}>{`${t('signInTurnOff')} ${route.title}`}</button>
        : <button type="button" disabled={saving} onClick={() => void setEnabled(true)}>{`${t('signInTurnOn')} ${route.title}`}</button>}
    </div>
    {error && !confirming ? <p role="alert" className="form-error">{error}</p> : null}
    {confirming ? <ActionDialog title={`${t('signInTurnOff')} ${route.title}`} message={t('signInTurnOffMessage')} confirmLabel={t('signInTurnOffConfirm')} tone="danger"
      isSubmitting={saving} error={error} onConfirm={() => void setEnabled(false)} onClose={() => { setConfirming(false); setError(null); }} /> : null}
  </section>;
}

/** ผู้ดูแลระบบ > การเข้าสู่ระบบ: ThaID and Provider ID, each edited in a FormDialog; switching one off is confirmed in an ActionDialog. */
export function SignInSettings({ view, defaultThaidRedirectUri }: { view: SignInSettingsView; defaultThaidRedirectUri: string }) {
  return <>
    {view.canStoreSecrets ? null : <p className="admin-note" role="note">{t('signInNoSecretKey')}</p>}
    <RouteCard method="THAID" view={view.thaid} canStoreSecrets={view.canStoreSecrets} defaultRedirectUri={defaultThaidRedirectUri} />
    <RouteCard method="PROVIDER_ID" view={view.providerId} canStoreSecrets={view.canStoreSecrets} defaultRedirectUri={defaultThaidRedirectUri.replace('/api/auth/thaid/callback', '/api/auth/provider/callback')} />
  </>;
}
