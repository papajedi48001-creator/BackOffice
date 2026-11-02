'use client';

import { useState } from 'react';
import { t, type MessageKey } from '@backoffice/i18n';

/** Why a new password should not be saved yet, or null. A Thai letter usually means the keyboard was in Thai. */
export function passwordProblem(password: string, confirm: string): MessageKey | null {
  if (/[^\x20-\x7E]/.test(password)) return 'hrPasswordNotAscii';
  if (confirm !== '' && password !== confirm) return 'hrPasswordMismatch';
  return null;
}

/** A new password typed twice, with a show button, so HR sees what it saves. The browser is told not to fill a saved password in. */
export function NewPasswordField({ label, value, confirm, onChange, onConfirmChange }: { label: MessageKey; value: string; confirm: string; onChange: (value: string) => void; onConfirmChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  const problem = passwordProblem(value, confirm);
  const type = shown ? 'text' : 'password';
  return <div className="password-fields">
    <div className="password-field">
      <label>{t(label)}<input type={type} value={value} required minLength={8} maxLength={128} autoComplete="new-password" spellCheck={false} onChange={(event) => onChange(event.target.value)} /></label>
      <button type="button" className="button-secondary" aria-pressed={shown} onClick={() => setShown((current) => !current)}>{t(shown ? 'hrHidePassword' : 'hrShowPassword')}</button>
    </div>
    <label>{t('hrConfirmPassword')}<input type={type} value={confirm} required minLength={8} maxLength={128} autoComplete="new-password" spellCheck={false} onChange={(event) => onConfirmChange(event.target.value)} /></label>
    {problem ? <p role="alert" className="form-error">{t(problem)}</p> : null}
  </div>;
}
