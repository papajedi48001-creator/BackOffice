'use client';

import { ActionDialog } from './action-dialog';

/**
 * Popup for the admin module's add / edit forms. Built on ActionDialog's native <dialog> (showModal, Esc, inert page behind),
 * kept in this one file so it can be swapped for the shared form popup without touching the admin pages.
 */
export function AdminFormDialog({ title, message, submitLabel, ready, isSubmitting, error, tone, children, onSubmit, onClose }: {
  title: string;
  message?: string;
  submitLabel: string;
  ready: boolean;
  isSubmitting: boolean;
  error: string | null;
  tone?: 'primary' | 'danger';
  children?: React.ReactNode;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return <ActionDialog title={title} {...(message ? { message } : {})} confirmLabel={submitLabel} tone={tone ?? 'primary'} ready={ready} isSubmitting={isSubmitting} error={error} onConfirm={() => onSubmit()} onClose={onClose}>
    <div className="admin-dialog-body">{children}</div>
  </ActionDialog>;
}
