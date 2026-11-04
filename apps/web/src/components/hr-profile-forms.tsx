'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSectionSaved } from './section-editor';
import { genderForPrefix, type Gender } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { genderLabelKeys } from '../lib/hr-profile-labels';
import { ActionDialog } from './action-dialog';
import { FormDialog } from './form-dialog';
import { ThaiDateInput } from './thai-date-input';

const errorKeys: Record<string, MessageKey> = {
  GENDER_REQUIRED: 'hrProfileGenderRequired', INACTIVE_EMPLOYMENT_TYPE: 'hrProfileInactiveType', UNKNOWN_EMPLOYMENT_TYPE: 'hrProfileUnknownType',
  UNKNOWN_ORGANIZATION: 'hrProfileUnknownOrganization', UNKNOWN_POSITION: 'hrErrorUnknownPosition', INACTIVE_POSITION: 'hrErrorInactivePosition', LEVEL_NOT_ALLOWED: 'hrErrorLevelNotAllowed', FORBIDDEN: 'hrProfileForbidden', NOT_FOUND: 'hrPersonNotFound', invalid_input: 'hrProfileInvalid'
};
const orNull = (value: string) => value.trim() === '' ? null : value.trim();

function useSave(endpoint: string) {
  const router = useRouter();
  const sectionSaved = useSectionSaved();
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  async function save(body: unknown): Promise<boolean> {
    setMessage(null);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { setMessage({ kind: 'saved', text: t('hrProfileSaved') }); router.refresh(); sectionSaved(); return true; }
      const code = ((await response.json()) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code && errorKeys[code] ? errorKeys[code] : 'hrProfileSaveFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrProfileSaveFailed') }); }
    return false;
  }
  /** The error goes in the popup; the saved note stays on the page after the popup closes. */
  const error = message?.kind === 'error' ? message.text : null;
  const saved = message?.kind === 'saved' ? <p role="status">{message.text}</p> : null;
  const reset = (open: boolean) => { if (open) setMessage(null); };
  return { save, error, saved, reset };
}

export interface ProfileFormValues {
  namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null;
  employmentTypeId: string | null; appointedOn: string | null; positionTitle: string | null; positionLevel: string | null; organizationId: string | null;
}

export interface ProfileFormUnit { id: string; name: string; unitType: string | null; parentId: string | null; }

/** The names shown in the กลุ่มงาน and งาน fields for a person's current unit. */
function initialUnitNames(units: ProfileFormUnit[], organizationId: string | null, organizationName: string | null) {
  const unit = units.find((candidate) => candidate.id === organizationId);
  if (!unit) return { division: organizationId ? organizationName ?? '' : '', section: '' };
  if (unit.unitType === 'SECTION') return { division: units.find((candidate) => candidate.id === unit.parentId)?.name ?? '', section: unit.name };
  return { division: unit.name, section: '' };
}

export interface ProfileFormPosition { name: string; allowedLevels: readonly string[]; }

