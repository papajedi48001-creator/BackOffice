'use client';

import { useState } from 'react';
import { t, type MessageKey } from '@backoffice/i18n';

export interface AttachedFile { attachmentId: string; filename: string | null }

const MAX_BYTES = 10 * 1024 * 1024;
const errorKeys: Record<string, MessageKey> = { FILE_TOO_LARGE: 'attachmentErrorTooLarge', UNSUPPORTED_FILE_TYPE: 'attachmentErrorType', INVALID_FILE_CONTENT: 'attachmentErrorContent', FILE_INFECTED: 'attachmentErrorInfected', SCAN_UNAVAILABLE: 'attachmentErrorScanUnavailable' };
const attachmentError = (code: string | null | undefined) => t(code && errorKeys[code] ? errorKeys[code] : 'attachmentErrorFailed');

/** One ไฟล์แนบส่วนตัว: uploads (and so scans) the file as soon as it is chosen, and reports its id to the form. */
export function AttachmentField({ id, label, value, onChange }: { id: string; label: string; value: AttachedFile | null; onChange: (value: AttachedFile | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setError(attachmentError('FILE_TOO_LARGE')); return; }
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      const response = await fetch('/api/attachments', { method: 'POST', body });
      const result = (await response.json()) as { attachmentId?: string; filename?: string | null; error?: string };
      if (response.ok && result.attachmentId) onChange({ attachmentId: result.attachmentId, filename: result.filename ?? null });
      else setError(attachmentError(result.error));
    } catch { setError(attachmentError(null)); } finally { setBusy(false); }
  }

  return <div className="form-field attachment-field">
    <label htmlFor={id}>{label}</label>
    {value
      ? <p><a href={`/api/attachments/${encodeURIComponent(value.attachmentId)}/download`}>{value.filename ?? t('attachmentFile')}</a> <button type="button" className="button-secondary" onClick={() => onChange(null)}>{t('attachmentRemove')}</button></p>
      : <input id={id} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />}
    <p className="field-help">{busy ? t('attachmentUploading') : t('attachmentHelp')}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
