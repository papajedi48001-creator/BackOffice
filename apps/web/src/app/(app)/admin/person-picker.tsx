'use client';

import { useEffect, useId, useState } from 'react';
import { t } from '@backoffice/i18n';

export interface PickedPerson { personId: string; displayName: string | null; employeeCode: string | null; organizationName: string | null }

/** Finds an active บุคลากร by name or employee code (the search API checks its own permission again). */
export function PersonPicker({ person, onPick, searchUrl = '/api/admin/people' }: { person: PickedPerson | null; onPick: (person: PickedPerson | null) => void; searchUrl?: string }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<PickedPerson[] | null>(null);

  useEffect(() => {
    const text = search.trim();
    if (text.length === 0) { setFound(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      void fetch(`${searchUrl}?q=${encodeURIComponent(text)}`)
        .then(async (response) => { if (current && response.ok) setFound(((await response.json()) as { people: PickedPerson[] }).people); })
        .catch(() => undefined);
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [search, searchUrl]);

  if (person) return <p className="admin-picked"><strong>{person.displayName ?? '—'}</strong>{person.employeeCode ? <small> · {person.employeeCode}</small> : null}{person.organizationName ? <small> · {person.organizationName}</small> : null} <button type="button" className="button-secondary" onClick={() => onPick(null)}>{t('adminChangePerson')}</button></p>;
  return <div className="admin-person-picker">
    <div className="action-dialog-field"><label htmlFor={`${id}-search`}>{t('adminSearchPerson')}</label><input id={`${id}-search`} type="search" value={search} maxLength={100} autoComplete="off" onChange={(event) => setSearch(event.target.value)} /></div>
    {found && (found.length === 0 ? <p>{t('adminNoPeopleFound')}</p> : <ul className="travel-search-results">{found.map((candidate) => <li key={candidate.personId}>
      <span>{candidate.displayName ?? '—'}{candidate.employeeCode ? <small> · {candidate.employeeCode}</small> : null}{candidate.organizationName ? <small> · {candidate.organizationName}</small> : null}</span>
      <button type="button" aria-label={`${t('adminChoose')} ${candidate.displayName ?? ''}`} onClick={() => { onPick(candidate); setSearch(''); setFound(null); }}>{t('adminChoose')}</button>
    </li>)}</ul>)}
  </div>;
}
