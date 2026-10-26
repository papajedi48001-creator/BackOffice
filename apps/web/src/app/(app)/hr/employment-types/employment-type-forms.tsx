'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmploymentTypeInput } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';

const errorKeys: Record<string, MessageKey> = { DUPLICATE_CODE: 'hrEmploymentTypeDuplicate', DUPLICATE_NAME: 'hrEmploymentTypeDuplicate', NOT_FOUND: 'hrEmploymentTypeNotFound', invalid_input: 'hrEmploymentTypeInvalid' };

/** Edits one employment type, or adds one when it has no id. Types are retired with the active box, never deleted. */
export function EmploymentTypeForm({ type }: { type: EmploymentTypeInput & { id?: string } }) {
  const router = useRouter();
  const [form, setForm] = useState({ code: type.code, name: type.name, isActive: type.isActive, sortOrder: String(type.sortOrder) });
  const [error, setError] = useState<string | null>(null);
  const adding = !type.id;
  const title = adding ? t('hrAddEmploymentType') : `${t('hrEditEmploymentType')} ${type.name}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(adding ? '/api/hr/employment-types' : `/api/hr/employment-types/${type.id}`, {
        method: adding ? 'POST' : 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: form.code.trim(), name: form.name.trim(), isActive: form.isActive, sortOrder: Number(form.sortOrder) })
      });
      if (response.ok) {
        if (adding) setForm({ code: '', name: '', isActive: true, sortOrder: String(Number(form.sortOrder) + 1) });
        router.refresh();
        return;
      }
      const code = ((await response.json()) as { error?: string }).error;
      setError(t(code && errorKeys[code] ? errorKeys[code] : 'hrProfileSaveFailed'));
    } catch { setError(t('hrProfileSaveFailed')); }
  }

  return <form aria-label={title} className="profile-form" onSubmit={submit}>
    <h4>{title}</h4>
    {error && <p role="alert" className="form-error">{error}</p>}
    <label>{t('hrEmploymentTypeCode')}<input value={form.code} maxLength={32} required onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label>
    <label>{t('hrEmploymentTypeName')}<input value={form.name} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>{t('hrEmploymentTypeOrder')}<input type="number" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
    <label className="profile-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{t('hrEmploymentTypeActive')}</label>
    <button type="submit">{adding ? t('hrAddEmploymentType') : t('hrSaveEmploymentType')}</button>
  </form>;
}
