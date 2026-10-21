import { redirect } from 'next/navigation';
import { RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../../lib/actor';
import { bangkokToday } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { BookingForm } from './booking-form';

export default async function NewRoomBookingPage() {
  if (!(await pageActor())) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomBookingNewTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const queries = new RoomBookingQueries(database);
  const [rooms, addons] = await Promise.all([queries.listRooms({ bookableOnly: true }), queries.listAddons({ activeOnly: true })]);
  return <section><h2>{t('roomBookingNewTitle')}</h2><BookingForm rooms={rooms} addons={addons} today={bangkokToday()} /></section>;
}
