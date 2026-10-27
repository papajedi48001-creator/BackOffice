'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { fleetErrorMessage, fromBangkokLocal, sendFleet } from '../../../../lib/fleet-labels';

/** Times are Bangkok datetime-local values (`2026-11-10T08:00`); they become UTC instants only when sent. */
export interface FleetFormValues { purpose: string; destination: string; province: string; departAt: string; returnAt: string; passengerCount: string; passengerNames: string; contactPhone?: string }

const empty: FleetFormValues = { purpose: '', destination: '', province: '', departAt: '', returnAt: '', passengerCount: '1', passengerNames: '', contactPhone: '' };

/** Files a ใบขอใช้รถ (from ไปราชการ when `officialTravelId` is set), or with `fleetRequestId` edits and resubmits a returned one. The server checks every rule again. */
export function FleetForm({ initial, officialTravelId, fleetRequestId }: { initial?: FleetFormValues; officialTravelId?: string; fleetRequestId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FleetFormValues>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FleetFormValues>) => setForm({ ...form, ...patch });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const departAt = fromBangkokLocal(form.departAt);
    const returnAt = fromBangkokLocal(form.returnAt);
    const passengerCount = Number(form.passengerCount);
    if (!departAt || !returnAt || !Number.isInteger(passengerCount)) { setError(fleetErrorMessage('invalid_input')); return; }
    setBusy(true); setError(null);
    const body = {
      purpose: form.purpose.trim(), destination: form.destination.trim(), province: form.province.trim(), departAt, returnAt, passengerCount, passengerNames: form.passengerNames.trim(), contactPhone: (form.contactPhone ?? '').trim(),
      ...(officialTravelId && !fleetRequestId ? { officialTravelId } : {})
    };
    const sent = await sendFleet(fleetRequestId ? `/api/fleet/requests/${encodeURIComponent(fleetRequestId)}` : '/api/fleet/requests', fleetRequestId ? 'PUT' : 'POST', body);
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    if (fleetRequestId) router.refresh();
    else router.push(`/fleet/requests/${String(sent.result.fleetRequestId)}`);
  }

  return <form aria-label={fleetRequestId ? t('fleetEditReturned') : t('fleetNew')} className="leave-form fleet-form" onSubmit={submit}>
    <p className="permission-notice">{t('fleetFormHelp')}</p>
    <div className="form-field"><label htmlFor="fleet-purpose">{t('fleetPurpose')}</label><input id="fleet-purpose" value={form.purpose} maxLength={300} required onChange={(event) => set({ purpose: event.target.value })} /></div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="fleet-destination">{t('fleetDestination')}</label><input id="fleet-destination" value={form.destination} maxLength={300} required onChange={(event) => set({ destination: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="fleet-province">{t('fleetProvince')}</label><input id="fleet-province" value={form.province} maxLength={100} required onChange={(event) => set({ province: event.target.value })} /></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="fleet-depart">{t('fleetDepartAt')}</label><input id="fleet-depart" type="datetime-local" step={900} value={form.departAt} required onChange={(event) => set({ departAt: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="fleet-return">{t('fleetReturnAt')}</label><input id="fleet-return" type="datetime-local" step={900} min={form.departAt || undefined} value={form.returnAt} required onChange={(event) => set({ returnAt: event.target.value })} /></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="fleet-passenger-count">{t('fleetPassengerCount')}</label><input id="fleet-passenger-count" type="number" inputMode="numeric" min={1} max={99} step={1} value={form.passengerCount} required onChange={(event) => set({ passengerCount: event.target.value })} /></div>
    </div>
    <div className="form-field"><label htmlFor="fleet-passenger-names">{t('fleetPassengerNames')}</label><textarea id="fleet-passenger-names" value={form.passengerNames} maxLength={1000} rows={3} onChange={(event) => set({ passengerNames: event.target.value })} /></div>
    <div className="form-field"><label htmlFor="fleet-contact-phone">{t('fleetContactPhone')}</label><input id="fleet-contact-phone" type="tel" autoComplete="tel" value={form.contactPhone ?? ''} maxLength={32} aria-describedby="fleet-contact-phone-help" onChange={(event) => set({ contactPhone: event.target.value })} /><small id="fleet-contact-phone-help">{t('fleetContactPhoneHelp')}</small></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy}>{fleetRequestId ? t('fleetResubmit') : t('fleetSubmit')}</button></div>
  </form>;
}
