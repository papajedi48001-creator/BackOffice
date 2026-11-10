'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MciGender } from '@backoffice/contracts';
import { FormDialog } from '../../../../components/form-dialog';
import { MCI_GENDERS, mciGenderLabel, mciText, sendMci } from '../../../../lib/mci-labels';

export interface MciPatientOptions {
  zones: ReadonlyArray<{ id: string; name: string }>;
  triageLevels: ReadonlyArray<{ id: string; name: string; colorHex: string }>;
  statuses: ReadonlyArray<{ id: string; name: string; needsDestination: boolean }>;
}
export interface MciPatientValues {
  id: string; tag: string; triageLevelId: string; statusId: string; zoneId: string; destinationHospital: string;
  firstName: string; lastName: string; gender: MciGender; ageEstimate: number | null; hn: string; publicHidden: boolean;
}

/**
 * บันทึกผู้ป่วยใหม่ (no `patient`: colour and zone first, the name can follow) or แก้ไข one casualty. The destination field shows
 * only for a status that needs one; "ไม่เปิดเผยบนกระดานสาธารณะ" only for a ผู้บัญชาการเหตุ (`canHide`). The server checks both again.
 */
export function PatientForm({ options, defaultZoneId, canHide, patient }: { options: MciPatientOptions; defaultZoneId?: string | null; canHide: boolean; patient?: MciPatientValues }) {
  const router = useRouter();
  const editing = Boolean(patient);
  const title = patient ? `แก้ไข ${patient.tag}` : mciText.newPatient;
  const blank = () => ({
    triageLevelId: patient?.triageLevelId ?? '', statusId: patient?.statusId ?? '', zoneId: patient?.zoneId ?? defaultZoneId ?? options.zones[0]?.id ?? '',
    destinationHospital: patient?.destinationHospital ?? '', firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '',
    gender: patient?.gender ?? 'UNKNOWN' as MciGender, age: patient?.ageEstimate == null ? '' : String(patient.ageEstimate), hn: patient?.hn ?? '', publicHidden: patient?.publicHidden ?? false
  });
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [lastTag, setLastTag] = useState<string | null>(null);
  const ids = useId();
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setValues((current) => ({ ...current, [key]: value }));
  const status = options.statuses.find((entry) => entry.id === values.statusId);
  const needsDestination = editing && Boolean(status?.needsDestination);
  const ready = values.triageLevelId !== '' && values.zoneId !== '' && (!editing || values.statusId !== '') && (!needsDestination || values.destinationHospital.trim() !== '');

  async function submit(): Promise<boolean> {
    setError(null);
    const identity = { firstName: values.firstName, lastName: values.lastName, gender: values.gender, ageEstimate: values.age === '' ? null : Number(values.age), hn: values.hn };
    const body = patient
      ? { triageLevelId: values.triageLevelId, statusId: values.statusId, zoneId: values.zoneId, destinationHospital: needsDestination ? values.destinationHospital : '', ...identity, publicHidden: canHide ? values.publicHidden : patient.publicHidden }
      : { triageLevelId: values.triageLevelId, zoneId: values.zoneId, ...identity };
    const { error: failure, result } = await sendMci(patient ? `/api/mci/patients/${encodeURIComponent(patient.id)}` : '/api/mci/patients', patient ? 'PUT' : 'POST', body);
    if (failure) { setError(failure); return false; }
    if (!patient) { setLastTag(typeof result.tag === 'string' ? result.tag : null); setValues(blank()); }
    router.refresh();
    return true;
  }

  return <div className="mci-patient-form">
    <FormDialog title={title} triggerLabel={title} triggerClassName={editing ? 'button-secondary' : 'mci-primary-action'} submitLabel={mciText.save} wide ready={ready} error={error}
      onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
      <fieldset className="mci-triage-picker">
        <legend>{mciText.triage}</legend>
        {options.triageLevels.map((level) => <label key={level.id} className="mci-triage-option" style={{ '--triage': level.colorHex } as React.CSSProperties}>
          <input type="radio" name={`${ids}-triage`} value={level.id} checked={values.triageLevelId === level.id} required onChange={() => set('triageLevelId', level.id)} />
          <span className="mci-triage-swatch" aria-hidden="true" />{level.name}
        </label>)}
      </fieldset>
      <div className="mci-form-grid">
        <label htmlFor={`${ids}-zone`}>{mciText.zone}</label>
        <select id={`${ids}-zone`} value={values.zoneId} required onChange={(event) => set('zoneId', event.target.value)}>
          {options.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
        {editing && <>
          <label htmlFor={`${ids}-status`}>{mciText.status}</label>
          <select id={`${ids}-status`} value={values.statusId} required onChange={(event) => set('statusId', event.target.value)}>
            {options.statuses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </>}
        {needsDestination && <>
          <label htmlFor={`${ids}-destination`}>{mciText.destination}</label>
          <input id={`${ids}-destination`} value={values.destinationHospital} maxLength={200} required onChange={(event) => set('destinationHospital', event.target.value)} />
        </>}
        <label htmlFor={`${ids}-first`}>{mciText.firstName}</label>
        <input id={`${ids}-first`} value={values.firstName} maxLength={120} autoComplete="off" onChange={(event) => set('firstName', event.target.value)} />
        <label htmlFor={`${ids}-last`}>{mciText.lastName}</label>
        <input id={`${ids}-last`} value={values.lastName} maxLength={120} autoComplete="off" onChange={(event) => set('lastName', event.target.value)} />
        <label htmlFor={`${ids}-gender`}>{mciText.gender}</label>
        <select id={`${ids}-gender`} value={values.gender} onChange={(event) => set('gender', event.target.value as MciGender)}>
          {MCI_GENDERS.map((gender) => <option key={gender} value={gender}>{mciGenderLabel(gender)}</option>)}
        </select>
        <label htmlFor={`${ids}-age`}>{mciText.age}</label>
        <input id={`${ids}-age`} type="number" inputMode="numeric" min={0} max={130} step={1} value={values.age} onChange={(event) => set('age', event.target.value)} />
        <label htmlFor={`${ids}-hn`}>{mciText.hn}</label>
        <input id={`${ids}-hn`} value={values.hn} maxLength={20} autoComplete="off" onChange={(event) => set('hn', event.target.value)} />
      </div>
      {editing && canHide && <label>
        <input type="checkbox" checked={values.publicHidden} onChange={(event) => set('publicHidden', event.target.checked)} /> {mciText.publicHidden}
      </label>}
    </FormDialog>
    {lastTag && <p className="mci-new-tag" role="status"><span>{mciText.newTag}</span> <strong>{lastTag}</strong> <small>{mciText.newTagHint}</small></p>}
  </div>;
}
