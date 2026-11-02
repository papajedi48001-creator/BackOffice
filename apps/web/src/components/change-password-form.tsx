'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DEFAULT_RESET_PASSWORD } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { NewPasswordField, passwordProblem } from './new-password-field';

const errorKeys: Record<string, MessageKey> = { WRONG_PASSWORD: 'passwordWrongCurrent', SAME_PASSWORD: 'passwordSameAsOld' };

/**
 * เปลี่ยนรหัสผ่าน of the signed-in person. `forced` is the step right after a reset: no current password is asked for.
 * The server ends every session on success, so the person signs in again with the new password.
 */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, confirm) ?? (password !== confirm ? 'hrPasswordMismatch' : password === DEFAULT_RESET_PASSWORD ? 'passwordSameAsOld' : null);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(forced ? { newPassword: password } : { currentPassword: current, newPassword: password }) }).catch(() => null);
    setBusy(false);
    if (response?.ok) { setDone(true); return; }
    const body = await response?.json().catch(() => null) as { error?: string } | null;
    setError(errorKeys[body?.error ?? ''] ?? 'passwordSaveFailed');
  }
  if (done) return <div className="profile-form" role="status"><p>{t('passwordChanged')}</p><Link className="button-link" href="/">{t('passwordSignInAgain')}</Link></div>;
  return <form aria-label={t('passwordChangeTitle')} className="profile-form" onSubmit={submit}>
    <h4>{t('passwordChangeTitle')}</h4>
    {forced ? <p className="form-hint">{t('passwordForcedHint')}</p> : <label>{t('passwordCurrent')}<input type="password" value={current} required maxLength={128} autoComplete="current-password" onChange={(event) => setCurrent(event.target.value)} /></label>}
    <NewPasswordField label="hrNewPassword" value={password} confirm={confirm} onChange={setPassword} onConfirmChange={setConfirm} />
    {error ? <p role="alert" className="form-error">{t(error)}</p> : null}
    <button type="submit" disabled={busy}>{t('passwordSave')}</button>
  </form>;
}
