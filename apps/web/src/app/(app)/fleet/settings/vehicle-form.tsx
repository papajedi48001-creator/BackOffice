'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VehicleKind, VehicleStatus } from '@backoffice/contracts';
import type { VehicleView } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { fleetErrorMessage, sendFleet, VEHICLE_KINDS, VEHICLE_STATUSES, vehicleKindLabel, vehicleStatusLabel } from '../../../../lib/fleet-labels';

const blank = { registration: '', makeModel: '', kind: 'VAN' as VehicleKind, seats: '12', status: 'ACTIVE' as VehicleStatus, note: '' };

/** Adds a รถราชการ, or with `vehicle` edits one. The route checks fleet.manage and that the registration is not taken. */
export function VehicleForm({ vehicle }: { vehicle?: VehicleView }) {
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState(vehicle ? { registration: vehicle.registration, makeModel: vehicle.makeModel, kind: vehicle.kind, seats: String(vehicle.seats), status: vehicle.status, note: vehicle.note } : blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const seats = Number(form.seats);
    if (!Number.isInteger(seats)) { setError(fleetErrorMessage('invalid_input')); return; }
    setBusy(true); setError(null);
    const body = { registration: form.registration.trim(), makeModel: form.makeModel.trim(), kind: form.kind, seats, status: form.status, note: form.note.trim() };
    const sent = await sendFleet(vehicle ? `/api/fleet/vehicles/${encodeURIComponent(vehicle.id)}` : '/api/fleet/vehicles', vehicle ? 'PUT' : 'POST', body);
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    if (!vehicle) setForm(blank);
    router.refresh();
  }

  return <form aria-label={vehicle ? `${t('fleetEdit')} ${vehicle.registration}` : t('fleetAddVehicle')} className="leave-form fleet-settings-form" onSubmit={submit}>
    <div className="form-row">
      <div className="form-field"><label htmlFor={`${id}-registration`}>{t('fleetRegistration')}</label><input id={`${id}-registration`} value={form.registration} maxLength={20} required onChange={(event) => set({ registration: event.target.value })} /></div>
      <div className="form-field"><label htmlFor={`${id}-model`}>{t('fleetMakeModel')}</label><input id={`${id}-model`} value={form.makeModel} maxLength={120} required onChange={(event) => set({ makeModel: event.target.value })} /></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor={`${id}-kind`}>{t('fleetKind')}</label><select id={`${id}-kind`} value={form.kind} onChange={(event) => set({ kind: event.target.value as VehicleKind })}>{VEHICLE_KINDS.map((kind) => <option key={kind} value={kind}>{vehicleKindLabel(kind)}</option>)}</select></div>
      <div className="form-field"><label htmlFor={`${id}-seats`}>{t('fleetSeats')}</label><input id={`${id}-seats`} type="number" inputMode="numeric" min={1} max={60} step={1} value={form.seats} required onChange={(event) => set({ seats: event.target.value })} /></div>
      <div className="form-field"><label htmlFor={`${id}-status`}>{t('status')}</label><select id={`${id}-status`} value={form.status} onChange={(event) => set({ status: event.target.value as VehicleStatus })}>{VEHICLE_STATUSES.map((status) => <option key={status} value={status}>{vehicleStatusLabel(status)}</option>)}</select></div>
    </div>
    <div className="form-field"><label htmlFor={`${id}-note`}>{t('fleetNote')}</label><input id={`${id}-note`} value={form.note} maxLength={300} onChange={(event) => set({ note: event.target.value })} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy}>{vehicle ? t('fleetSave') : t('fleetAddVehicle')}</button></div>
  </form>;
}
