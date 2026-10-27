'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { genderForPrefix, type Gender } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { genderLabelKeys } from '../lib/hr-profile-labels';

const errorKeys: Record<string, MessageKey> = {
  GENDER_REQUIRED: 'hrProfileGenderRequired', INACTIVE_EMPLOYMENT_TYPE: 'hrProfileInactiveType', UNKNOWN_EMPLOYMENT_TYPE: 'hrProfileUnknownType',
  UNKNOWN_ORGANIZATION: 'hrProfileUnknownOrganization', FORBIDDEN: 'hrProfileForbidden', NOT_FOUND: 'hrPersonNotFound', invalid_input: 'hrProfileInvalid'
};
const orNull = (value: string) => value.trim() === '' ? null : value.trim();

function useSave(endpoint: string) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  async function save(body: unknown) {
    setMessage(null);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { setMessage({ kind: 'saved', text: t('hrProfileSaved') }); router.refresh(); return; }
      const code = ((await response.json()) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code && errorKeys[code] ? errorKeys[code] : 'hrProfileSaveFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrProfileSaveFailed') }); }
  }
  const feedback = message && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>);
  return { save, feedback };
}

export interface ProfileFormValues {
  namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null;
  employmentTypeId: string | null; appointedOn: string | null; positionTitle: string | null; positionLevel: string | null; organizationId: string | null;
}

