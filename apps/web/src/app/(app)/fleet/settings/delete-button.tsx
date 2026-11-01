'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { sendFleet } from '../../../../lib/fleet-labels';

/** ลบ for a car or a driver, after a confirm step. The route refuses one with เที่ยวรถ history and the dialog says why. */
export function DeleteButton({ url, name }: { url: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setError(null);
    const sent = await sendFleet(url, 'DELETE');
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setOpen(false);
    router.refresh();
  }

  return <>
    <button type="button" className="button-secondary" aria-label={`${t('fleetDelete')} ${name}`} onClick={() => { setError(null); setOpen(true); }}>{t('fleetDelete')}</button>
    {open && <ActionDialog title={`${t('fleetDelete')} ${name}`} message={t('fleetDeleteHelp')} confirmLabel={t('fleetDelete')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
