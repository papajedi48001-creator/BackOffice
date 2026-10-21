import { notFound, redirect } from 'next/navigation';
import { RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../../lib/actor';
import { bangkokToday, formatBangkokDate, formatBangkokTime, formatMinutes } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { historyActionLabel, RoomStatusBadge } from '../../room-display';
import { bookingViewState } from '../../booking-state';
import { BookingActions } from './booking-actions';

export default async function RoomBookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomBookingDetailTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const { bookingId } = await params;
  const booking = await new RoomBookingQueries(database).detail(bookingId, actor);
  if (!booking) notFound();
  const { expired, canDecide, cancelAction } = bookingViewState(booking, new Date());
  return <section>
    <h2>{t('roomBookingDetailTitle')}</h2>
    <dl className="detail-list">
      <div><dt>{t('bookingReference')}</dt><dd>{booking.reference}</dd></div>
      <div><dt>{t('status')}</dt><dd><RoomStatusBadge status={booking.status} expired={expired} /></dd></div>
      <div><dt>{t('roomField')}</dt><dd>{booking.roomName} ({booking.roomPlace})</dd></div>
      <div><dt>{t('bookingTitle')}</dt><dd>{booking.title}</dd></div>
      <div><dt>{t('bookingBooker')}</dt><dd>{[booking.bookerName, booking.bookerOrganizationName].filter(Boolean).join(' · ')}</dd></div>
      <div><dt>{t('bookingAttendees')}</dt><dd>{booking.attendeeCount}</dd></div>
      <div><dt>{t('bookingDays')}</dt><dd><ul className="plain-list">{booking.days.map((day) => <li key={day.id}>{formatBangkokDate(day.date)} {formatMinutes(booking.startMinute)}–{formatMinutes(booking.endMinute)}{day.status === 'RELEASED' ? ` (${t('roomDayReleased')})` : ''}</li>)}</ul></dd></div>
      {booking.addons.length > 0 && <div><dt>{t('bookingAddons')}</dt><dd><ul className="plain-list">{booking.addons.map((addon) => <li key={addon.addonName}>{addon.addonName} {addon.quantity} {addon.addonUnit}{addon.note ? ` — ${addon.note}` : ''}</li>)}</ul></dd></div>}
    </dl>
    <BookingActions bookingId={booking.id} canDecide={canDecide} cancelAction={cancelAction} cancelByAdmin={!booking.viewerIsBooker} />
    <h3>{t('bookingHistory')}</h3>
    <ol className="booking-history">{booking.history.map((entry, index) => <li key={index}><time dateTime={entry.createdAt.toISOString()}>{formatBangkokDate(bangkokToday(entry.createdAt))} {formatBangkokTime(entry.createdAt)}</time> {historyActionLabel(entry.action)} — {entry.actorName ?? ''}{entry.reason ? <p>{t('bookingReason')}: {entry.reason}</p> : null}</li>)}</ol>
  </section>;
}