export function ProfileForm({ personId, values, employmentTypes, organizations }: { personId: string; values: ProfileFormValues; employmentTypes: { id: string; name: string }[]; organizations: { id: string; name: string }[] }) {
  const { save, feedback } = useSave(`/api/hr/people/${personId}/profile`);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof ProfileFormValues, string>);
  const set = (field: keyof ProfileFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  function changePrefix(event: React.ChangeEvent<HTMLInputElement>) {
    const gender = genderForPrefix(event.target.value);
    setForm((current) => ({ ...current, namePrefix: event.target.value, gender: gender ?? current.gender }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { organizationId, gender, ...rest } = form;
    await save({ ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, orNull(value)])), gender: gender === '' ? null : gender, ...(organizationId ? { organizationId } : {}) });
  }
  const text = (field: keyof ProfileFormValues, label: MessageKey, max: number) => <label>{t(label)}<input value={form[field]} onChange={set(field)} maxLength={max} /></label>;
  return <form aria-label={t('hrEditProfile')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditProfile')}</h4>
    {feedback}
    <label>{t('hrFieldNamePrefix')}<input value={form.namePrefix} onChange={changePrefix} maxLength={32} /></label>
    {text('firstName', 'hrFieldFirstName', 120)}
    {text('lastName', 'hrFieldLastName', 120)}
    <label>{t('hrFieldGender')}
      <select value={form.gender} onChange={set('gender')}>
        <option value="">{t('hrGenderNone')}</option>
        {(Object.keys(genderLabelKeys) as Gender[]).map((gender) => <option key={gender} value={gender}>{t(genderLabelKeys[gender])}</option>)}
      </select>
    </label>
    <label>{t('hrFieldBirthDate')}<input type="date" value={form.birthDate} onChange={set('birthDate')} /></label>
    <label>{t('hrFieldEmploymentType')}
      <select value={form.employmentTypeId} onChange={set('employmentTypeId')}>
        <option value="">{t('notAssigned')}</option>
        {employmentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </label>
    <label>{t('hrFieldAppointedOn')}<input type="date" value={form.appointedOn} onChange={set('appointedOn')} /></label>
    {text('positionTitle', 'hrFieldPositionTitle', 255)}
    {text('positionLevel', 'hrFieldPositionLevel', 120)}
    <label>{t('hrFieldOrganization')}
      <select value={form.organizationId} onChange={set('organizationId')}>
        {form.organizationId === '' ? <option value="">{t('notAssigned')}</option> : null}
        {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </select>
    </label>
    <button type="submit">{t('hrSaveProfile')}</button>
  </form>;
}

export interface PersonalFormValues { namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null; }

/** The person's own ข้อมูลส่วนตัว. Work fields are not in this form; the server refuses them too. */
export function PersonalForm({ endpoint, values }: { endpoint: string; values: PersonalFormValues }) {
  const { save, feedback } = useSave(endpoint);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof PersonalFormValues, string>);
  const set = (field: keyof PersonalFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  function changePrefix(event: React.ChangeEvent<HTMLInputElement>) {
    const gender = genderForPrefix(event.target.value);
    setForm((current) => ({ ...current, namePrefix: event.target.value, gender: gender ?? current.gender }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { gender, ...rest } = form;
    await save({ ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, orNull(value)])), gender: gender === '' ? null : gender });
  }
  return <form aria-label={t('hrEditPersonal')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditPersonal')}</h4>
    {feedback}
    <label>{t('hrFieldNamePrefix')}<input value={form.namePrefix} onChange={changePrefix} maxLength={32} /></label>
    <label>{t('hrFieldFirstName')}<input value={form.firstName} onChange={set('firstName')} maxLength={120} /></label>
    <label>{t('hrFieldLastName')}<input value={form.lastName} onChange={set('lastName')} maxLength={120} /></label>
    <label>{t('hrFieldGender')}
      <select value={form.gender} onChange={set('gender')}>
        <option value="">{t('hrGenderNone')}</option>
        {(Object.keys(genderLabelKeys) as Gender[]).map((gender) => <option key={gender} value={gender}>{t(genderLabelKeys[gender])}</option>)}
      </select>
    </label>
    <label>{t('hrFieldBirthDate')}<input type="date" value={form.birthDate} onChange={set('birthDate')} /></label>
    <p className="form-hint">{t('hrPersonalWorkNote')}</p>
    <button type="submit">{t('hrSavePersonal')}</button>
  </form>;
}

const photoErrorKeys: Record<string, MessageKey> = { UNSUPPORTED_FILE_TYPE: 'hrPhotoWrongType', FILE_TOO_LARGE: 'hrPhotoTooLarge', INVALID_FILE_CONTENT: 'hrPhotoInvalid', FILE_INFECTED: 'hrPhotoInvalid', INVALID_PHOTO: 'hrPhotoInvalid', object_storage_not_configured: 'hrPhotoUnavailable' };

/** The person's own รูปประจำตัว: JPEG, PNG or WebP up to 2 MB. Without object storage it only says uploads are unavailable. */
export function PhotoForm({ photoUrl, initials, uploadsEnabled }: { photoUrl: string | null; initials: string; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  async function send(init: RequestInit, saved: MessageKey) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/hr/me/photo', init);
      if (response.ok) { setMessage({ kind: 'saved', text: t(saved) }); router.refresh(); return; }
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code && photoErrorKeys[code] ? photoErrorKeys[code] : 'hrPhotoFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrPhotoFailed') }); } finally { setBusy(false); }
  }
  function upload(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage({ kind: 'error', text: t('hrPhotoWrongType') }); return; }
    if (file.size > 2 * 1024 * 1024) { setMessage({ kind: 'error', text: t('hrPhotoTooLarge') }); return; }
    const body = new FormData();
    body.append('file', file);
    void send({ method: 'POST', body }, 'hrPhotoSaved');
  }
  return <section aria-label={t('hrFieldPhoto')} className="profile-form">
    <h4>{t('hrFieldPhoto')}</h4>
    {message && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>)}
    <div className="profile-photo-field">
      {photoUrl ? <img className="profile-avatar" src={photoUrl} alt={t('hrFieldPhoto')} width={72} height={72} /> : <span className="profile-avatar profile-initials" aria-hidden="true">{initials}</span>}
      {uploadsEnabled ? <>
        <label>{t('hrPhotoChoose')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        {photoUrl ? <button type="button" className="button-secondary" disabled={busy} onClick={() => void send({ method: 'DELETE' }, 'hrPhotoRemoved')}>{t('hrPhotoRemove')}</button> : null}
      </> : <p className="form-hint">{t('hrPhotoUnavailable')}</p>}
    </div>
    {uploadsEnabled ? <p className="form-hint">{busy ? t('hrPhotoUploading') : t('hrPhotoHint')}</p> : null}
  </section>;
}

export interface ContactFormValues { phone: string | null; address: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null; }

export function ContactForm({ endpoint, values }: { endpoint: string; values: ContactFormValues }) {
  const { save, feedback } = useSave(endpoint);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof ContactFormValues, string>);
  const field = (name: keyof ContactFormValues, label: MessageKey, max: number, type = 'text') => <label>{t(label)}<input type={type} value={form[name]} maxLength={max} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} /></label>;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, orNull(value)])));
  }
  return <form aria-label={t('hrEditContact')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditContact')}</h4>
    {feedback}
    {field('phone', 'hrFieldPhone', 32, 'tel')}
    <label>{t('hrFieldAddress')}<textarea value={form.address} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label>
    {field('emergencyContactName', 'hrFieldEmergencyContactName', 255)}
    {field('emergencyContactRelationship', 'hrFieldEmergencyContactRelationship', 64)}
    {field('emergencyContactPhone', 'hrFieldEmergencyContactPhone', 32, 'tel')}
    <button type="submit">{t('hrSaveContact')}</button>
  </form>;
}
