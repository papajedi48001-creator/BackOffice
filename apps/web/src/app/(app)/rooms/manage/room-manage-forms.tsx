'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { roomErrorMessage } from '../room-display';

export interface ManagedRoom { id: string; name: string; place: string; capacity: number; equipment: string; ownerOrganizationId: string; ownerOrganizationName: string | null; isBookable: boolean; upcomingBookingCount: number; }
export interface ManagedAddon { id: string; name: string; unit: string; isActive: boolean; }

export function RoomManageForms({ rooms, addons, organizations }: { rooms: ManagedRoom[]; addons: ManagedAddon[]; organizations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const emptyRoom = { name: '', place: '', capacity: 10, equipment: '', ownerOrganizationId: organizations[0]?.id ?? '' };
  const [room, setRoom] = useState(emptyRoom);
  const [editingRoom, setEditingRoom] = useState<ManagedRoom | null>(null);
  const [closing, setClosing] = useState<ManagedRoom | null>(null);
  const [addon, setAddon] = useState({ name: '', unit: '' });
  const [editingAddon, setEditingAddon] = useState<ManagedAddon | null>(null);

  async function save(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<boolean> {
    setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { router.refresh(); return true; }
      setError(roomErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(t('roomActionFailed')); }
    return false;
  }

  const roomBody = (target: Omit<ManagedRoom, 'id' | 'ownerOrganizationName' | 'isBookable' | 'upcomingBookingCount'>, isBookable: boolean) => ({ name: target.name, place: target.place, capacity: target.capacity, equipment: target.equipment, ownerOrganizationId: target.ownerOrganizationId, isBookable });
  // Closing keeps existing bookings, so the manager sees how many are still to come before confirming.
  function toggleBookable(target: ManagedRoom) {
    if (target.isBookable && target.upcomingBookingCount > 0) { setClosing(target); return; }
    void save(`/api/rooms/${target.id}`, 'PATCH', roomBody(target, !target.isBookable));
  }
  function editRoom(target: ManagedRoom) {
    setEditingRoom(target);
    setRoom({ name: target.name, place: target.place, capacity: target.capacity, equipment: target.equipment, ownerOrganizationId: target.ownerOrganizationId });
  }
  function stopEditingRoom() { setEditingRoom(null); setRoom(emptyRoom); }
  async function submitRoom(event: React.FormEvent) {
    event.preventDefault();
    const saved = editingRoom ? await save(`/api/rooms/${editingRoom.id}`, 'PATCH', roomBody(room, editingRoom.isBookable)) : await save('/api/rooms', 'POST', { ...room, isBookable: true });
    if (saved) stopEditingRoom();
  }
  async function submitAddon(event: React.FormEvent) {
    event.preventDefault();
    const saved = editingAddon ? await save(`/api/rooms/addons/${editingAddon.id}`, 'PATCH', { ...addon, isActive: editingAddon.isActive }) : await save('/api/rooms/addons', 'POST', { ...addon, isActive: true });
    if (saved) { setEditingAddon(null); setAddon({ name: '', unit: '' }); }
  }

  return <div className="room-manage">
    {error && <p role="alert" className="form-error">{error}</p>}
    <table><thead><tr><th>{t('roomName')}</th><th>{t('roomPlace')}</th><th>{t('roomCapacity')}</th><th>{t('roomOwner')}</th><th>{t('status')}</th><th /></tr></thead>
      <tbody>{rooms.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.place}</td><td>{item.capacity}</td><td>{item.ownerOrganizationName}</td><td>{item.isBookable ? t('roomBookable') : t('roomClosed')}</td>
        <td className="row-actions"><button type="button" className="button-secondary" aria-label={`${t('editItem')} ${item.name}`} onClick={() => editRoom(item)}>{t('editItem')}</button>
          <button type="button" aria-label={`${item.isBookable ? t('closeForBooking') : t('openForBooking')} ${item.name}`} onClick={() => toggleBookable(item)}>{item.isBookable ? t('closeForBooking') : t('openForBooking')}</button></td></tr>)}</tbody></table>
    {closing && <div role="alertdialog" aria-labelledby="close-room-warning" className="room-conflicts">
      <p id="close-room-warning">{closing.name}: {t('closeRoomWarningPrefix')} {closing.upcomingBookingCount} {t('closeRoomWarningSuffix')}</p>
      <div className="form-actions"><button type="button" className="button-danger" onClick={async () => { if (await save(`/api/rooms/${closing.id}`, 'PATCH', roomBody(closing, false))) setClosing(null); }}>{t('confirmCloseForBooking')}</button>
        <button type="button" className="button-secondary" onClick={() => setClosing(null)}>{t('cancelEdit')}</button></div>
    </div>}

    <form className="room-form" onSubmit={submitRoom}>
      <h3>{editingRoom ? `${t('editRoom')} ${editingRoom.name}` : t('addRoom')}</h3>
      <div className="form-field"><label htmlFor="room-name">{t('roomName')}</label><input id="room-name" value={room.name} maxLength={120} onChange={(event) => setRoom({ ...room, name: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="room-place">{t('roomPlace')}</label><input id="room-place" value={room.place} maxLength={200} onChange={(event) => setRoom({ ...room, place: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="room-capacity">{t('roomCapacity')}</label><input id="room-capacity" type="number" min={1} max={1000} value={room.capacity} onChange={(event) => setRoom({ ...room, capacity: Number(event.target.value) })} required /></div>
      <div className="form-field"><label htmlFor="room-equipment">{t('roomEquipment')}</label><input id="room-equipment" value={room.equipment} maxLength={1000} onChange={(event) => setRoom({ ...room, equipment: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="room-owner">{t('roomOwner')}</label><select id="room-owner" value={room.ownerOrganizationId} onChange={(event) => setRoom({ ...room, ownerOrganizationId: event.target.value })}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>
      <div className="form-actions"><button type="submit">{editingRoom ? t('saveRoom') : t('addRoom')}</button>{editingRoom && <button type="button" className="button-secondary" onClick={stopEditingRoom}>{t('cancelEdit')}</button>}</div>
    </form>

    <h3>{t('bookingAddons')}</h3>
    <table><thead><tr><th>{t('addonName')}</th><th>{t('addonUnit')}</th><th>{t('status')}</th><th /></tr></thead>
      <tbody>{addons.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.unit}</td><td>{item.isActive ? t('addonActive') : t('roomClosed')}</td>
        <td className="row-actions"><button type="button" className="button-secondary" aria-label={`${t('editItem')} ${item.name}`} onClick={() => { setEditingAddon(item); setAddon({ name: item.name, unit: item.unit }); }}>{t('editItem')}</button>
          <button type="button" aria-label={`${item.isActive ? t('deactivateAddon') : t('activateAddon')} ${item.name}`} onClick={() => void save(`/api/rooms/addons/${item.id}`, 'PATCH', { name: item.name, unit: item.unit, isActive: !item.isActive })}>{item.isActive ? t('deactivateAddon') : t('activateAddon')}</button></td></tr>)}</tbody></table>
    <form className="room-form" onSubmit={submitAddon}>
      <h3>{editingAddon ? `${t('editAddon')} ${editingAddon.name}` : t('addAddon')}</h3>
      <div className="form-field"><label htmlFor="addon-name">{t('addonName')}</label><input id="addon-name" value={addon.name} maxLength={120} onChange={(event) => setAddon({ ...addon, name: event.target.value })} required /></div>
      <div className="form-field"><label htmlFor="addon-unit">{t('addonUnit')}</label><input id="addon-unit" value={addon.unit} maxLength={30} onChange={(event) => setAddon({ ...addon, unit: event.target.value })} required /></div>
      <div className="form-actions"><button type="submit">{editingAddon ? t('saveAddon') : t('addAddon')}</button>{editingAddon && <button type="button" className="button-secondary" onClick={() => { setEditingAddon(null); setAddon({ name: '', unit: '' }); }}>{t('cancelEdit')}</button>}</div>
    </form>
  </div>;
}