export function ProfileForm({ personId, values, employmentTypes, units, positions = [], organizationName = null, photo }: { personId: string; values: ProfileFormValues; employmentTypes: { id: string; name: string }[]; units: ProfileFormUnit[]; positions?: ProfileFormPosition[]; organizationName?: string | null; photo?: { url: string | null; uploadsEnabled: boolean } }) {
  const { save, error, saved, reset } = useSave(`/api/hr/people/${personId}/profile`);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof ProfileFormValues, string>);
  const [initialUnit] = useState(() => initialUnitNames(units, values.organizationId, organizationName));
  const [unitNames, setUnitNames] = useState(initialUnit);
  const [clientError, setClientError] = useState<string | null>(null);
  const chosenPosition = positions.find((position) => position.name === form.positionTitle.trim());
  // A unit with no type yet (from an older import) is offered alongside the กลุ่มงาน so a person can still be put in it.
  const divisions = units.filter((unit) => unit.unitType === 'DIVISION' || unit.unitType === null);
  const chosenDivision = divisions.find((unit) => unit.name === unitNames.division.trim());
  const sections = chosenDivision ? units.filter((unit) => unit.unitType === 'SECTION' && unit.parentId === chosenDivision.id) : [];
  /** The unit to save: undefined keeps the current one, null leaves the person with no unit, a MessageKey refuses the names. */
  function chosenUnit(): string | null | undefined | { error: MessageKey } {
    const division = unitNames.division.trim();
    const section = unitNames.section.trim();
    if (division === initialUnit.division.trim() && section === initialUnit.section.trim()) return undefined;
    if (division === '' && section === '') return null;
    if (!chosenDivision) return { error: 'hrErrorUnknownDivision' };
    if (section === '') return chosenDivision.id;
    return sections.find((unit) => unit.name === section)?.id ?? { error: 'hrErrorSectionNotInDivision' };
  }
  const set = (field: keyof ProfileFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  function changePrefix(event: React.ChangeEvent<HTMLInputElement>) {
    const gender = genderForPrefix(event.target.value);
    setForm((current) => ({ ...current, namePrefix: event.target.value, gender: gender ?? current.gender }));
  }
  /** An older title or level that is left untouched is kept; anything changed must match the catalogue (ก.พ. structure). */
  function checkPosition(): MessageKey | null {
    const title = form.positionTitle.trim();
    const level = form.positionLevel.trim();
    const titleChanged = title !== (values.positionTitle ?? '');
    const levelChanged = level !== (values.positionLevel ?? '');
    if (titleChanged && title !== '' && !chosenPosition) return 'hrErrorUnknownPosition';
    if ((titleChanged || levelChanged) && chosenPosition && level !== '' && !chosenPosition.allowedLevels.includes(level)) return 'hrErrorLevelNotAllowed';
    return null;
  }
  function changePosition(event: React.ChangeEvent<HTMLInputElement>) {
    const next = positions.find((position) => position.name === event.target.value.trim());
    // Back on the person's own position, their level comes back; a level the new position does not allow is cleared.
    const back = event.target.value.trim() === (values.positionTitle ?? '');
    setForm((current) => ({ ...current, positionTitle: event.target.value, positionLevel: back ? values.positionLevel ?? '' : next && !next.allowedLevels.includes(current.positionLevel) ? '' : current.positionLevel }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const positionError = checkPosition();
    if (positionError) { setClientError(t(positionError)); return false; }
    const unit = chosenUnit();
    if (unit !== null && typeof unit === 'object') { setClientError(t(unit.error)); return false; }
    setClientError(null);
    if (photoFile || (removePhoto && photo?.url)) {
      try {
        const body = photoFile ? (() => { const data = new FormData(); data.append('file', photoFile); return data; })() : null;
        const response = await fetch(`/api/hr/people/${personId}/photo`, body ? { method: 'POST', body } : { method: 'DELETE' });
        if (!response.ok) {
          const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
          setClientError(t(code && photoErrorKeys[code] ? photoErrorKeys[code] : 'hrPhotoFailed'));
          return false;
        }
      } catch { setClientError(t('hrPhotoFailed')); return false; }
    }
    const { gender, ...rest } = form;
    return save({ ...Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'organizationId').map(([key, value]) => [key, orNull(value)])), gender: gender === '' ? null : gender, ...(unit === undefined ? {} : { organizationId: unit }) });
  }
  function choosePhoto(chosen: File | undefined) {
    setClientError(null); setPhotoFile(null); setPhotoPreview(null);
    if (!chosen) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) { setClientError(t('hrPhotoWrongType')); return; }
    if (chosen.size > 2 * 1024 * 1024) { setClientError(t('hrPhotoTooLarge')); return; }
    setPhotoFile(chosen); setRemovePhoto(false);
    if (typeof URL.createObjectURL === 'function') setPhotoPreview(URL.createObjectURL(chosen));
  }
  const text = (field: keyof ProfileFormValues, label: MessageKey, max: number) => <label>{t(label)}<input value={form[field]} onChange={set(field)} maxLength={max} /></label>;
  return <div className="profile-form">{saved}<FormDialog triggerLabel={t('hrEditSection')} triggerAriaLabel={t('hrEditProfile')} triggerClassName="button-secondary section-edit" title={t('hrEditProfile')} submitLabel={t('hrSaveProfile')} wide error={clientError ?? error} onOpenChange={(open) => { reset(open); setClientError(null); setPhotoFile(null); setRemovePhoto(false); setPhotoPreview(null); }} onSubmit={submit}>
    {photo ? <div className="profile-photo-field">
      {photoPreview ?? (removePhoto ? null : photo.url) ? <img className="profile-avatar" src={(photoPreview ?? photo.url)!} alt={t('hrFieldPhoto')} width={72} height={72} /> : <span className="profile-avatar profile-initials" aria-hidden="true">{(values.firstName ?? '').slice(0, 1)}</span>}
      {photo.uploadsEnabled ? <div>
        <label>{t('hrPhotoChoose')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label>
        <p className="form-hint">{t('hrPhotoHint')}</p>
        {photo.url && !photoFile ? <label className="checkbox"><input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} />{t('hrPhotoRemove')}</label> : null}
      </div> : <p className="form-hint">{t('hrPhotoUnavailable')}</p>}
    </div> : null}
    <label>{t('hrFieldNamePrefix')}<input value={form.namePrefix} onChange={changePrefix} maxLength={32} /></label>
    {text('firstName', 'hrFieldFirstName', 120)}
    {text('lastName', 'hrFieldLastName', 120)}
    <label>{t('hrFieldGender')}
      <select value={form.gender} onChange={set('gender')}>
        <option value="">{t('hrGenderNone')}</option>
        {(Object.keys(genderLabelKeys) as Gender[]).map((gender) => <option key={gender} value={gender}>{t(genderLabelKeys[gender])}</option>)}
      </select>
    </label>
    <label>{t('hrFieldBirthDate')}<ThaiDateInput value={form.birthDate} onChange={(value) => setForm((current) => ({ ...current, ['birthDate']: value }))} /></label>
    <label>{t('hrFieldEmploymentType')}
      <select value={form.employmentTypeId} onChange={set('employmentTypeId')}>
        <option value="">{t('notAssigned')}</option>
        {employmentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </label>
    <label>{t('hrFieldAppointedOn')}<ThaiDateInput value={form.appointedOn} onChange={(value) => setForm((current) => ({ ...current, ['appointedOn']: value }))} /></label>
    <label>{t('hrFieldPositionTitle')}<input list={`positions-${personId}`} value={form.positionTitle} maxLength={255} onChange={changePosition} /></label>
    <datalist id={`positions-${personId}`}>{positions.map((position) => <option key={position.name} value={position.name} />)}</datalist>
    <label>{t('hrFieldPositionLevel')}<input list={`levels-${personId}`} value={form.positionLevel} maxLength={120} onChange={set('positionLevel')} /></label>
    <datalist id={`levels-${personId}`}>{(chosenPosition?.allowedLevels ?? []).map((level) => <option key={level} value={level} />)}</datalist>
    <label>{t('hrDivision')}<input list={`divisions-${personId}`} value={unitNames.division} maxLength={255} placeholder={t('hrNoUnit')} onChange={(event) => setUnitNames({ division: event.target.value, section: '' })} /></label>
    <datalist id={`divisions-${personId}`}>{divisions.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
    <label>{t('hrSection')}<input list={`sections-${personId}`} value={unitNames.section} maxLength={255} onChange={(event) => setUnitNames((current) => ({ ...current, section: event.target.value }))} /></label>
    <datalist id={`sections-${personId}`}>{sections.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
  </FormDialog></div>;
}

export interface PersonalFormValues { namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null; }

/** The person's own ข้อมูลส่วนตัว. Work fields are not in this form; the server refuses them too. */
export function PersonalForm({ endpoint, values }: { endpoint: string; values: PersonalFormValues }) {
  const { save, error, saved, reset } = useSave(endpoint);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof PersonalFormValues, string>);
  const set = (field: keyof PersonalFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  function changePrefix(event: React.ChangeEvent<HTMLInputElement>) {
    const gender = genderForPrefix(event.target.value);
    setForm((current) => ({ ...current, namePrefix: event.target.value, gender: gender ?? current.gender }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { gender, ...rest } = form;
    return save({ ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, orNull(value)])), gender: gender === '' ? null : gender });
  }
  return <div className="profile-form">{saved}<FormDialog triggerLabel={t('hrEditSection')} triggerAriaLabel={t('hrEditPersonal')} triggerClassName="button-secondary section-edit" title={t('hrEditPersonal')} submitLabel={t('hrSavePersonal')} error={error} onOpenChange={reset} onSubmit={submit}>
    <label>{t('hrFieldNamePrefix')}<input value={form.namePrefix} onChange={changePrefix} maxLength={32} /></label>
    <label>{t('hrFieldFirstName')}<input value={form.firstName} onChange={set('firstName')} maxLength={120} /></label>
    <label>{t('hrFieldLastName')}<input value={form.lastName} onChange={set('lastName')} maxLength={120} /></label>
    <label>{t('hrFieldGender')}
      <select value={form.gender} onChange={set('gender')}>
        <option value="">{t('hrGenderNone')}</option>
        {(Object.keys(genderLabelKeys) as Gender[]).map((gender) => <option key={gender} value={gender}>{t(genderLabelKeys[gender])}</option>)}
      </select>
    </label>
    <label>{t('hrFieldBirthDate')}<ThaiDateInput value={form.birthDate} onChange={(value) => setForm((current) => ({ ...current, ['birthDate']: value }))} /></label>
    <p className="form-hint">{t('hrPersonalWorkNote')}</p>
  </FormDialog></div>;
}

const photoErrorKeys: Record<string, MessageKey> = { UNSUPPORTED_FILE_TYPE: 'hrPhotoWrongType', FILE_TOO_LARGE: 'hrPhotoTooLarge', INVALID_FILE_CONTENT: 'hrPhotoInvalid', FILE_INFECTED: 'hrPhotoInvalid', INVALID_PHOTO: 'hrPhotoInvalid', object_storage_not_configured: 'hrPhotoUnavailable' };

/** The person's own รูปประจำตัว: JPEG, PNG or WebP up to 2 MB. Without object storage it only says uploads are unavailable. */
export function PhotoForm({ photoUrl, initials, uploadsEnabled }: { photoUrl: string | null; initials: string; uploadsEnabled: boolean }) {
  const router = useRouter();
  const sectionSaved = useSectionSaved();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dialog, setDialog] = useState<'upload' | 'remove' | null>(null);
  async function send(init: RequestInit, saved: MessageKey): Promise<boolean> {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/hr/me/photo', init);
      if (response.ok) { setMessage({ kind: 'saved', text: t(saved) }); router.refresh(); sectionSaved(); return true; }
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code && photoErrorKeys[code] ? photoErrorKeys[code] : 'hrPhotoFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrPhotoFailed') }); } finally { setBusy(false); }
    return false;
  }
  function choose(chosen: File | undefined) {
    setMessage(null);
    setFile(null);
    if (!chosen) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) { setMessage({ kind: 'error', text: t('hrPhotoWrongType') }); return; }
    if (chosen.size > 2 * 1024 * 1024) { setMessage({ kind: 'error', text: t('hrPhotoTooLarge') }); return; }
    setFile(chosen);
  }
  async function upload() {
    if (!file) return false;
    const body = new FormData();
    body.append('file', file);
    const saved = await send({ method: 'POST', body }, 'hrPhotoSaved');
    if (saved) setFile(null);
    return saved;
  }
  const open = (next: 'upload' | 'remove' | null) => { setMessage(null); setFile(null); setDialog(next); };
  const error = message?.kind === 'error' ? message.text : null;
  return <section aria-label={t('hrFieldPhoto')} className="profile-form">
    <h4>{t('hrFieldPhoto')}</h4>
    {message && !dialog && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>)}
    <div className="profile-photo-field">
      {photoUrl ? <img className="profile-avatar" src={photoUrl} alt={t('hrFieldPhoto')} width={72} height={72} /> : <span className="profile-avatar profile-initials" aria-hidden="true">{initials}</span>}
      {uploadsEnabled ? <>
        <FormDialog triggerLabel={t('hrPhotoChange')} title={t('hrPhotoChange')} submitLabel={t('hrPhotoUpload')} open={dialog === 'upload'} onOpenChange={(next) => (next ? open('upload') : setDialog(null))} isSubmitting={busy} ready={file !== null} error={error} onSubmit={upload}>
          <label>{t('hrPhotoChoose')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(event.target.files?.[0])} /></label>
          <p className="form-hint">{busy ? t('hrPhotoUploading') : t('hrPhotoHint')}</p>
        </FormDialog>
        {photoUrl ? <button type="button" className="button-secondary" disabled={busy} onClick={() => open('remove')}>{t('hrPhotoRemove')}</button> : null}
      </> : <p className="form-hint">{t('hrPhotoUnavailable')}</p>}
    </div>
    {dialog === 'remove' && <ActionDialog title={t('hrPhotoRemove')} confirmLabel={t('hrPhotoRemove')} tone="danger" isSubmitting={busy} error={error}
      onConfirm={() => void send({ method: 'DELETE' }, 'hrPhotoRemoved').then((done) => { if (done) setDialog(null); })} onClose={() => setDialog(null)} />}
  </section>;
}

export interface ContactFormValues { phone: string | null; address: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null; }

export function ContactForm({ endpoint, values }: { endpoint: string; values: ContactFormValues }) {
  const { save, error, saved, reset } = useSave(endpoint);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof ContactFormValues, string>);
  const field = (name: keyof ContactFormValues, label: MessageKey, max: number, type = 'text') => <label>{t(label)}<input type={type} value={form[name]} maxLength={max} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} /></label>;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    return save(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, orNull(value)])));
  }
  return <div className="profile-form">{saved}<FormDialog triggerLabel={t('hrEditSection')} triggerAriaLabel={t('hrEditContact')} triggerClassName="button-secondary section-edit" title={t('hrEditContact')} submitLabel={t('hrSaveContact')} error={error} onOpenChange={reset} onSubmit={submit}>
    {field('phone', 'hrFieldPhone', 32, 'tel')}
    <label>{t('hrFieldAddress')}<textarea value={form.address} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label>
    {field('emergencyContactName', 'hrFieldEmergencyContactName', 255)}
    {field('emergencyContactRelationship', 'hrFieldEmergencyContactRelationship', 64)}
    {field('emergencyContactPhone', 'hrFieldEmergencyContactPhone', 32, 'tel')}
  </FormDialog></div>;
}
