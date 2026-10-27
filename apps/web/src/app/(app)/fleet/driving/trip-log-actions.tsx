'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TripStatus } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { sendFleet } from '../../../../lib/fleet-labels';

const WHOLE_KM = /^\d{1,7}$/;

/** ออกเดินทาง on a PLANNED เที่ยวรถ, กลับถึง on a DEPARTED one, each asking for the odometer in whole kilometres. The server checks the driver and the reading again. */
export function TripLogActions({ tripId, status, label }: { tripId: string; status: TripStatus; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  if (status !== 'PLANNED' && status !== 'DEPARTED') return null;
  const departing = status === 'PLANNED';
  const action = t(departing ? 'fleetDepart' : 'fleetReturn');

  async function confirm() {
    const text = reading.trim();
    if (!WHOLE_KM.test(text)) { setError(t('fleetOdometerInvalid')); return; }
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/fleet/trips/${encodeURIComponent(tripId)}/${departing ? 'departure' : 'return'}`, 'POST', { odometer: Number(text) });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setOpen(false); setReading('');
    router.refresh();
  }

  return <div className="fleet-log-actions">
    <button type="button" className="fleet-log-button" onClick={() => setOpen(true)}>{action}</button>
    {open && <ActionDialog title={`${action} · ${label}`} confirmLabel={t('confirmAction')} ready={reading.trim() !== ''} isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => { setOpen(false); setError(null); }}>
      <div className="action-dialog-field">
        <label htmlFor={fieldId}>{t('fleetOdometer')}</label>
        <input id={fieldId} className="fleet-odometer" type="text" inputMode="numeric" autoComplete="off" autoFocus value={reading} onChange={(event) => setReading(event.target.value)} />
      </div>
    </ActionDialog>}
  </div>;
}
