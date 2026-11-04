'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '@backoffice/i18n';

export interface RoleChoice { code: string; name: string; description: string; }

/** One card button per บทบาท; the server checks the choice and the session keeps it. */
export function RolePicker({ choices, current }: { choices: RoleChoice[]; current: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function choose(code: string) {
    setSaving(code);
    setError(null);
    try {
      const response = await fetch('/api/auth/role', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: code }) });
      if (response.ok) {
        router.push('/dashboard');
        router.refresh();
        return;
      }
      if (response.status === 401) { router.push('/'); return; }
      const body = (await response.json().catch(() => ({}))) as { error?: unknown };
      setError(t(body.error === 'role_not_held' ? 'chooseRoleNotHeld' : 'chooseRoleFailed'));
      // The held roles may have changed; reload the list from the server.
      router.refresh();
    } catch {
      setError(t('chooseRoleFailed'));
    }
    setSaving(null);
  }
  return <div className="role-picker">
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <ul className="role-choices">
      {choices.map((choice) => <li key={choice.code}>
        <button type="button" className="role-choice" aria-current={choice.code === current ? 'true' : undefined} disabled={saving !== null} onClick={() => void choose(choice.code)}>
          <span className="role-choice-name">{choice.name}</span>
          {choice.description ? <span className="role-choice-description">{choice.description}</span> : null}
          {choice.code === current ? <span className="role-choice-current">{t('chooseRoleCurrent')}</span> : null}
          {saving === choice.code ? <span className="role-choice-current">{t('chooseRoleSaving')}</span> : null}
        </button>
      </li>)}
    </ul>
  </div>;
}
