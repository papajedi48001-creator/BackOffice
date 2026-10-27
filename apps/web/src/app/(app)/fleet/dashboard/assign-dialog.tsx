'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverOption, TripOption, VehicleOption } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { formatBangkokTime } from '../../../../lib/bangkok-time';
import { fleetErrorMessage, formatFleetRange, fromBangkokLocal, sendFleet, toBangkokLocal, vehicleKindLabel } from '../../../../lib/fleet-labels';

export interface AssignTarget { id: string; reference: string; departAt: string; returnAt: string }
interface Options { vehicles: VehicleOption[]; drivers: DriverOption[]; trips: TripOption[] }
type Tab = 'existing' | 'new';

/** การจัดรถ for one ใบ: join a PLANNED เที่ยวรถ that covers its times, or open a new one with a car and driver free for them. The server checks overlap again under lock. */
export function AssignDialog({ request, onClose, onDone }: { request: AssignTarget; onClose: () => void; onDone: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [tab, setTab] = useState<Tab>('existing');
  const [tripId, setTripId] = useState('');
  const [draft, setDraft] = useState({ vehicleId: '', driverPersonId: '', startsAt: toBangkokLocal(request.departAt), endsAt: toBangkokLocal(request.returnAt) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  useEffect(() => {
    let current = true;
    void fetch(`/api/fleet/availability?from=${encodeURIComponent(request.departAt)}&to=${encodeURIComponent(request.returnAt)}`)
      .then(async (response) => {
        if (!current) return;
        if (!response.ok) { setError(fleetErrorMessage(null)); return; }
        const loaded = (await response.json()) as Options;
        setOptions(loaded);
        setTab(loaded.trips.length > 0 ? 'existing' : 'new');
      })
      .catch(() => { if (current) setError(fleetErrorMessage(null)); });
    return () => { current = false; };
  }, [request.departAt, request.returnAt]);

  const ready = options !== null && (tab === 'existing' ? tripId !== '' : draft.vehicleId !== '' && draft.driverPersonId !== '' && draft.startsAt !== '' && draft.endsAt !== '');

  async function confirm() {
    let body: Record<string, string>;
    if (tab === 'existing') body = { tripId };
    else {
      const startsAt = fromBangkokLocal(draft.startsAt);
      const endsAt = fromBangkokLocal(draft.endsAt);
      if (!startsAt || !endsAt) { setError(fleetErrorMessage('INVALID_RANGE')); return; }
      body = { vehicleId: draft.vehicleId, driverPersonId: draft.driverPersonId, startsAt, endsAt };
    }
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/fleet/requests/${encodeURIComponent(request.id)}/assignment`, 'POST', body);
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onDone();
  }

  const tabButton = (value: Tab, label: string) => <button type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-${value}-panel`} aria-selected={tab === value} className={tab === value ? 'fleet-tab fleet-tab-active' : 'fleet-tab'} onClick={() => setTab(value)}>{label}</button>;

  return <ActionDialog title={`${t('fleetAssign')} · ${request.reference}`} message={formatFleetRange(request.departAt, request.returnAt)} confirmLabel={t('fleetAssign')} ready={ready} isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={onClose}>
    {options === null ? (!error && <p>{t('fleetLoadingOptions')}</p>) : <div className="fleet-assign">
      <div role="tablist" className="fleet-tabs">{tabButton('existing', t('fleetTabExisting'))}{tabButton('new', t('fleetTabNew'))}</div>
      {tab === 'existing' ? <div role="tabpanel" id={`${id}-existing-panel`} aria-labelledby={`${id}-existing`}>
        {options.trips.length === 0 ? <p>{t('fleetNoTripOptions')}</p> : <ul className="fleet-option-list">{options.trips.map((trip) => <li key={trip.id}>
          <label><input type="radio" name={`${id}-trip`} value={trip.id} checked={tripId === trip.id} onChange={() => setTripId(trip.id)} /> {trip.registration} · {trip.driverName ?? '—'} · {formatBangkokTime(trip.startsAt)}–{formatBangkokTime(trip.endsAt)}</label>
        </li>)}</ul>}
      </div> : <div role="tabpanel" id={`${id}-new-panel`} aria-labelledby={`${id}-new`} className="fleet-assign-new">
        <div className="form-field"><label htmlFor={`${id}-vehicle`}>{t('fleetVehicle')}</label>
          <select id={`${id}-vehicle`} value={draft.vehicleId} onChange={(event) => setDraft({ ...draft, vehicleId: event.target.value })}>
            <option value="">{t('fleetChoose')}</option>
            {options.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{`${vehicle.registration} · ${vehicle.makeModel} · ${vehicleKindLabel(vehicle.kind)} ${vehicle.seats} ${t('fleetSeatsUnit')}`}</option>)}
          </select>
          {options.vehicles.length === 0 && <small>{t('fleetNoFreeVehicles')}</small>}</div>
        <div className="form-field"><label htmlFor={`${id}-driver`}>{t('fleetDriver')}</label>
          <select id={`${id}-driver`} value={draft.driverPersonId} onChange={(event) => setDraft({ ...draft, driverPersonId: event.target.value })}>
            <option value="">{t('fleetChoose')}</option>
            {options.drivers.map((driver) => <option key={driver.personId} value={driver.personId}>{driver.displayName ?? '—'}</option>)}
          </select>
          {options.drivers.length === 0 && <small>{t('fleetNoFreeDrivers')}</small>}</div>
        <div className="form-row">
          <div className="form-field"><label htmlFor={`${id}-starts`}>{t('fleetStartsAt')}</label><input id={`${id}-starts`} type="datetime-local" step={900} value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></div>
          <div className="form-field"><label htmlFor={`${id}-ends`}>{t('fleetEndsAt')}</label><input id={`${id}-ends`} type="datetime-local" step={900} value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></div>
        </div>
      </div>}
    </div>}
  </ActionDialog>;
}

/** จัดรถ and ไม่จัดรถ for one ใบ รอจัดรถ; the routes re-check fleet.manage. */
export function DispatchActions({ request }: { request: AssignTarget }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'assign' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decline(reason: string) {
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/fleet/requests/${encodeURIComponent(request.id)}/decline`, 'POST', { reason });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setDialog(null);
    router.refresh();
  }

  return <div className="request-actions fleet-dispatch-actions">
    <button type="button" onClick={() => setDialog('assign')}>{t('fleetAssign')}</button>
    <button type="button" className="button-danger" onClick={() => setDialog('decline')}>{t('fleetDecline')}</button>
    {dialog === 'assign' && <AssignDialog request={request} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} />}
    {dialog === 'decline' && <ActionDialog title={`${t('fleetDecline')} · ${request.reference}`} confirmLabel={t('confirmAction')} tone="danger" reason maxLength={500} isSubmitting={busy} error={error} onConfirm={(reason) => void decline(reason)} onClose={() => { setDialog(null); setError(null); }} />}
  </div>;
}
