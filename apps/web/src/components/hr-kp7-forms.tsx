'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_KP7_FILE_BYTES, maritalStatusSchema, type MaritalStatus } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { bangkokToday, formatBangkokDate, formatBangkokTime } from '../lib/bangkok-time';
import { maritalStatusLabelKeys } from '../lib/hr-profile-labels';

export interface FamilyFormValues {
  maritalStatus: MaritalStatus | null; religion: string | null; birthplace: string | null; fatherName: string | null; motherName: string | null;
  motherMaidenName: string | null; spouseName: string | null; spouseMaidenName: string | null; childrenCount: number | null;
}
const textFields: [keyof FamilyFormValues, MessageKey, number][] = [
  ['religion', 'hrFieldReligion', 64], ['birthplace', 'hrFieldBirthplace', 255], ['fatherName', 'hrFieldFatherName', 255], ['motherName', 'hrFieldMotherName', 255],
  ['motherMaidenName', 'hrFieldMotherMaidenName', 255], ['spouseName', 'hrFieldSpouseName', 255], ['spouseMaidenName', 'hrFieldSpouseMaidenName', 255]
];
type Message = { kind: 'error' | 'saved'; text: string } | null;
const feedbackOf = (message: Message) => message && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>);
const orNull = (value: string) => value.trim() === '' ? null : value.trim();

/** ข้อมูลส่วนตัวและครอบครัว as on the ก.พ.7. The person themself and HR use it; the server checks who may save. */
export function FamilyForm({ endpoint, values }: { endpoint: string; values: FamilyFormValues }) {
  const router = useRouter();
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? '' : String(value)])) as Record<keyof FamilyFormValues, string>);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof FamilyFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    const body = {
      ...Object.fromEntries(textFields.map(([field]) => [field, orNull(form[field])])),
      maritalStatus: form.maritalStatus === '' ? null : form.maritalStatus,
      childrenCount: form.childrenCount.trim() === '' ? null : Number(form.childrenCount)
    };
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { setMessage({ kind: 'saved', text: t('hrProfileSaved') }); router.refresh(); return; }
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code === 'FORBIDDEN' ? 'hrProfileForbidden' : code === 'invalid_input' ? 'hrProfileInvalid' : 'hrProfileSaveFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrProfileSaveFailed') }); } finally { setBusy(false); }
  }
  return <form aria-label={t('hrEditFamily')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditFamily')}</h4>
    {feedbackOf(message)}
    <label>{t('hrFieldMaritalStatus')}
      <select value={form.maritalStatus} onChange={set('maritalStatus')}>
        <option value="">{t('notAssigned')}</option>
        {maritalStatusSchema.options.map((status) => <option key={status} value={status}>{t(maritalStatusLabelKeys[status])}</option>)}
      </select>
    </label>
    {textFields.map(([field, label, max]) => <label key={field}>{t(label)}<input value={form[field]} maxLength={max} onChange={set(field)} /></label>)}
    <label>{t('hrFieldChildrenCount')}<input type="number" min={0} max={30} step={1} value={form.childrenCount} onChange={set('childrenCount')} /></label>
    <button type="submit" disabled={busy}>{t('hrSaveFamily')}</button>
  </form>;
}

const uploadErrorKeys: Record<string, MessageKey> = { UNSUPPORTED_FILE_TYPE: 'hrKp7WrongType', FILE_TOO_LARGE: 'hrKp7TooLarge', INVALID_FILE_CONTENT: 'hrKp7WrongType', FILE_INFECTED: 'hrKp7Infected', INVALID_FILE: 'hrKp7WrongType', FORBIDDEN: 'hrProfileForbidden', object_storage_not_configured: 'hrKp7Unavailable' };

/** The ก.พ.7 PDF. With an endpoint the viewer may upload, replace or remove it; without one they may only open it. */
export function Kp7FileForm({ endpoint, file, uploadsEnabled }: { endpoint?: string; file: { attachmentId: string; uploadedAt: string } | null; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  async function send(init: RequestInit, saved: MessageKey) {
    if (!endpoint) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(endpoint, init);
      if (response.ok) { setMessage({ kind: 'saved', text: t(saved) }); router.refresh(); return; }
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code && uploadErrorKeys[code] ? uploadErrorKeys[code] : 'hrKp7Failed') });
    } catch { setMessage({ kind: 'error', text: t('hrKp7Failed') }); } finally { setBusy(false); }
  }
  function upload(chosen: File | undefined) {
    if (!chosen) return;
    if (chosen.type !== 'application/pdf') { setMessage({ kind: 'error', text: t('hrKp7WrongType') }); return; }
    if (chosen.size > MAX_KP7_FILE_BYTES) { setMessage({ kind: 'error', text: t('hrKp7TooLarge') }); return; }
    const body = new FormData();
    body.append('file', chosen);
    void send({ method: 'POST', body }, 'hrKp7Saved');
  }
  return <section aria-label={t('hrKp7File')} className="profile-box">
    <h3>{t('hrKp7File')}</h3>
    {feedbackOf(message)}
    {file ? <p>
      <a href={`/api/attachments/${file.attachmentId}/download`}>{t('hrKp7Open')}</a>
      {' '}<span className="form-hint">{t('hrKp7UploadedAt')} {formatBangkokDate(bangkokToday(new Date(file.uploadedAt)))} {formatBangkokTime(file.uploadedAt)}</span>
    </p> : <p>{t('hrKp7None')}</p>}
    {endpoint ? uploadsEnabled ? <>
      <label>{t('hrKp7Choose')}<input type="file" accept="application/pdf" disabled={busy} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {file ? <button type="button" className="button-secondary" disabled={busy} onClick={() => void send({ method: 'DELETE' }, 'hrKp7Removed')}>{t('hrKp7Remove')}</button> : null}
      <p className="form-hint">{busy ? t('hrKp7Uploading') : t('hrKp7Hint')}</p>
    </> : <p className="form-hint">{t('hrKp7Unavailable')}</p> : null}
  </section>;
}
