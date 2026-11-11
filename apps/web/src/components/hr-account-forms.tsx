'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { genderForPrefix, type Gender } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { genderLabelKeys } from '../lib/hr-profile-labels';
import type { ProfileFormPosition, ProfileFormUnit } from './hr-profile-forms';
import { ActionDialog } from './action-dialog';
import { FormDialog } from './form-dialog';
import { NewPasswordField, passwordProblem } from './new-password-field';

const submitProblem = (password: string, confirm: string): MessageKey | null => passwordProblem(password, confirm) ?? (password === confirm ? null : 'hrPasswordMismatch');

const errorKeys: Record<string, MessageKey> = {
  DUPLICATE_NATIONAL_ID: 'hrErrorDuplicateNationalId', DUPLICATE_EMPLOYEE_CODE: 'hrErrorDuplicateEmployeeCode', DUPLICATE_USERNAME: 'hrErrorDuplicateUsername',
  ACCOUNT_EXISTS: 'hrErrorAccountExists', NO_ACCOUNT: 'hrErrorNoAccount', PROTECTED_ACCOUNT: 'hrErrorProtectedAccount', GENDER_REQUIRED: 'hrProfileGenderRequired', INACTIVE_EMPLOYMENT_TYPE: 'hrProfileInactiveType',
  UNKNOWN_EMPLOYMENT_TYPE: 'hrProfileUnknownType', UNKNOWN_ORGANIZATION: 'hrProfileUnknownOrganization', UNKNOWN_POSITION: 'hrErrorUnknownPosition',
  INACTIVE_POSITION: 'hrErrorInactivePosition', LEVEL_NOT_ALLOWED: 'hrErrorLevelNotAllowed', FORBIDDEN: 'hrProfileForbidden', NOT_FOUND: 'hrPersonNotFound', invalid_input: 'hrErrorPersonInvalid'
};
/** Same rule as the server: English letters, digits, dot, underscore and dash. */
const USERNAME_PATTERN = '[A-Za-z0-9._\\-]{3,64}';
const orNull = (value: string) => value.trim() === '' ? null : value.trim();
type Message = { kind: 'error' | 'saved'; text: string } | null;
const feedbackOf = (message: Message) => message && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>);

