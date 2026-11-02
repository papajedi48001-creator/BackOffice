'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { t } from '@backoffice/i18n';

type SubmitResult = boolean | void | Promise<boolean | void>;

/**
 * Popup for every add, edit and delete-with-fields form. Same native <dialog> look as ActionDialog: showModal,
 * no Esc or backdrop close (buttons only), × button, focus on the first field. Opened from its own trigger button (`triggerLabel`) or controlled
 * with `open` / `onOpenChange` (for a row's "แก้ไข" button). `onSubmit` returns true when the save worked; the popup then closes.
 */
export function FormDialog({ title, triggerLabel, triggerAriaLabel, triggerClassName, triggerDisabled, submitLabel, tone = 'primary', wide = false, isSubmitting = false, ready = true, error, open: controlledOpen, onOpenChange, onSubmit, children }: {
  title: string;
  triggerLabel?: string;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerDisabled?: boolean;
  submitLabel: string;
  tone?: 'primary' | 'danger';
  wide?: boolean;
  isSubmitting?: boolean;
  ready?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => SubmitResult;
  children: React.ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => { if (controlledOpen === undefined) setOwnOpen(next); onOpenChange?.(next); };
  return <>
    {triggerLabel && <button type="button" className={triggerClassName} aria-label={triggerAriaLabel} disabled={triggerDisabled} onClick={() => setOpen(true)}>{triggerLabel}</button>}
    {open && <FormDialogPanel title={title} submitLabel={submitLabel} tone={tone} wide={wide} isSubmitting={isSubmitting} ready={ready} error={error} onSubmit={onSubmit} onClose={() => setOpen(false)}>{children}</FormDialogPanel>}
  </>;
}

function FormDialogPanel({ title, submitLabel, tone, wide, isSubmitting, ready, error, onSubmit, onClose, children }: {
  title: string; submitLabel: string; tone: 'primary' | 'danger'; wide: boolean; isSubmitting: boolean; ready: boolean; error?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => SubmitResult; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const blocked = isSubmitting || busy;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
    const first = dialog.querySelector<HTMLElement>('.form-dialog-body :is(input, select, textarea):not([type=hidden]):not(:disabled)');
    first?.focus();
  }, []);
  const close = () => { if (!blocked) onClose(); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || !ready) return;
    const result = onSubmit(event);
    if (!(result instanceof Promise)) { if (result === true) onClose(); return; }
    setBusy(true);
    try { if ((await result) === true) onClose(); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className={`action-dialog form-dialog tone-${tone}${wide ? ' form-dialog-wide' : ''}`} aria-labelledby={titleId}
    onCancel={(event) => event.preventDefault()}>
    <form className="action-dialog-panel" aria-labelledby={titleId} noValidate={false} onSubmit={(event) => void submit(event)}>
      <header className="action-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="action-dialog-close" aria-label={t('closeForm')} disabled={blocked} onClick={close}>×</button>
      </header>
      <div className="form-dialog-body">{children}</div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <footer className="action-dialog-actions">
        <button type="button" className="button-secondary" disabled={blocked} onClick={close}>{t('inventoryCancel')}</button>
        <button type="submit" className={tone === 'danger' ? 'button-danger-solid' : undefined} disabled={blocked || !ready}>{blocked ? t('savingAction') : submitLabel}</button>
      </footer>
    </form>
  </dialog>;
}
