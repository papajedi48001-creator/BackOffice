import { notFound, redirect } from 'next/navigation';
import { RoomBookingQueries } from '@backoffice/core';
import { pageActor } from '../../../../../../lib/actor';
import { getSharedDatabase } from '../../../../../../lib/database';

/** Where a คำขอ notice about a room booking lands: the booking page, which checks who may see it. */
export default async function RoomBookingByRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) notFound();
  const bookingId = await new RoomBookingQueries(database).bookingIdForRequest((await params).requestId);
  if (!bookingId) notFound();
  redirect(`/rooms/bookings/${bookingId}`);
}
