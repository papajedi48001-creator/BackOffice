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

export interface ProfileFormUnit { id: string; name: string; unitType: string | null; parentId: string | null; }

/** The names shown in the กลุ่มงาน and งาน fields for a person's current unit. */
function initialUnitNames(units: ProfileFormUnit[], organizationId: string | null, organizationName: string | null) {
  const unit = units.find((candidate) => candidate.id === organizationId);
  if (!unit) return { division: organizationId ? organizationName ?? '' : '', section: '' };
  if (unit.unitType === 'SECTION') return { division: units.find((candidate) => candidate.id === unit.parentId)?.name ?? '', section: unit.name };
  return { division: unit.name, section: '' };
}

export function ProfileForm({ personId, values, employmentTypes, units, organizationName = null }: { personId: string; values: ProfileFormValues; employmentTypes: { id: string; name: string }[]; units: ProfileFormUnit[]; organizationName?: string | null }) {
  const { save, feedback } = useSave(`/api/hr/people/${personId}/profile`);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? ''])) as Record<keyof ProfileFormValues, string>);
  const [initialUnit] = useState(() => initialUnitNames(units, values.organizationId, organizationName));
  const [unitNames, setUnitNames] = useState(initialUnit);
  const [unitError, setUnitError] = useState<string | null>(null);
  const divisions = units.filter((unit) => unit.unitType === 'DIVISION');
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
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const unit = chosenUnit();
    if (unit !== null && typeof unit === 'object') { setUnitError(t(unit.error)); return; }
    setUnitError(null);
    const { gender, ...rest } = form;
    await save({ ...Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'organizationId').map(([key, value]) => [key, orNull(value)])), gender: gender === '' ? null : gender, ...(unit === undefined ? {} : { organizationId: unit }) });
  }
  const text = (field: keyof ProfileFormValues, label: MessageKey, max: number) => <label>{t(label)}<input value={form[field]} onChange={set(field)} maxLength={max} /></label>;
  return <form aria-label={t('hrEditProfile')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditProfile')}</h4>
    {unitError ? <p role="alert" className="form-error">{unitError}</p> : feedback}
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
    <label>{t('hrDivision')}<input list={`divisions-${personId}`} value={unitNames.division} maxLength={255} placeholder={t('hrNoUnit')} onChange={(event) => setUnitNames({ division: event.target.value, section: '' })} /></label>
    <datalist id={`divisions-${personId}`}>{divisions.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
    <label>{t('hrSection')}<input list={`sections-${personId}`} value={unitNames.section} maxLength={255} onChange={(event) => setUnitNames((current) => ({ ...current, section: event.target.value }))} /></label>
    <datalist id={`sections-${personId}`}>{sections.map((unit) => <option key={unit.id} value={unit.name} />)}</datalist>
    <button type="submit">{t('hrSaveProfile')}</button>
  </form>;
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
