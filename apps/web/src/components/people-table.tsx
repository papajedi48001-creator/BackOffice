'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DirectoryPerson } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';

const NONE = '__none__';
type FilterField = 'positionTitle' | 'employmentTypeName' | 'organizationName';
const filters: [FilterField, MessageKey][] = [['positionTitle', 'positionTitle'], ['employmentTypeName', 'hrFieldEmploymentType'], ['organizationName', 'organization']];

/** ทะเบียนบุคลากร with a name search and filters. It filters the list the server already limited to the viewer's scope. */
export function PeopleTable({ people }: { people: DirectoryPerson[] }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<FilterField, string>>({ positionTitle: '', employmentTypeName: '', organizationName: '' });
  const options = useMemo(() => Object.fromEntries(filters.map(([field]) => [field, [...new Set(people.map((person) => person[field]).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b, 'th'))])) as Record<FilterField, string[]>, [people]);
  const needle = query.trim().toLocaleLowerCase('th');
  const shown = people.filter((person) =>
    (needle === '' || [person.displayName, person.employeeCode].some((value) => value?.toLocaleLowerCase('th').includes(needle)))
    && filters.every(([field]) => chosen[field] === '' || (chosen[field] === NONE ? person[field] === null : person[field] === chosen[field])));
  return <>
    <div className="filter-bar" role="search">
      <label>{t('peopleSearch')}<input type="search" value={query} placeholder={t('peopleSearchPlaceholder')} onChange={(event) => setQuery(event.target.value)} /></label>
      {filters.map(([field, label]) => <label key={field}>{t(label)}
        <select value={chosen[field]} onChange={(event) => setChosen((current) => ({ ...current, [field]: event.target.value }))}>
          <option value="">{t('filterAll')}</option>
          {options[field].map((value) => <option key={value} value={value}>{value}</option>)}
          {people.some((person) => person[field] === null) ? <option value={NONE}>{t('notAssigned')}</option> : null}
        </select>
      </label>)}
    </div>
    <p className="filter-count">{`${t('peopleShown')} ${shown.length} ${t('peopleOf')} ${people.length} ${t('peopleUnit')}`}</p>
    {shown.length === 0 ? <p>{t('peopleNoMatch')}</p> : <table>
      <thead><tr><th>{t('employeeCode')}</th><th>{t('displayName')}</th><th>{t('positionTitle')}</th><th>{t('hrFieldEmploymentType')}</th><th>{t('organization')}</th><th>{t('nationalIdLabel')}</th><th>{t('employmentStatus')}</th></tr></thead>
      <tbody>{shown.map((person) => <tr key={person.id}>
        <td>{person.employeeCode ?? t('notAssigned')}</td>
        <td><Link href={`/hr/people/${person.id}`}>{person.displayName ?? t('notAssigned')}</Link></td>
        <td>{person.positionTitle ?? t('notAssigned')}</td>
        <td>{person.employmentTypeName ?? t('notAssigned')}</td>
        <td>{person.organizationName ?? t('notAssigned')}</td>
        <td>{person.nationalIdMasked ?? t('notAssigned')}</td>
        <td>{person.employmentStatus === 'ACTIVE' ? t('employmentActive') : t('employmentInactive')}</td>
      </tr>)}</tbody>
    </table>}
  </>;
}
