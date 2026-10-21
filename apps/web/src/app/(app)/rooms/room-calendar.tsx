import { t } from '@backoffice/i18n';
import type { RoomBookingStatus } from '@backoffice/contracts';
import { formatBangkokDate, formatBangkokTime, formatWeekday } from '../../../lib/bangkok-time';
import { RoomStatusBadge } from './room-display';

export interface CalendarEntryView { bookingId: string; reference: string; roomId: string; roomName: string; date: string; startsAt: string; endsAt: string; status: RoomBookingStatus; title: string; bookerName: string | null; bookerOrganizationName: string | null; }

export function RoomCalendar({ dates, entries }: { dates: string[]; entries: CalendarEntryView[] }) {
  return <div className="room-calendar">{dates.map((date) => {
    const headingId = `room-day-${date}`;
    const dayEntries = entries.filter((entry) => entry.date === date);
    return <section key={date} className="room-day" aria-labelledby={headingId}>
      <h3 id={headingId}>{formatWeekday(date)} {formatBangkokDate(date)}</h3>
      {dayEntries.length === 0 ? <p className="room-day-empty">{t('noRoomsOnDay')}</p> : <ul>{dayEntries.map((entry) => <li key={`${entry.bookingId}-${entry.date}`} className={`room-slot room-slot-${entry.status.toLowerCase()}`}>
        <span className="room-slot-time">{formatBangkokTime(entry.startsAt)}–{formatBangkokTime(entry.endsAt)}</span>
        <span className="room-slot-room">{entry.roomName}</span>
        <strong className="room-slot-title">{entry.title}</strong>
        <span className="room-slot-booker">{[entry.bookerName, entry.bookerOrganizationName].filter(Boolean).join(' · ')}</span>
        <RoomStatusBadge status={entry.status} />
      </li>)}</ul>}
    </section>;
  })}</div>;
}
