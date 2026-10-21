'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { roomErrorMessage } from '../room-display';

export interface ManagedRoom { id: string; name: string; place: string; capacity: number; equipment: string; ownerOrganizationId: string; ownerOrganizationName: string | null; isBookable: boolean; }
export interface ManagedAddon { id: string; name: string; unit: string; isActive: boolean; }

export function RoomManageForms({ rooms, addons, organizations }: { rooms: ManagedRoom[]; addons: ManagedAddon[]; organizations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState({ name: '', place: '', capacity: 10, equipment: '', ownerOrganizationId: organizations[0]?.id ?? '' });
  const [addon, setAddon] = useState({ name: '', unit: '' });

  async function save(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<boolean> {
    setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { router.refresh(); return true; }
      setError(roomErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(t('roomActionFailed')); }
    return false;
  }

  const roomBody = (target: ManagedRoom, isBookable: boolean) => ({ name: target.name, place: target.place, capacity: target.capacity, equipment: target.equipment, ownerOrganizationId: target.ownerOrganizationId, isBookable });

  return <div className="room-manage">
    {error && <p role="alert" className="form-error">{error}</p>}
    <table><thead><tr><th>{t('roomName')}</th><th>{t('roomPlace')}</th><th>{t('roomCapacity')}</th><th>{t('roomOwner')}</th><th>{t('status')}</th><th /></tr></thead>
      <tbody>{rooms.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.place}</td><td>{item.capacity}</td><td>{item.ownerOrganizationName}</td><td>{item.isBookable ? t('roomBookable') : t('roomClosed')}</td>
        <td><button type="button" aria-label={`${item.isBookable ? t('closeForBooking') : t('openForBooking')} ${item.name}`} onClick={() => void save(`/api/rooms/${item.id}`, 'PATCH', roomBody(item, !item.isBookable))}>{item.isBookable ? t('closeForBooking') : t('openForBooking')}</button></td></tr>)}</tbody></table>

    <form className="room-form" onSubmit={async (event) => { event.preventDefault(); if (await save('/api/rooms', 'POST', { ...room, isBookable: true })) setRoom({ ...room, name: '', place: '', equipment: '' }); }}>
      <h3>{t('addRoom')}</h3>
      <div className="form-field"><label htmlFor="room-name">{t('roomName')}</label><input id="room-name" value={room.name} maxLength={120} onChange={(event) => setRoom({ ...room, name: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="room-place">{t('roomPlace')}</label><input id="room-place" value={room.place} maxLength={200} onChange={(event) => setRoom({ ...room, place: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="room-capacity">{t('roomCapacity')}</label><input id="room-capacity" type="number" min={1} max={1000} value={room.capacity} onChange={(event) => setRoom({ ...room, capacity: Number(event.target.value) })} required /></div>
      <div className="form-field"><label htmlFor="room-equipment">{t('roomEquipment')}</label><input id="room-equipment" value={room.equipment} maxLength={1000} onChange={(event) => setRoom({ ...room, equipment: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="room-owner">{t('roomOwner')}</label><select id="room-owner" value={room.ownerOrganizationId} onChange={(event) => setRoom({ ...room, ownerOrganizationId: event.target.value })}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>
      <button type="submit">{t('addRoom')}</button>
    </form>

    <h3>{t('bookingAddons')}</h3>
    <table><thead><tr><th>{t('addonName')}</th><th>{t('addonUnit')}</th><th>{t('status')}</th><th /></tr></thead>
      <tbody>{addons.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.unit}</td><td>{item.isActive ? t('addonActive') : t('roomClosed')}</td>
        <td><button type="button" aria-label={`${item.isActive ? t('deactivateAddon') : t('activateAddon')} ${item.name}`} onClick={() => void save(`/api/rooms/addons/${item.id}`, 'PATCH', { name: item.name, unit: item.unit, isActive: !item.isActive })}>{item.isActive ? t('deactivateAddon') : t('activateAddon')}</button></td></tr>)}</tbody></table>
    <form className="room-form" onSubmit={async (event) => { event.preventDefault(); if (await save('/api/rooms/addons', 'POST', { ...addon, isActive: true })) setAddon({ name: '', unit: '' }); }}>
      <h3>{t('addAddon')}</h3>
      <div className="form-field"><label htmlFor="addon-name">{t('addonName')}</label><input id="addon-name" value={addon.name} maxLength={120} onChange={(event) => setAddon({ ...addon, name: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="addon-unit">{t('addonUnit')}</label><input id="addon-unit" value={addon.unit} maxLength={30} onChange={(event) => setAddon({ ...addon, unit: event.target.value })} required /></div>
      <button type="submit">{t('addAddon')}</button>
    </form>
  </div>;
}
