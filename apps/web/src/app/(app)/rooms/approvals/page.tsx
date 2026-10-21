import { redirect } from 'next/navigation';
import { RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../lib/actor';
import { getSharedDatabase } from '../../../../lib/database';
import { BookingTable } from '../bookings/booking-table';

export default async function RoomApprovalsPage() {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomApprovalsTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const pending = await new RoomBookingQueries(database).pendingForApprover(actor);
  return <section><h2>{t('roomApprovalsTitle')}</h2>{pending.length === 0 ? <p>{t('noPendingBookings')}</p> : <BookingTable bookings={pending} showBooker />}</section>;
}
