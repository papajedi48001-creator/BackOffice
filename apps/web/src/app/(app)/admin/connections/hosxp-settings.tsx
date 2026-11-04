'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HosxpSettingsView } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { FormDialog } from '../../../../components/form-dialog';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';

const errorText = (code: unknown): string => {
  const key = `hosxpError${String(code)}` as MessageKey;
  return typeof code === 'string' && key in { hosxpErrorNOT_CONFIGURED: 1, hosxpErrorCONNECTION_FAILED: 1, hosxpErrorCOLUMNS_NOT_FOUND: 1, hosxpErrorNO_SECRET_KEY: 1, hosxpErrorINVALID_INPUT: 1 } ? t(key) : t('hosxpErrorFailed');
};

/** HOSxP under ตั้งค่าการเชื่อมต่อ: shows where the settings come from (never the password), edits them in FormDialog, tests and syncs. */
export function HosxpSettings({ view }: { view: Omit<HosxpSettingsView, 'canStorePassword'> & { canStorePassword: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'test' | 'sync' | null>(null);
  const [message, setMessage] = useState<{ tone: 'approved' | 'rejected'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'test' | 'sync') {
    setBusy(kind); setMessage(null);
    try {
      const response = await fetch(`/api/admin/hosxp/${kind}`, { method: 'POST' });
      const body = await response.json().catch(() => ({})) as { rows?: number; count?: number; error?: string };
      if (response.ok) { setMessage({ tone: 'approved', text: kind === 'test' ? `${t('hosxpTestOk')} ${body.rows ?? 0} ${t('hosxpRows')}` : `${t('hosxpSyncOk')} ${body.count ?? 0} ${t('hosxpRows')}` }); if (kind === 'sync') router.refresh(); }
      else setMessage({ tone: 'rejected', text: errorText(body.error) });
    } catch { setMessage({ tone: 'rejected', text: t('hosxpErrorFailed') }); } finally { setBusy(null); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<boolean> {
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '');
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/admin/hosxp', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: value('host'), port: Number(value('port')), database: value('database'), user: value('user'), password: value('password'), dateColumn: value('dateColumn'), nameColumn: value('nameColumn') }) });
      if (response.ok) { router.refresh(); return true; }
      const body = await response.json().catch(() => ({})) as { error?: string };
      setError(errorText(body.error === 'invalid_input' ? 'INVALID_INPUT' : body.error));
      return false;
    } catch { setError(t('hosxpErrorFailed')); return false; } finally { setSaving(false); }
  }

  return <section className="admin-hosxp" aria-labelledby="hosxp-title">
    <h3 id="hosxp-title">{t('hosxpTitle')}</h3>
    <p className="admin-note">{t('hosxpNote')}</p>
    <dl className="admin-line-facts">
      <div><dt>{t('hosxpSource')}</dt><dd>{t(`hosxpSource${view.source}` as MessageKey)}</dd></div>
      {view.source !== 'NONE' && <>
        <div><dt>{t('hosxpHost')}</dt><dd><code>{view.host}:{view.port}</code> / <code>{view.database}</code></dd></div>
        <div><dt>{t('hosxpUser')}</dt><dd>{view.user}</dd></div>
        <div><dt>{t('hosxpPassword')}</dt><dd>{t(view.passwordSet ? 'hosxpPasswordSet' : 'hosxpPasswordNotSet')}</dd></div>
        <div><dt>{t('hosxpDateColumn')} / {t('hosxpNameColumn')}</dt><dd><code>{view.dateColumn}</code> / <code>{view.nameColumn}</code></dd></div>
      </>}
      <div><dt>{t('hosxpLastSync')}</dt><dd>{view.lastSyncAt ? `${formatBangkokDateTime(view.lastSyncAt)} · ${view.lastSyncStatus === 'OK' ? `${view.lastSyncCount ?? 0} ${t('hosxpRows')}` : errorText(view.lastSyncStatus)}` : t('hosxpNever')}</dd></div>
    </dl>
    <div className="request-actions">
      <FormDialog title={t('hosxpEdit')} triggerLabel={t('hosxpEdit')} submitLabel={t('hosxpSave')} isSubmitting={saving} error={error} onSubmit={save}>
        <div className="form-field"><label htmlFor="hosxp-host">{t('hosxpHost')}</label><input id="hosxp-host" name="host" defaultValue={view.host} required maxLength={255} /></div>
        <div className="form-field"><label htmlFor="hosxp-port">{t('hosxpPort')}</label><input id="hosxp-port" name="port" type="number" min={1} max={65535} defaultValue={view.port} required /></div>
        <div className="form-field"><label htmlFor="hosxp-database">{t('hosxpDatabase')}</label><input id="hosxp-database" name="database" defaultValue={view.database} required /></div>
        <div className="form-field"><label htmlFor="hosxp-user">{t('hosxpUser')}</label><input id="hosxp-user" name="user" defaultValue={view.user} required autoComplete="off" /></div>
        <div className="form-field"><label htmlFor="hosxp-password">{t('hosxpPassword')}</label><input id="hosxp-password" name="password" type="password" autoComplete="new-password" defaultValue="" aria-describedby="hosxp-password-hint" /><small id="hosxp-password-hint">{view.passwordSet ? t('hosxpPasswordKeep') : t('hosxpPasswordNotSet')}{view.canStorePassword ? '' : ` · ${t('hosxpErrorNO_SECRET_KEY')}`}</small></div>
        <div className="form-field"><label htmlFor="hosxp-date-column">{t('hosxpDateColumn')}</label><input id="hosxp-date-column" name="dateColumn" defaultValue={view.dateColumn} required /></div>
        <div className="form-field"><label htmlFor="hosxp-name-column">{t('hosxpNameColumn')}</label><input id="hosxp-name-column" name="nameColumn" defaultValue={view.nameColumn} required /></div>
      </FormDialog>
      <button type="button" className="button-secondary" disabled={busy !== null || view.source === 'NONE'} onClick={() => void act('test')}>{t('hosxpTest')}</button>
      <button type="button" disabled={busy !== null || view.source === 'NONE'} onClick={() => void act('sync')}>{t('hosxpSync')}</button>
      <Link href="/leave/holidays">{t('hosxpManageHolidays')}</Link>
    </div>
    {message && <p role="status" className={`status status-${message.tone}`}>{message.text}</p>}
  </section>;
}
