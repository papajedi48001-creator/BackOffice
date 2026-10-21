import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../lib/actor';
import { getSharedDatabase } from '../../../../lib/database';
import { BookingTable } from './booking-table';

export default async function MyRoomBookingsPage() {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('myRoomBookings')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const bookings = await new RoomBookingQueries(database).myBookings(actor.personId);
  const now = new Date();
  const isUpcoming = (booking: (typeof bookings)[number]) => (booking.status === 'PENDING' || booking.status === 'APPROVED') && booking.lastEndsAt !== null && booking.lastEndsAt > now;
  return <section>
    <div className="page-heading"><h2>{t('myRoomBookings')}</h2><nav className="page-actions"><Link className="button-link" href="/rooms/bookings/new">{t('bookRoom')}</Link></nav></div>
    <h3>{t('upcomingBookings')}</h3><BookingTable bookings={bookings.filter(isUpcoming).reverse()} />
    <h3>{t('pastBookings')}</h3><BookingTable bookings={bookings.filter((booking) => !isUpcoming(booking)).map((booking) => ({ ...booking, expired: booking.status === 'PENDING' }))} />
  </section>;
}