/** Sends JSON and turns the answer into a message. Never puts what was typed into the message. */
async function send(endpoint: string, method: string, body: unknown): Promise<{ ok: true; id?: string } | { ok: false; text: string }> {
  try {
    const response = await fetch(endpoint, body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const answer = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (response.ok) return { ok: true, ...(answer.id ? { id: answer.id } : {}) };
    return { ok: false, text: t(answer.error && errorKeys[answer.error] ? errorKeys[answer.error] : 'hrProfileSaveFailed') };
  } catch { return { ok: false, text: t('hrProfileSaveFailed') }; }
}

const fields = ['nationalId', 'employeeCode', 'namePrefix', 'firstName', 'lastName', 'gender', 'birthDate', 'phone', 'employmentTypeId', 'appointedOn', 'positionTitle', 'positionLevel', 'division', 'section', 'username', 'password'] as const;
type NewPersonField = typeof fields[number];

/** HR's form for a new บุคลากร with their บัญชีผู้ใช้. The server checks everything again. */
export function NewPersonForm({ employmentTypes, units, positions }: { employmentTypes: { id: string; name: string }[]; units: ProfileFormUnit[]; positions: ProfileFormPosition[] }) {
  const router = useRouter();
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => [field, ''])) as Record<NewPersonField, string>);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const chosenPosition = positions.find((position) => position.name === form.positionTitle.trim());
  const divisions = units.filter((unit) => unit.unitType === 'DIVISION' || unit.unitType === null);
  const chosenDivision = divisions.find((unit) => unit.name === form.division.trim());
  const sections = chosenDivision ? units.filter((unit) => unit.unitType === 'SECTION' && unit.parentId === chosenDivision.id) : [];
  const set = (field: NewPersonField) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  function changePrefix(event: React.ChangeEvent<HTMLInputElement>) {
    const gender = genderForPrefix(event.target.value);
    setForm((current) => ({ ...current, namePrefix: event.target.value, gender: gender ?? current.gender }));
  }
  function changePosition(event: React.ChangeEvent<HTMLInputElement>) {
    const next = positions.find((position) => position.name === event.target.value.trim());
    setForm((current) => ({ ...current, positionTitle: event.target.value, positionLevel: next && !next.allowedLevels.includes(current.positionLevel) ? '' : current.positionLevel }));
  }
  /** The unit to save, or the reason the typed names do not name one. */
  function chosenUnit(): string | null | { error: MessageKey } {
    const division = form.division.trim();
    const section = form.section.trim();
    if (division === '' && section === '') return null;
    if (!chosenDivision) return { error: 'hrErrorUnknownDivision' };
    if (section === '') return chosenDivision.id;
    return sections.find((unit) => unit.name === section)?.id ?? { error: 'hrErrorSectionNotInDivision' };
  }
  function checkPosition(): MessageKey | null {
    if (form.positionTitle.trim() !== '' && !chosenPosition) return 'hrErrorUnknownPosition';
    if (chosenPosition && form.positionLevel.trim() !== '' && !chosenPosition.allowedLevels.includes(form.positionLevel.trim())) return 'hrErrorLevelNotAllowed';
    return null;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const passwordError = submitProblem(form.password, confirmPassword);
    if (passwordError) { setMessage({ kind: 'error', text: t(passwordError) }); return; }
    const positionError = checkPosition();
    if (positionError) { setMessage({ kind: 'error', text: t(positionError) }); return; }
    const unit = chosenUnit();
    if (unit !== null && typeof unit === 'object') { setMessage({ kind: 'error', text: t(unit.error) }); return; }
    setMessage(null);
    setBusy(true);
    const { gender, username, password, ...rest } = form;
    const optional = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'division' && key !== 'section').map(([key, value]) => [key, orNull(value)]).filter(([, value]) => value !== null));
    const result = await send('/api/hr/people', 'POST', { ...optional, ...(gender === '' ? {} : { gender }), ...(unit === null ? {} : { organizationId: unit }), username: username.trim(), password });
    setBusy(false);
    if (result.ok && result.id) { router.push(`/hr/people/${result.id}`); return; }
    setMessage({ kind: 'error', text: result.ok ? t('hrProfileSaveFailed') : result.text });
  }
  const text = (field: NewPersonField, label: MessageKey, max: number, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label>{t(label)}<input value={form[field]} onChange={set(field)} maxLength={max} {...extra} /></label>;
  return <form aria-label={t('hrNewPersonTitle')} className="profile-form" onSubmit={submit}>
    {feedbackOf(message)}
    {text('nationalId', 'nationalIdLabel', 17, { required: true, inputMode: 'numeric', autoComplete: 'off' })}
    {text('employeeCode', 'employeeCode', 32)}
    <label>{t('hrFieldNamePrefix')}<input value={form.namePrefix} onChange={changePrefix} maxLength={32} /></label>
    {text('firstName', 'hrFieldFirstName', 120, { required: true })}
    {text('lastName', 'hrFieldLastName', 120, { required: true })}
    <label>{t('hrFieldGender')}
      <select value={form.gender} onChange={set('gender')}>
        <option value="">{t('hrGenderNone')}</option>
        {(Object.keys(genderLabelKeys) as Gender[]).map((gender) => <option key={gender} value={gender}>{t(genderLabelKeys[gender])}</option>)}
      </select>
    </label>
    {text('birthDate', 'hrFieldBirthDate', 10, { type: 'date' })}
    {text('phone', 'hrFieldPhone', 32, { type: 'tel' })}
    <label>{t('hrFieldEmploymentType')}
      <select value={form.employmentTypeId} onChange={set('employmentTypeId')}>
        <option value="">{t('notAssigned')}</option>
        {employmentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </label>
    {text('appointedOn', 'hrFieldAppointedOn', 10, { type: 'date' })}
    <label>{t('hrFieldPositionTitle')}<input list="new-person-positions" value={form.positionTitle} maxLength={255} onChange={changePosition} /></label>
    <datalist id="new-person-positions">{positions.map((position) => <option key={position.name} value={position.name} />)}</datalist>
    {text('positionLevel', 'hrFieldPositionLevel', 120, { list: 'new-person-levels' })}
    <datalist id="new-person-levels">{(chosenPosition?.allowedLevels ?? []).map((level) => <option key={level} value={level} />)}</datalist>
    <label>{t('hrDivision')}<input list="new-person-divisions" value={form.division} maxLength={255} placeholder={t('hrNoUnit')} onChange={(event) => setForm((current) => ({ ...current, division: event.target.value, section: '' }))} /></label>
    <datalist id="new-person-divisions">{divisions.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
    {text('section', 'hrSection', 255, { list: 'new-person-sections' })}
    <datalist id="new-person-sections">{sections.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
    <h4>{t('hrAccountTitle')}</h4>
    {text('username', 'hrFieldUsername', 64, { required: true, autoComplete: 'off', pattern: USERNAME_PATTERN })}
    <p className="form-hint">{t('hrUsernameFixed')}</p>
    <NewPasswordField label="hrFieldPassword" value={form.password} confirm={confirmPassword} onChange={(password) => setForm((current) => ({ ...current, password }))} onConfirmChange={setConfirmPassword} />
    <p className="form-hint">{t('hrPasswordHint')}</p>
    <button type="submit" disabled={busy}>{t('hrCreatePerson')}</button>
  </form>;
}

/** รหัสบุคลากร, สถานะ and เลขประจำตัวประชาชน. The username is shown but never sent: it does not change. */
export function IdentityForm({ personId, values, username }: { personId: string; values: { employeeCode: string | null; employmentStatus: string }; username: string | null }) {
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState(values.employeeCode ?? '');
  const [employmentStatus, setEmploymentStatus] = useState(values.employmentStatus);
  const [nationalId, setNationalId] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    const body = { employeeCode: orNull(employeeCode), employmentStatus, ...(nationalId.trim() === '' ? {} : { nationalId: nationalId.trim() }) };
    const result = await send(`/api/hr/people/${personId}/identity`, 'PUT', body);
    setBusy(false);
    if (!result.ok) { setMessage({ kind: 'error', text: result.text }); return; }
    setNationalId('');
    setMessage({ kind: 'saved', text: t('hrProfileSaved') });
    router.refresh();
  }
  return <form aria-label={t('hrEditIdentity')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditIdentity')}</h4>
    {feedbackOf(message)}
    {username ? <><label>{t('hrFieldUsername')}<input value={username} readOnly /></label><p className="form-hint">{t('hrUsernameFixed')}</p></> : null}
    <label>{t('employeeCode')}<input value={employeeCode} maxLength={32} onChange={(event) => setEmployeeCode(event.target.value)} /></label>
    <label>{t('employmentStatus')}
      <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)}>
        <option value="ACTIVE">{t('employmentActive')}</option>
        <option value="INACTIVE">{t('employmentInactive')}</option>
      </select>
    </label>
    <label>{t('hrNewNationalId')}<input value={nationalId} maxLength={17} inputMode="numeric" autoComplete="off" onChange={(event) => setNationalId(event.target.value)} /></label>
    <p className="form-hint">{t('hrNewNationalIdHint')}</p>
    <button type="submit" disabled={busy}>{t('hrSaveIdentity')}</button>
  </form>;
}

/** บัญชีผู้ใช้ on a person's page: HR or a ผู้ดูแลระบบ resets the password (never sets one), or adds an account for a person who has none. */
export function AccountForm({ personId, username, self = false }: { personId: string; username: string | null; self?: boolean }) {
  const router = useRouter();
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  async function reset(): Promise<boolean> {
    setMessage(null);
    const result = await send(`/api/hr/people/${personId}/password`, 'POST', undefined);
    setMessage(result.ok ? { kind: 'saved', text: t('passwordResetDone') } : { kind: 'error', text: result.text });
    return true;
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const passwordError = submitProblem(password, confirm);
    if (passwordError) { setMessage({ kind: 'error', text: t(passwordError) }); return; }
    setMessage(null);
    setBusy(true);
    const result = await send(`/api/hr/people/${personId}/account`, 'POST', { username: newUsername.trim(), password });
    setBusy(false);
    if (!result.ok) { setMessage({ kind: 'error', text: result.text }); return; }
    setPassword('');
    setConfirm('');
    setMessage({ kind: 'saved', text: t('hrProfileSaved') });
    router.refresh();
  }
  if (username) return <section aria-label={t('hrAccountTitle')} className="profile-form">
    <h4>{t('hrAccountTitle')}</h4>
    {feedbackOf(message)}
    {self
      ? <><p className="form-hint">{t('passwordOwnOnly')}</p><Link className="button-link" href="/change-password">{t('passwordChangeTitle')}</Link></>
      : <FormDialog triggerLabel={t('passwordResetButton')} triggerClassName="button-secondary" title={t('passwordResetButton')} submitLabel={t('passwordResetButton')} tone="danger" onSubmit={reset}>
          <p>{t('passwordResetConfirm')}</p>
        </FormDialog>}
  </section>;
  return <form aria-label={t('hrAccountTitle')} className="profile-form" onSubmit={create}>
    <h4>{t('hrAccountTitle')}</h4>
    {feedbackOf(message)}
    <p>{t('hrNoAccount')}</p>
    <label>{t('hrFieldUsername')}<input value={newUsername} required maxLength={64} pattern={USERNAME_PATTERN} autoComplete="off" onChange={(event) => setNewUsername(event.target.value)} /></label>
    <NewPasswordField label="hrFieldPassword" value={password} confirm={confirm} onChange={setPassword} onConfirmChange={setConfirm} />
    <p className="form-hint">{t('hrUsernameFixed')} {t('passwordFirstLoginNote')}</p>
    <button type="submit" disabled={busy}>{t('hrCreateAccount')}</button>
  </form>;
}

/** ลบบุคลากร: a danger confirmation; the server decides who may delete whom. */
export function DeletePersonButton({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const result = await send(`/api/hr/people/${personId}`, 'DELETE', undefined);
    setBusy(false);
    if (result.ok) { setOpen(false); router.push('/hr/people'); router.refresh(); return; }
    setError(result.text === t('hrErrorProtectedAccount') ? t('hrDeletePersonProtected') : result.text);
  }
  return <>
    <button type="button" className="button-danger" onClick={() => { setError(null); setOpen(true); }}>{t('hrDeletePerson')}</button>
    {open && <ActionDialog title={t('hrDeletePerson')} message={t('hrDeletePersonConfirm').replace('{name}', name)} confirmLabel={t('hrDeletePerson')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
