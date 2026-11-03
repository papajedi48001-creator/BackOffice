'use client';

import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';
import { ActionDialog } from './action-dialog';
import { FormDialog } from './form-dialog';

interface LinkStatus { linked: boolean; linkedAt: string | null; configured: boolean }
interface LinkCode { code: string; expiresAt: string; addFriendUrl: string | null }

/** Shown as ABCD-2345 so it is easy to read off the screen; the webhook ignores the dash. */
const spaced = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * เชื่อมต่อ LINE on ข้อมูลส่วนตัวของฉัน: makes a รหัสเชื่อมต่อ LINE the person sends to the bot, shows the link once made,
 * and removes it after a confirm. The code lives only in this popup's state.
 */
export function LineLinkDialog() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [code, setCode] = useState<LinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setError(null);
    const response = await fetch('/api/line/link').catch(() => null);
    if (!response?.ok) { setError(t('lineLoadError')); return; }
    const next = await response.json() as LinkStatus;
    setStatus(next);
    if (next.linked) setCode(null);
  }
  function openChange(next: boolean) {
    setOpen(next);
    if (next) { setStatus(null); setCode(null); void load(); }
  }
  async function createCode() {
    setBusy(true); setError(null);
    const response = await fetch('/api/line/link-code', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError(t('lineLoadError')); return; }
    setCode(await response.json() as LinkCode);
  }
  async function unlink() {
    setBusy(true);
    const response = await fetch('/api/line/link', { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError(t('lineLoadError')); return; }
    setConfirming(false);
    await load();
  }

  return <>
    <FormDialog title={t('lineConnect')} triggerLabel={t('lineConnect')} triggerClassName="button-link" open={open} onOpenChange={openChange} error={error}>
      {status && !status.configured && !status.linked && <p>{t('lineNotConfigured')}</p>}
      {status?.linked && <>
        <p>{t('lineLinkedAt')} {status.linkedAt ? formatBangkokDateTime(status.linkedAt) : ''}</p>
        <p className="admin-note">{t('lineStepJoinGroup')}</p>
        <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>{t('lineUnlink')}</button>
      </>}
      {status && status.configured && !status.linked && <>
        <p>{t('lineNotLinked')}</p>
        {code ? <>
          <p className="line-link-code" aria-live="polite"><strong>{spaced(code.code)}</strong></p>
          <p className="admin-note">{t('lineCodeExpires')} {formatBangkokDateTime(code.expiresAt)}</p>
          <ol className="line-link-steps">
            <li>{code.addFriendUrl ? <a href={code.addFriendUrl} target="_blank" rel="noreferrer">{t('lineAddFriend')}</a> : t('lineStepAddFriend')}</li>
            <li>{t('lineStepSendCode')}</li>
            <li>{t('lineStepCheck')}</li>
            <li>{t('lineStepJoinGroup')}</li>
          </ol>
          <div className="page-actions">
            <button type="button" onClick={() => void load()}>{t('lineCheckAgain')}</button>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => void createCode()}>{t('lineCreateNewCode')}</button>
          </div>
        </> : <button type="button" disabled={busy} onClick={() => void createCode()}>{t('lineCreateCode')}</button>}
      </>}
    </FormDialog>
    {confirming && <ActionDialog title={t('lineUnlinkTitle')} message={t('lineUnlinkMessage')} confirmLabel={t('lineUnlink')} tone="danger" isSubmitting={busy} onConfirm={() => void unlink()} onClose={() => setConfirming(false)} />}
  </>;
}
