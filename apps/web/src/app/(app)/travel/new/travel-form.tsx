'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { AttachmentField, type AttachedFile } from '../../../../components/attachment-field';
import { TRAVEL_COST_ITEMS, TRAVEL_FUNDING, TRAVEL_TYPES, TRAVEL_VEHICLES, costItemName, formatBaht, travelErrorMessage, travelFundingLabel, travelTypeLabel, travelVehicleLabel, type TravelCostItem } from '../../../../lib/travel-labels';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { endFollowingStart } from '../../../../lib/date-range';

export interface TravelPerson { personId: string; displayName: string | null; organizationName: string | null }
export interface TravelFormValues {
  subject: string; organiser: string; place: string; province: string; travelType: string; vehicle: string;
  invitationNumber: string; invitationDate: string; invitationIssuer: string; costFunding: Record<TravelCostItem, string>;
  startDate: string; endDate: string; startHalf: 'FULL' | 'AFTERNOON'; endHalf: 'FULL' | 'MORNING';
  costAllowance: string; costLodging: string; costTransport: string; costRegistration: string;
}

const empty: TravelFormValues = { subject: '', organiser: '', place: '', province: '', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', invitationNumber: '', invitationDate: '', invitationIssuer: '', costFunding: { allowance: 'HOSPITAL_FUND', lodging: 'HOSPITAL_FUND', transport: 'HOSPITAL_FUND', registration: 'HOSPITAL_FUND' }, startDate: '', endDate: '', startHalf: 'FULL', endHalf: 'FULL', costAllowance: '', costLodging: '', costTransport: '', costRegistration: '' };
const costFields = TRAVEL_COST_ITEMS.map(([item, key]) => [`cost${item[0]!.toUpperCase()}${item.slice(1)}` as 'costAllowance' | 'costLodging' | 'costTransport' | 'costRegistration', key, item] as const);
const amount = (value: string) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const label = (person: TravelPerson) => person.displayName ?? '—';

/** Files a คำขอไปราชการ, or with `travelId` edits and resubmits a returned one. The หัวหน้าคณะ is fixed first; people cannot change on an edit. */
export function TravelForm({ leader, travelId, initial, fixedMembers, attachments = false, initialAttachment = null }: { leader: TravelPerson; travelId?: string; initial?: TravelFormValues; fixedMembers?: TravelPerson[]; attachments?: boolean; initialAttachment?: AttachedFile | null }) {
  const router = useRouter();
  const [form, setForm] = useState<TravelFormValues>(initial ?? empty);
  const [others, setOthers] = useState<TravelPerson[]>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<TravelPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<AttachedFile | null>(initialAttachment);
  const people = fixedMembers ?? [leader, ...others];

  useEffect(() => {
    const text = search.trim();
    if (fixedMembers || text.length === 0) { setFound(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      void fetch(`/api/travel/people?q=${encodeURIComponent(text)}`)
        .then(async (response) => { if (current && response.ok) setFound(((await response.json()) as { people: TravelPerson[] }).people); })
        .catch(() => undefined);
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [search, fixedMembers]);

  const total = costFields.reduce((sum, [field]) => sum + amount(form[field]), 0);
  const set = (patch: Partial<TravelFormValues>) => setForm({ ...form, ...patch });
  const oneDay = form.startDate !== '' && form.startDate === form.endDate;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = {
      subject: form.subject.trim(), organiser: form.organiser.trim(), place: form.place.trim(), province: form.province.trim(), travelType: form.travelType, vehicle: form.vehicle,
      invitationNumber: form.invitationNumber.trim() || null, invitationDate: form.invitationDate || null, invitationIssuer: form.invitationIssuer.trim() || null, costFunding: form.costFunding,
      startDate: form.startDate, endDate: form.endDate, startHalf: form.startHalf, endHalf: form.endHalf,
      ...Object.fromEntries(costFields.map(([field]) => [field, amount(form[field])])),
      memberPersonIds: travelId ? [] : others.map((person) => person.personId),
      ...(attachments ? { attachmentId: file?.attachmentId ?? null } : {})
    };
    try {
      const response = await fetch(travelId ? `/api/travel/${encodeURIComponent(travelId)}` : '/api/travel', { method: travelId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = (await response.json()) as { ok?: boolean; travelId?: string; error?: string; personId?: string };
      if (response.ok && result.ok) {
        if (travelId) router.refresh();
        else router.push(`/travel/${result.travelId}`);
        return;
      }
      const person = people.find((candidate) => candidate.personId === result.personId);
      setError(travelErrorMessage(result.error, person ? label(person) : null));
    } catch { setError(travelErrorMessage(null)); } finally { setBusy(false); }
  }

  return <form aria-label={travelId ? t('travelEditReturned') : t('travelNew')} className="leave-form travel-form" onSubmit={submit}>
    <div className="form-field"><label htmlFor="travel-subject">{t('travelSubject')}</label><input id="travel-subject" value={form.subject} maxLength={300} required onChange={(event) => set({ subject: event.target.value })} /></div>
    <div className="form-field"><label htmlFor="travel-organiser">{t('travelOrganiser')}</label><input id="travel-organiser" value={form.organiser} maxLength={300} required onChange={(event) => set({ organiser: event.target.value })} /></div>
    <fieldset className="travel-invitation">
      <legend>{t('travelInvitation')}</legend>
      <div className="form-row">
        <div className="form-field"><label htmlFor="travel-invitation-number">{t('travelInvitationNumber')}</label><input id="travel-invitation-number" value={form.invitationNumber} maxLength={100} onChange={(event) => set({ invitationNumber: event.target.value })} /></div>
        <div className="form-field"><label htmlFor="travel-invitation-date">{t('travelInvitationDate')}</label><ThaiDateInput id="travel-invitation-date" value={form.invitationDate} onChange={(value) => set({ invitationDate: value })} /></div>
      </div>
      <div className="form-field"><label htmlFor="travel-invitation-issuer">{t('travelInvitationIssuer')}</label><input id="travel-invitation-issuer" value={form.invitationIssuer} maxLength={300} onChange={(event) => set({ invitationIssuer: event.target.value })} /></div>
    </fieldset>
    <div className="form-row">
      <div className="form-field"><label htmlFor="travel-place">{t('travelPlace')}</label><input id="travel-place" value={form.place} maxLength={300} required onChange={(event) => set({ place: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="travel-province">{t('travelProvince')}</label><input id="travel-province" value={form.province} maxLength={100} required onChange={(event) => set({ province: event.target.value })} /></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="travel-start">{t('leaveStartDate')}</label><ThaiDateInput id="travel-start" value={form.startDate} required onChange={(value) => set({ startDate: value, endDate: endFollowingStart(value, form.endDate) })} /></div>
      <div className="form-field"><label htmlFor="travel-start-half">{t('leaveStartHalf')}</label>
        <select id="travel-start-half" value={form.startHalf} onChange={(event) => set({ startHalf: event.target.value as TravelFormValues['startHalf'] })}>
          <option value="FULL">{t('leaveHalfFull')}</option><option value="AFTERNOON" disabled={oneDay && form.endHalf === 'MORNING'}>{t('leaveHalfAfternoon')}</option>
        </select></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="travel-end">{t('leaveEndDate')}</label><ThaiDateInput id="travel-end" value={form.endDate} min={form.startDate || undefined} required onChange={(value) => set({ endDate: value })} /></div>
      <div className="form-field"><label htmlFor="travel-end-half">{t('leaveEndHalf')}</label>
        <select id="travel-end-half" value={form.endHalf} onChange={(event) => set({ endHalf: event.target.value as TravelFormValues['endHalf'] })}>
          <option value="FULL">{t('leaveHalfFull')}</option><option value="MORNING" disabled={oneDay && form.startHalf === 'AFTERNOON'}>{t('leaveHalfMorning')}</option>
        </select></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="travel-type">{t('travelType')}</label>
        <select id="travel-type" value={form.travelType} onChange={(event) => set({ travelType: event.target.value })}>{TRAVEL_TYPES.map((code) => <option key={code} value={code}>{travelTypeLabel(code)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="travel-vehicle">{t('travelVehicle')}</label>
        <select id="travel-vehicle" value={form.vehicle} onChange={(event) => set({ vehicle: event.target.value })}>{TRAVEL_VEHICLES.map((code) => <option key={code} value={code}>{travelVehicleLabel(code)}</option>)}</select></div>
    </div>
    <fieldset className="travel-costs">
      <legend>{t('travelCosts')}</legend>
      <div className="travel-cost-grid">
        {costFields.map(([field, key, item]) => <div key={field} className="form-row travel-cost-item">
          <div className="form-field"><label htmlFor={`travel-${field}`}>{t(key)}</label><input id={`travel-${field}`} type="number" inputMode="decimal" min="0" step="0.01" value={form[field]} onChange={(event) => set({ [field]: event.target.value })} /></div>
          <div className="form-field"><label htmlFor={`travel-funding-${item}`}>{`${t('travelCostFunding')} ${costItemName(key)}`}</label>
            <select id={`travel-funding-${item}`} value={form.costFunding[item]} onChange={(event) => set({ costFunding: { ...form.costFunding, [item]: event.target.value } })}>{TRAVEL_FUNDING.map((code) => <option key={code} value={code}>{travelFundingLabel(code)}</option>)}</select></div>
        </div>)}
      </div>
      <p className="travel-cost-total"><strong>{t('travelCostTotal')} {formatBaht(total)} {t('travelBaht')}</strong></p>
    </fieldset>
    <fieldset className="travel-people">
      <legend>{t('travelMembers')}</legend>
      <p className="permission-notice">{fixedMembers ? t('travelEditPeopleFixed') : t('travelMembersHelp')}</p>
      <ul aria-label={t('travelMembers')} className="travel-member-list">
        {people.map((person, index) => <li key={person.personId}>
          <span>{label(person)}{person.organizationName ? <small> · {person.organizationName}</small> : null}</span>
          {index === 0 ? <span className="travel-leader-tag">{t('travelLeader')}</span> : !fixedMembers && <button type="button" className="button-secondary" aria-label={`${t('travelRemove')} ${label(person)}`} onClick={() => setOthers(others.filter((other) => other.personId !== person.personId))}>{t('travelRemove')}</button>}
        </li>)}
      </ul>
      {!fixedMembers && <>
        <div className="form-field"><label htmlFor="travel-search">{t('travelSearchPeople')}</label><input id="travel-search" type="search" value={search} maxLength={100} autoComplete="off" onChange={(event) => setSearch(event.target.value)} /></div>
        {found && (found.length === 0 ? <p>{t('travelNoPeopleFound')}</p> : <ul className="travel-search-results">
          {found.filter((person) => !people.some((member) => member.personId === person.personId)).map((person) => <li key={person.personId}>
            <span>{label(person)}{person.organizationName ? <small> · {person.organizationName}</small> : null}</span>
            <button type="button" aria-label={`${t('travelAdd')} ${label(person)}`} onClick={() => { setOthers([...others, person]); setSearch(''); }}>{t('travelAdd')}</button>
          </li>)}
        </ul>)}
      </>}
    </fieldset>
    {attachments ? <AttachmentField id="travel-attachment" label={t('attachmentTravel')} value={file} onChange={setFile} /> : <p className="permission-notice">{t('travelAttachmentNote')}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy}>{travelId ? t('travelResubmit') : t('travelSubmit')}</button></div>
  </form>;
}
