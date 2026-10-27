'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { t } from '@backoffice/i18n';

/**
 * Popup for every confirm or reason step. A native <dialog> opened with showModal, so focus stays inside,
 * Esc closes it, and the page behind is inert. `reason` adds a required reason field; `children` adds fields of the step's own
 * (such as a reading or a choice), and `ready: false` keeps the confirm button off until they are filled.
 */
export function ActionDialog({ title, message, confirmLabel, tone = 'primary', reason = false, maxLength = 1000, isSubmitting = false, error, ready: fieldsReady = true, children, onConfirm, onClose }: {
  maxLength?: number;
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  reason?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  ready?: boolean;
  children?: React.ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const titleId = useId();
  const fieldId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }, []);
  const ready = fieldsReady && (!reason || text.trim().length > 0);
  const close = () => { if (!isSubmitting) onClose(); };
  return <dialog ref={ref} className={`action-dialog tone-${tone}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form method="dialog" className="action-dialog-panel" onSubmit={(event) => { event.preventDefault(); if (ready && !isSubmitting) onConfirm(text.trim()); }}>
      <header className="action-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="action-dialog-close" aria-label={t('closeForm')} disabled={isSubmitting} onClick={close}>×</button>
      </header>
      {message && <p className="action-dialog-message">{message}</p>}
      {children}
      {reason && <div className="action-dialog-field">
        <label htmlFor={fieldId}>{t('reasonLabel')}</label>
        <textarea id={fieldId} rows={4} maxLength={maxLength} required value={text} onChange={(event) => setText(event.target.value)} autoFocus />
      </div>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <footer className="action-dialog-actions">
        <button type="button" className="button-secondary" disabled={isSubmitting} onClick={close}>{t('inventoryCancel')}</button>
        <button type="submit" className={tone === 'danger' ? 'button-danger-solid' : undefined} disabled={isSubmitting || !ready} autoFocus={!reason && !children}>{isSubmitting ? t('savingAction') : confirmLabel}</button>
      </footer>
    </form>
  </dialog>;
}
