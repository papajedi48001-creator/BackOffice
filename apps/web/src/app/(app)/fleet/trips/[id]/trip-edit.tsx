'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverOption, VehicleOption } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { fleetErrorMessage, fromBangkokLocal, sendFleet, toBangkokLocal } from '../../../../../lib/fleet-labels';

export interface EditableTrip { id: string; vehicleId: string; registration: string; makeModel: string; driverPersonId: string; driverName: string | null; startsAt: string; endsAt: string }

/** Rule 6: the หัวหน้าหมวด changes a PLANNED เที่ยวรถ's car, driver or times. Options are those free for the chosen times plus the trip's own; the server reruns the overlap checks. */
export function TripEdit({ trip }: { trip: EditableTrip }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button-secondary" onClick={() => setOpen(true)}>{t('fleetEditTrip')}</button>
    {open && <TripEditDialog trip={trip} onClose={() => setOpen(false)} />}
  </>;
}

function TripEditDialog({ trip, onClose }: { trip: EditableTrip; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const initial = { vehicleId: trip.vehicleId, driverPersonId: trip.driverPersonId, startsAt: toBangkokLocal(trip.startsAt), endsAt: toBangkokLocal(trip.endsAt) };
  const [draft, setDraft] = useState(initial);
  const [free, setFree] = useState<{ vehicles: VehicleOption[]; drivers: DriverOption[] }>({ vehicles: [], drivers: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startsAt = fromBangkokLocal(draft.startsAt);
  const endsAt = fromBangkokLocal(draft.endsAt);

  useEffect(() => {
    if (!startsAt || !endsAt || startsAt >= endsAt) return;
    let current = true;
    void fetch(`/api/fleet/availability?from=${encodeURIComponent(startsAt)}&to=${encodeURIComponent(endsAt)}`)
      .then(async (response) => { if (current && response.ok) setFree((await response.json()) as { vehicles: VehicleOption[]; drivers: DriverOption[] }); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [startsAt, endsAt]);

  const vehicles = [{ id: trip.vehicleId, label: `${trip.registration} · ${trip.makeModel}` }, ...free.vehicles.filter((vehicle) => vehicle.id !== trip.vehicleId).map((vehicle) => ({ id: vehicle.id, label: `${vehicle.registration} · ${vehicle.makeModel}` }))];
  const drivers = [{ id: trip.driverPersonId, label: trip.driverName ?? '—' }, ...free.drivers.filter((driver) => driver.personId !== trip.driverPersonId).map((driver) => ({ id: driver.personId, label: driver.displayName ?? '—' }))];
  const changes: Record<string, string> = {};
  if (draft.vehicleId !== initial.vehicleId) changes.vehicleId = draft.vehicleId;
  if (draft.driverPersonId !== initial.driverPersonId) changes.driverPersonId = draft.driverPersonId;
  if (draft.startsAt !== initial.startsAt && startsAt) changes.startsAt = startsAt;
  if (draft.endsAt !== initial.endsAt && endsAt) changes.endsAt = endsAt;

  async function confirm() {
    if (!startsAt || !endsAt) { setError(fleetErrorMessage('INVALID_RANGE')); return; }
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/fleet/trips/${encodeURIComponent(trip.id)}`, 'PATCH', changes);
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onClose();
    router.refresh();
  }

  return <ActionDialog title={`${t('fleetEditTrip')} · ${trip.registration}`} confirmLabel={t('confirmAction')} ready={Object.keys(changes).length > 0} isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={onClose}>
    <div className="fleet-assign-new">
      <div className="form-row">
        <div className="form-field"><label htmlFor={`${id}-starts`}>{t('fleetStartsAt')}</label><input id={`${id}-starts`} type="datetime-local" step={900} value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></div>
        <div className="form-field"><label htmlFor={`${id}-ends`}>{t('fleetEndsAt')}</label><input id={`${id}-ends`} type="datetime-local" step={900} value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></div>
      </div>
      <div className="form-field"><label htmlFor={`${id}-vehicle`}>{t('fleetVehicle')}</label>
        <select id={`${id}-vehicle`} value={draft.vehicleId} onChange={(event) => setDraft({ ...draft, vehicleId: event.target.value })}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></div>
      <div className="form-field"><label htmlFor={`${id}-driver`}>{t('fleetDriver')}</label>
        <select id={`${id}-driver`} value={draft.driverPersonId} onChange={(event) => setDraft({ ...draft, driverPersonId: event.target.value })}>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}</select></div>
    </div>
  </ActionDialog>;
}
