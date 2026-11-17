'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { DirectoryPerson } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { NO_VALUE, filterPeople, type PeopleFilterField } from '../lib/people-filter';

type FilterField = PeopleFilterField;
const filters: [FilterField, MessageKey][] = [['positionTitle', 'positionTitle'], ['employmentTypeName', 'hrFieldEmploymentType'], ['organizationName', 'organization']];
const noFilters: Record<FilterField, string> = { positionTitle: '', employmentTypeName: '', organizationName: '' };
const icon = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

/** Saves the file the server answered with; the name comes from its content-disposition. */
async function download(response: Response): Promise<void> {
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'people.csv';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * ทะเบียนบุคลากร: the heading, a search card (ค้นหารายชื่อ, filters, count, ล้างตัวกรอง) and the table. It filters the list the server
 * already limited to the viewer's scope. ส่งออกข้อมูล shows only with `canExport`; the server checks the right again and filters the same way.
 */
export function PeopleTable({ people, canExport = false, actions }: { people: DirectoryPerson[]; canExport?: boolean; actions?: ReactNode }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<FilterField, string>>(noFilters);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const options = useMemo(() => Object.fromEntries(filters.map(([field]) => [field, [...new Set(people.map((person) => person[field]).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b, 'th'))])) as Record<FilterField, string[]>, [people]);
  const shown = filterPeople(people, { query, ...chosen });
  const filtered = query !== '' || Object.values(chosen).some((value) => value !== '');

  async function exportShown() {
    setExporting(true);
    setExportError(false);
    try {
      const response = await fetch('/api/hr/people/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, ...chosen }) });
      if (!response.ok) throw new Error('EXPORT_FAILED');
      await download(response);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return <>
    <div className="page-heading">
      <h2>{t('peopleTitle')}</h2>
      <nav className="page-actions">
        {canExport ? <button type="button" className="button-secondary button-with-icon" onClick={exportShown} disabled={exporting}>
          <svg viewBox="0 0 24 24" width="18" height="18" {...icon}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          {exporting ? t('peopleExporting') : t('peopleExport')}
        </button> : null}
        {actions}
      </nav>
    </div>
    {exportError ? <p className="form-error" role="alert">{t('peopleExportFailed')}</p> : null}
    <div className="search-card" role="search">
      <div className="search-card-fields">
        <label className="search-card-query">{t('peopleSearch')}
          <span className="search-card-input">
            <svg viewBox="0 0 24 24" width="20" height="20" {...icon}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={query} placeholder={t('peopleSearchPlaceholder')} onChange={(event) => setQuery(event.target.value)} />
          </span>
        </label>
        {filters.map(([field, label]) => <label key={field}>{t(label)}
          <select value={chosen[field]} onChange={(event) => setChosen((current) => ({ ...current, [field]: event.target.value }))}>
            <option value="">{t('filterAll')}</option>
            {options[field].map((value) => <option key={value} value={value}>{value}</option>)}
            {people.some((person) => person[field] === null) ? <option value={NO_VALUE}>{t('notAssigned')}</option> : null}
          </select>
        </label>)}
      </div>
      <div className="search-card-foot">
        <p className="filter-count">{`${t('peopleShown')} ${shown.length} ${t('peopleOf')} ${people.length} ${t('peopleUnit')}`}</p>
        {filtered ? <button type="button" className="link-button" onClick={() => { setQuery(''); setChosen(noFilters); }}>{t('filterClear')}</button> : null}
      </div>
    </div>
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
