'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverView } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { sendFleet } from '../../../../lib/fleet-labels';

interface Person { personId: string; displayName: string | null; organizationName: string | null }

/** Adds a บุคลากร to the driver list by name search, with a work phone that requesters will see. */
export function AddDriverForm() {
  const router = useRouter();
  const id = useId();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Person[] | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const text = search.trim();
    if (text.length === 0) { setFound(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      void fetch(`/api/fleet/people?q=${encodeURIComponent(text)}`)
        .then(async (response) => { if (current && response.ok) setFound(((await response.json()) as { people: Person[] }).people); })
        .catch(() => undefined);
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [search]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!person) return;
    setBusy(true); setError(null);
    const sent = await sendFleet('/api/fleet/drivers', 'POST', { personId: person.personId, phone: phone.trim(), isActive: true });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setPerson(null); setPhone(''); setSearch('');
    router.refresh();
  }

  return <form aria-label={t('fleetAddDriver')} className="leave-form fleet-settings-form" onSubmit={submit}>
    {person ? <p><strong>{person.displayName ?? '—'}</strong>{person.organizationName ? ` · ${person.organizationName}` : ''} <button type="button" className="button-secondary" onClick={() => setPerson(null)}>{t('travelRemove')}</button></p> : <>
      <div className="form-field"><label htmlFor={`${id}-search`}>{t('travelSearchPeople')}</label><input id={`${id}-search`} type="search" value={search} maxLength={100} autoComplete="off" onChange={(event) => setSearch(event.target.value)} /></div>
      {found && (found.length === 0 ? <p>{t('travelNoPeopleFound')}</p> : <ul className="travel-search-results">{found.map((candidate) => <li key={candidate.personId}>
        <span>{candidate.displayName ?? '—'}{candidate.organizationName ? <small> · {candidate.organizationName}</small> : null}</span>
        <button type="button" aria-label={`${t('fleetChoose')} ${candidate.displayName ?? ''}`} onClick={() => { setPerson(candidate); setFound(null); }}>{t('fleetChoose')}</button>
      </li>)}</ul>)}
    </>}
    <div className="form-field"><label htmlFor={`${id}-phone`}>{t('fleetWorkPhone')}</label><input id={`${id}-phone`} type="tel" value={phone} maxLength={32} required onChange={(event) => setPhone(event.target.value)} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy || !person}>{t('fleetAddDriver')}</button></div>
  </form>;
}

/** One row of the driver list: change the work phone, or pause and resume driving. Pausing is refused while the driver has PLANNED เที่ยวรถ. */
export function DriverRow({ driver }: { driver: DriverView }) {
  const router = useRouter();
  const [phone, setPhone] = useState(driver.phone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(isActive: boolean) {
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/fleet/drivers/${encodeURIComponent(driver.personId)}`, 'PUT', { phone: phone.trim(), isActive });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    router.refresh();
  }

  return <tr>
    <td>{driver.displayName ?? '—'}</td>
    <td><input aria-label={`${t('fleetWorkPhone')} ${driver.displayName ?? ''}`} type="tel" value={phone} maxLength={32} onChange={(event) => setPhone(event.target.value)} /></td>
    <td><span className={`status status-${driver.isActive ? 'approved' : 'cancelled'}`}>{t(driver.isActive ? 'fleetDriverActive' : 'fleetDriverInactive')}</span></td>
    <td className="request-actions">
      <button type="button" disabled={busy || phone.trim() === ''} onClick={() => void save(driver.isActive)}>{t('fleetSave')}</button>
      <button type="button" className="button-secondary" disabled={busy || phone.trim() === ''} onClick={() => void save(!driver.isActive)}>{t(driver.isActive ? 'fleetDeactivate' : 'fleetActivate')}</button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </td>
  </tr>;
}
