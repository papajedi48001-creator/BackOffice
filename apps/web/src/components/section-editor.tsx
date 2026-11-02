'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { t } from '@backoffice/i18n';

const SectionSaved = createContext<() => void>(() => undefined);

/** Called by a profile form after a successful save; closes the popup it sits in, if any. */
export function useSectionSaved(): () => void {
  return useContext(SectionSaved);
}

/** The แก้ไขข้อมูล button of one profile box. It opens that box's form in a popup, closed by ×, Esc, the backdrop or a save. */
export function SectionEditor({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button-secondary section-edit" aria-label={`${t('hrEditSection')} ${title}`} onClick={() => setOpen(true)}>{t('hrEditSection')}</button>
    {open ? <SectionDialog title={`${t('hrEditPrefix')}${title}`} onClose={() => setOpen(false)}>{children}</SectionDialog> : null}
  </>;
}

function SectionDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('.form-dialog-body :is(input, select, textarea):not([type=hidden]):not(:disabled)')?.focus();
  }, []);
  return <dialog ref={ref} className="action-dialog form-dialog form-dialog-wide" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="action-dialog-panel">
      <header className="action-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="action-dialog-close" aria-label={t('closeForm')} onClick={onClose}>×</button>
      </header>
      <div className="form-dialog-body"><SectionSaved.Provider value={onClose}>{children}</SectionSaved.Provider></div>
    </div>
  </dialog>;
}
