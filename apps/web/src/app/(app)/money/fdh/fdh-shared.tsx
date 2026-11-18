'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { STATUS, type FdhStatus } from '../../../../lib/money/fdh-core';

export const PAGE = 50;
export const money = (n: number) => (+n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n: number) => (+n || 0).toLocaleString('th-TH');
export const pct = (n: number) => `${(+n || 0).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;

export function StatusBadge({ status }: { status: FdhStatus }) {
  return <span className={`fdh-badge st-${status}`}>{STATUS[status].icon} {STATUS[status].label}</span>;
}

export function Progress({ value }: { value: number }) {
  return <span className="fdh-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, value).toFixed(1)}%` }} /></span>;
}

/** "N เคส · หน้า 1 / 3" with ‹ ก่อนหน้า and ถัดไป ›, as the legacy pagers. */
export function Pager({ text, page, pages, onPage }: { text: string; page: number; pages: number; onPage: (page: number) => void }) {
  return <div className="fdh-pager">
    <span>{text} · หน้า {page + 1} / {pages}</span>
    <button type="button" className="button-secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ ก่อนหน้า</button>
    <button type="button" className="button-secondary" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>ถัดไป ›</button>
  </div>;
}

export function paged<T>(list: readonly T[], page: number) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const at = Math.min(page, pages - 1);
  return { rows: list.slice(at * PAGE, at * PAGE + PAGE), page: at, pages };
}

/** A view-only popup: a native modal dialog that closes only from its ปิด button (Esc is ignored), as every BackOffice popup. */
export function FdhPopup({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }, []);
  return <dialog ref={ref} className="fdh-dialog" aria-labelledby={titleId} onCancel={(event) => event.preventDefault()}>
    <header className="fdh-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="button-secondary" onClick={onClose}>ปิด</button>
    </header>
    <div className="fdh-dialog-body">{children}</div>
  </dialog>;
}
