import type { ReactNode } from 'react';
import { t } from '@backoffice/i18n';

/**
 * การ์ดค้นหา (DESIGN.md): the search box with a magnifier, any filters passed as children, then "แสดง N จาก M" and
 * ล้างตัวกรอง (shown only while something is filtered). Pages keep their own state and filter their own rows.
 */
export function SearchCard({ query, onQuery, label = t('peopleSearch'), placeholder, shown, total, unit, filtered = query !== '', onClear, children }: {
  query: string; onQuery: (value: string) => void; label?: string; placeholder?: string;
  shown: number; total: number; unit: string; filtered?: boolean; onClear: () => void; children?: ReactNode;
}) {
  return <div className="search-card" role="search">
    <div className={children ? 'search-card-fields' : 'search-card-fields search-card-fields-single'}>
      <label className="search-card-query">{label}
        <span className="search-card-input">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={query} placeholder={placeholder} onChange={(event) => onQuery(event.target.value)} />
        </span>
      </label>
      {children}
    </div>
    <div className="search-card-foot">
      <p className="filter-count">{`${t('peopleShown')} ${shown} ${t('peopleOf')} ${total} ${unit}`}</p>
      {filtered ? <button type="button" className="link-button" onClick={onClear}>{t('filterClear')}</button> : null}
    </div>
  </div>;
}
