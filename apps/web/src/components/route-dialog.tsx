'use client';

import { useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';

/**
 * A popup the URL opens (e.g. `/hr/people?edit=…`), drawn over the page behind it. Like every popup here it closes only from its own
 * buttons, never on Esc or a click outside; closing goes back to `closeHref` without scrolling.
 */
export function RouteDialog({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
  }, []);
  const close = () => router.push(closeHref, { scroll: false });
  return <dialog ref={ref} className="action-dialog form-dialog form-dialog-wide route-dialog" aria-labelledby={titleId} onCancel={(event) => event.preventDefault()}>
    <div className="action-dialog-panel">
      <header className="action-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="action-dialog-close" aria-label={t('closeForm')} onClick={close}>×</button>
      </header>
      <div className="form-dialog-body">{children}</div>
      <footer className="action-dialog-actions"><button type="button" className="button-secondary" onClick={close}>{t('hrCloseEditor')}</button></footer>
    </div>
  </dialog>;
}
