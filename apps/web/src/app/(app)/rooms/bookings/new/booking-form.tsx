'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { roomBookingPolicy } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { addDays, bangkokToday, datesBetween, formatBangkokDate, formatBangkokTime, timeOptions } from '../../../../../lib/bangkok-time';
import { roomErrorMessage } from '../../room-display';

export interface BookableRoom { id: string; name: string; capacity: number; place: string; }
export interface SelectableAddon { id: string; name: string; unit: string; }
type Conflict = { startsAt: string; endsAt: string };

export function BookingForm({ rooms, addons, today }: { rooms: BookableRoom[]; addons: SelectableAddon[]; today: string }) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [firstDate, setFirstDate] = useState(today);
  const [lastDate, setLastDate] = useState(today);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [startMinute, setStartMinute] = useState(540);
  const [endMinute, setEndMinute] = useState(720);
  const [title, setTitle] = useState('');
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [chosenAddons, setChosenAddons] = useState<Record<string, { quantity: number; note: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const lastBookable = addDays(today, roomBookingPolicy.maxAdvanceDays);
  const lastAllowed = [addDays(firstDate, roomBookingPolicy.maxDays - 1), lastBookable].sort()[0]!;
  const span = useMemo(() => datesBetween(firstDate, lastDate < firstDate ? firstDate : lastDate), [firstDate, lastDate]);
  // A longer range is refused outright rather than silently cut to the first 14 days.
  const tooLong = span.length > roomBookingPolicy.maxDays;
  const range = tooLong ? [] : span;
  const times = timeOptions();

  function toggleDay(date: string) {
    setExcluded((current) => { const next = new Set(current); if (next.has(date)) next.delete(date); else next.add(date); return next; });
  }
  function toggleAddon(addonId: string) {
    setChosenAddons((current) => { const next = { ...current }; if (next[addonId]) delete next[addonId]; else next[addonId] = { quantity: 1, note: '' }; return next; });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null); setConflicts([]);
    try {
      const response = await fetch('/api/rooms/bookings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, dates: range.filter((date) => !excluded.has(date)), startMinute, endMinute, title, attendeeCount, addons: Object.entries(chosenAddons).map(([addonId, choice]) => ({ addonId, quantity: choice.quantity, note: choice.note })) })
      });
      const body = await response.json() as { id?: string; error?: string; conflicts?: Conflict[] };
      if (response.ok && body.id) { router.push(`/rooms/bookings/${body.id}`); return; }
      if (body.error === 'BOOKING_CONFLICT') setConflicts(body.conflicts ?? []);
      else setError(roomErrorMessage(body.error));
    } catch { setError(t('roomActionFailed')); } finally { setSubmitting(false); }
  }

  return <form className="room-form" onSubmit={submit}>
    <div className="form-field"><label htmlFor="booking-room">{t('roomField')}</label><select id="booking-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.place}, {room.capacity} คน)</option>)}</select></div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="booking-first">{t('bookingStartDate')}</label><input id="booking-first" type="date" min={today} max={lastBookable} value={firstDate} onChange={(event) => setFirstDate(event.target.value)} required /></div>
      <div className="form-field"><label htmlFor="booking-last">{t('bookingEndDate')}</label><input id="booking-last" type="date" min={firstDate} max={lastAllowed} value={lastDate} onChange={(event) => setLastDate(event.target.value)} required /></div>
    </div>
    {tooLong && <p role="alert" className="form-error">{t('bookingRangeTooLong')}</p>}
    <fieldset className="room-days"><legend>{t('bookingDays')}</legend>{range.map((date) => <label key={date}><input type="checkbox" checked={!excluded.has(date)} onChange={() => toggleDay(date)} />{formatBangkokDate(date)}</label>)}</fieldset>
    <div className="form-row">
      <div className="form-field"><label htmlFor="booking-start">{t('bookingStartTime')}</label><select id="booking-start" value={startMinute} onChange={(event) => setStartMinute(Number(event.target.value))}>{times.slice(0, -1).map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}</select></div>
      <div className="form-field"><label htmlFor="booking-end">{t('bookingEndTime')}</label><select id="booking-end" value={endMinute} onChange={(event) => setEndMinute(Number(event.target.value))}>{times.slice(1).map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}</select></div>
    </div>
    <div className="form-field"><label htmlFor="booking-title">{t('bookingTitle')}</label><input id="booking-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required /></div>
    <div className="form-field"><label htmlFor="booking-attendees">{t('bookingAttendees')}</label><input id="booking-attendees" type="number" min={1} value={attendeeCount} onChange={(event) => setAttendeeCount(Number(event.target.value))} required /></div>
    {addons.length > 0 && <fieldset className="room-addons"><legend>{t('bookingAddons')}</legend>{addons.map((addon) => {
      const choice = chosenAddons[addon.id];
      return <div key={addon.id} className="room-addon-choice">
        <label><input type="checkbox" checked={Boolean(choice)} onChange={() => toggleAddon(addon.id)} />{addon.name}</label>
        {choice && <><label>{t('bookingAddonQuantity')} ({addon.unit})<input type="number" min={1} max={999} value={choice.quantity} onChange={(event) => setChosenAddons({ ...chosenAddons, [addon.id]: { ...choice, quantity: Number(event.target.value) } })} /></label>
          <label>{t('bookingAddonNote')}<input value={choice.note} maxLength={500} onChange={(event) => setChosenAddons({ ...chosenAddons, [addon.id]: { ...choice, note: event.target.value } })} /></label></>}
      </div>;
    })}</fieldset>}
    {conflicts.length > 0 && <div role="alert" className="room-conflicts"><p>{t('bookingConflictTitle')}</p><ul>{conflicts.map((conflict) => <li key={conflict.startsAt}>{formatBangkokDate(bangkokToday(new Date(conflict.startsAt)))} {formatBangkokTime(conflict.startsAt)}–{formatBangkokTime(conflict.endsAt)}</li>)}</ul></div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button type="submit" disabled={submitting || !roomId || tooLong}>{submitting ? t('submittingBooking') : t('submitBooking')}</button>
  </form>;
}
