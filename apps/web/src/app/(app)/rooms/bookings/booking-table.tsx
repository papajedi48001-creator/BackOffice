import Link from 'next/link';
import { t } from '@backoffice/i18n';
import type { RoomBookingStatus } from '@backoffice/contracts';
import { formatBangkokDate, formatMinutes } from '../../../../lib/bangkok-time';
import { RoomStatusBadge } from '../room-display';

export interface BookingRowView { id: string; reference: string; roomName: string; title: string; status: RoomBookingStatus; firstDate: string; lastDate: string; startMinute: number; endMinute: number; bookerName?: string | null; bookerOrganizationName?: string | null; expired?: boolean; }

export function BookingTable({ bookings, showBooker = false }: { bookings: BookingRowView[]; showBooker?: boolean }) {
  if (bookings.length === 0) return <p>{t('noRoomBookings')}</p>;
  return <table><thead><tr><th>{t('bookingReference')}</th><th>{t('roomField')}</th><th>{t('bookingDays')}</th><th>{t('bookingTitle')}</th>{showBooker && <th>{t('bookingBooker')}</th>}<th>{t('status')}</th></tr></thead>
    <tbody>{bookings.map((booking) => <tr key={booking.id}>
      <td><Link href={`/rooms/bookings/${booking.id}`}>{booking.reference}</Link></td>
      <td>{booking.roomName}</td>
      <td>{formatBangkokDate(booking.firstDate)}{booking.lastDate !== booking.firstDate ? ` – ${formatBangkokDate(booking.lastDate)}` : ''} {formatMinutes(booking.startMinute)}–{formatMinutes(booking.endMinute)}</td>
      <td>{booking.title}</td>
      {showBooker && <td>{[booking.bookerName, booking.bookerOrganizationName].filter(Boolean).join(' · ')}</td>}
      <td><RoomStatusBadge status={booking.status} expired={booking.expired} /></td>
    </tr>)}</tbody></table>;
}
