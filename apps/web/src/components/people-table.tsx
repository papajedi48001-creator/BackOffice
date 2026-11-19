'use client';
import { employmentStatusLabel } from '../lib/employment-status';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { DirectoryPerson } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { NO_VALUE, filterPeople, type PeopleFilterField } from '../lib/people-filter';
import { SearchCard } from './search-card';

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

export { employmentStatusLabel };

const twoFactor = { provider: { src: '/provider-id-logo.png', name: 'Provider ID' }, thaid: { src: '/thaid-logo.png', name: 'ThaiD' } } as const;
/** One 2FA mark: the logo in colour once linked, faded until then. */
function TwoFactorLogo({ kind, linked }: { kind: keyof typeof twoFactor; linked: boolean }) {
  const label = `${twoFactor[kind].name} ${t(linked ? 'twoFactorLinked' : 'twoFactorNotLinked')}`;
  return <img className={linked ? 'two-factor-logo' : 'two-factor-logo is-off'} src={twoFactor[kind].src} alt={label} title={label} height={22} />;
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
  const [onlyActive, setOnlyActive] = useState(true);
  const options = useMemo(() => Object.fromEntries(filters.map(([field]) => [field, [...new Set(people.map((person) => person[field]).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b, 'th'))])) as Record<FilterField, string[]>, [people]);
  const shown = filterPeople(people, { query, ...chosen }).filter((person) => !onlyActive || person.employmentStatus === 'ACTIVE');
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
    <SearchCard query={query} onQuery={setQuery} placeholder={t('peopleSearchPlaceholder')} shown={shown.length} total={people.length} unit={t('peopleUnit')} filtered={filtered} onClear={() => { setQuery(''); setChosen(noFilters); }}>
      {filters.map(([field, label]) => <label key={field}>{t(label)}
        <select value={chosen[field]} onChange={(event) => setChosen((current) => ({ ...current, [field]: event.target.value }))}>
          <option value="">{t('filterAll')}</option>
          {options[field].map((value) => <option key={value} value={value}>{value}</option>)}
          {people.some((person) => person[field] === null) ? <option value={NO_VALUE}>{t('notAssigned')}</option> : null}
        </select>
      </label>)}
    </SearchCard>
    <div className="people-only-active"><button type="button" role="switch" aria-checked={onlyActive} className="switch" onClick={() => setOnlyActive((current) => !current)}><span className="switch-track" aria-hidden="true" />{t('peopleOnlyActive')}</button></div>
    {shown.length === 0 ? <p>{t('peopleNoMatch')}</p> : <table>
      <thead><tr><th>{t('employeeCode')}</th><th>{t('displayName')}</th><th>{t('positionTitle')}</th><th>{t('hrFieldEmploymentType')}</th><th>{t('organization')}</th><th>{t('nationalIdLabel')}</th><th>{t('employmentStatus')}</th><th>2FA</th><th><span className="visually-hidden">{t('editItem')}</span></th></tr></thead>
      <tbody>{shown.map((person) => <tr key={person.id}>
        <td>{person.employeeCode ?? t('notAssigned')}</td>
        <td>{person.displayName ?? t('notAssigned')}</td>
        <td>{person.positionTitle ?? t('notAssigned')}</td>
        <td>{person.employmentTypeName ?? t('notAssigned')}</td>
        <td>{person.organizationName ?? t('notAssigned')}</td>
        <td>{person.nationalIdMasked ?? t('notAssigned')}</td>
        <td><span className={`status-chip status-${person.employmentStatus.toLowerCase()}`}>{employmentStatusLabel(person.employmentStatus)}</span></td>
        <td><span className="two-factor"><TwoFactorLogo kind="provider" linked={person.providerLinked} /><TwoFactorLogo kind="thaid" linked={person.thaidLinked} /></span></td>
        <td className="row-actions"><Link className="icon-button" href={`/hr/people?edit=${encodeURIComponent(person.id)}`} aria-label={`${t('editItem')} ${person.displayName ?? person.employeeCode ?? ''}`.trim()} scroll={false}>
          <svg viewBox="0 0 24 24" width="17" height="17" {...icon}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </Link></td>
      </tr>)}</tbody>
    </table>}
  </>;
}
