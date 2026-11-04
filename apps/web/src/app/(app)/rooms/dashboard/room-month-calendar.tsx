'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { RoomBookingStatus } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { formatBangkokDate, formatBangkokTime } from '../../../../lib/bangkok-time';
import type { MonthGrid } from '../month-grid';
import { RoomStatusBadge } from '../room-display';

/** What the browser gets for one booked day: public fields only, with `canOpen` already decided on the server. */
export interface MonthEntryView { bookingId: string; reference: string; roomName: string; roomPlace: string; date: string; startsAt: string; endsAt: string; status: RoomBookingStatus; title: string; bookerName: string | null; bookerOrganizationName: string | null; canOpen: boolean; }

const SHOWN_PER_DAY = 3;
const weekdayKeys: MessageKey[] = ['roomWeekdayMon', 'roomWeekdayTue', 'roomWeekdayWed', 'roomWeekdayThu', 'roomWeekdayFri', 'roomWeekdaySat', 'roomWeekdaySun'];
const timeRange = (entry: MonthEntryView) => `${formatBangkokTime(entry.startsAt)}–${formatBangkokTime(entry.endsAt)}`;
const booker = (entry: MonthEntryView) => [entry.bookerName, entry.bookerOrganizationName].filter(Boolean).join(' · ');

/**
 * Month dashboard: every day of whole Mon–Sun weeks with its bookings; a booking opens its details in a popup.
 * `dayHref` is a link template with `{date}`, because a server page cannot hand a function to a client component.
 */
export function RoomMonthCalendar({ grid, entries, dayHref }: { grid: MonthGrid; entries: MonthEntryView[]; dayHref: string }) {
  const [selected, setSelected] = useState<MonthEntryView | null>(null);
  // The popup is removed rather than closed, so focus goes back to the booking that opened it by hand.
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (!selected) opener.current?.focus(); }, [selected]);
  const byDate = new Map<string, MonthEntryView[]>();
  for (const entry of entries) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  return <div className="room-month">
    <div className="room-month-weekdays" aria-hidden="true">{weekdayKeys.map((key) => <span key={key}>{t(key)}</span>)}</div>
    <div className="room-month-grid">{grid.weeks.flat().map((day) => {
      const dayEntries = byDate.get(day.date) ?? [];
      const classes = ['room-month-day', day.inMonth ? '' : 'is-outside', day.isPast ? 'is-past' : '', day.isToday ? 'is-today' : '', dayEntries.length === 0 ? 'is-empty' : ''].filter(Boolean).join(' ');
      return <div key={day.date} role="group" className={classes} aria-label={formatBangkokDate(day.date)} aria-current={day.isToday ? 'date' : undefined}>
        <h3><span className="room-month-number" aria-hidden="true">{Number(day.date.slice(8))}</span><span className="room-month-fulldate">{formatBangkokDate(day.date)}</span>{day.isToday && <span className="room-month-today">{t('roomToday')}</span>}</h3>
        {dayEntries.length > 0 && <ul>
          {dayEntries.slice(0, SHOWN_PER_DAY).map((entry) => <li key={`${entry.bookingId}-${entry.date}`}>
            <button type="button" className={`room-month-entry room-month-entry-${entry.status.toLowerCase()}`} aria-label={`${timeRange(entry)} ${entry.roomName} ${entry.title} — ${booker(entry)}`} onClick={(event) => { opener.current = event.currentTarget; setSelected(entry); }}>
              <span className="room-month-entry-time">{formatBangkokTime(entry.startsAt)}</span>
              <span className="room-month-entry-room">{entry.roomName}</span>
              <span className="room-month-entry-booker">{entry.bookerName ?? ''}</span>
            </button>
            <span className="visually-hidden"><RoomStatusBadge status={entry.status} /></span>
          </li>)}
          {dayEntries.length > SHOWN_PER_DAY && <li><Link className="room-month-more" href={dayHref.replace('{date}', day.date)}>+{dayEntries.length - SHOWN_PER_DAY} {t('roomMoreItems')}</Link></li>}
        </ul>}
      </div>;
    })}</div>
    {selected && <BookingDialog entry={selected} onClose={() => setSelected(null)} />}
  </div>;
}

function BookingDialog({ entry, onClose }: { entry: MonthEntryView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
  }, []);
  return <dialog ref={ref} className="action-dialog room-booking-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="action-dialog-panel">
      <header className="action-dialog-header">
        <div><p className="room-booking-dialog-reference">{entry.reference}</p><h2 id={titleId}>{entry.title}</h2></div>
        <button type="button" className="action-dialog-close" aria-label={t('roomDialogClose')} onClick={onClose}>×</button>
      </header>
      <dl className="room-booking-dialog-facts">
        <div><dt>{t('status')}</dt><dd><RoomStatusBadge status={entry.status} /></dd></div>
        <div><dt>{t('roomField')}</dt><dd>{entry.roomName} · {entry.roomPlace}</dd></div>
        <div><dt>{t('bookingDays')}</dt><dd>{formatBangkokDate(entry.date)}</dd></div>
        <div><dt>{t('roomBookingTime')}</dt><dd>{timeRange(entry)}</dd></div>
        <div><dt>{t('bookingBooker')}</dt><dd>{booker(entry)}</dd></div>
      </dl>
      {entry.canOpen && <footer className="action-dialog-actions">
        <Link className="button-link" href={`/rooms/bookings/${entry.bookingId}`}>{t('roomOpenBooking')}</Link>
      </footer>}
    </div>
  </dialog>;
}
