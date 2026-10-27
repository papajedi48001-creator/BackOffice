import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canManageFleet } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../../../../../lib/bangkok-time';
import { formatFleetRange } from '../../../../../lib/fleet-labels';
import { TripLogActions } from '../../driving/trip-log-actions';
import { fleetContext, FleetPageMessage, TripStatusPill } from '../../fleet-page';
import { FleetUnassign } from '../../requests/[id]/fleet-actions';

/** รายละเอียดเที่ยวรถ for the หัวหน้าหมวด and its driver; the query returns nothing to anyone else. */
export default async function FleetTripPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetTrip" reason={context.reason} />;
  const trip = await context.queries.trip((await params).id, context.session);
  if (!trip) { notFound(); return null; }
  const manager = canManageFleet(context.session);
  return <section className="leave-detail fleet-detail">
    <div className="page-heading"><h2>{t('fleetTrip')} {trip.registration}</h2><TripStatusPill status={trip.status} /></div>
    <div className="detail-list">
      <div><strong>{t('fleetVehicle')}</strong><span>{trip.registration} · {trip.makeModel}</span></div>
      <div><strong>{t('fleetDriver')}</strong><span>{trip.driverName ?? '—'}{trip.driverPhone ? <> · <a href={`tel:${trip.driverPhone}`}>{trip.driverPhone}</a></> : null}</span></div>
      <div><strong>{t('fleetTimes')}</strong><span>{formatFleetRange(trip.startsAt, trip.endsAt)}</span></div>
      {trip.odometerOut !== null && <div><strong>{t('fleetOdometerOut')}</strong><span>{trip.odometerOut.toLocaleString('th-TH')}{trip.departedAt ? ` · ${formatBangkokDateTime(trip.departedAt)}` : ''}</span></div>}
      {trip.odometerIn !== null && <div><strong>{t('fleetOdometerIn')}</strong><span>{trip.odometerIn.toLocaleString('th-TH')}{trip.returnedAt ? ` · ${formatBangkokDateTime(trip.returnedAt)}` : ''}</span></div>}
    </div>
    <TripLogActions tripId={trip.id} status={trip.status} label={trip.registration} />
    <h3>{t('fleetRequest')}</h3>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('fleetReference')}</th><th>{t('fleetRequester')}</th><th>{t('fleetDestination')}</th><th>{t('fleetPassengers')}</th><th></th></tr></thead>
      <tbody>{trip.requests.map((request) => <tr key={request.id}>
        <td><Link href={`/fleet/requests/${request.id}`}>{request.reference}</Link></td>
        <td>{request.requesterName ?? '—'}{request.requesterPhone && <> · <a href={`tel:${request.requesterPhone}`}>{request.requesterPhone}</a></>}</td>
        <td>{request.destination}</td>
        <td>{request.passengerCount} {t('fleetPeopleUnit')}</td>
        <td>{manager && trip.status === 'PLANNED' && <FleetUnassign fleetRequestId={request.id} />}</td>
      </tr>)}</tbody>
    </table></div>
    <p><Link href={manager ? '/fleet/dashboard' : '/fleet/driving'}>{t(manager ? 'fleetDashboard' : 'fleetDriving')}</Link></p>
  </section>;
}
