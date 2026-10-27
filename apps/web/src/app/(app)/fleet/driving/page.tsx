import Link from 'next/link';
import { t } from '@backoffice/i18n';
import { formatFleetRange } from '../../../../lib/fleet-labels';
import { fleetContext, FleetPageMessage, TripStatusPill } from '../fleet-page';
import { TripLogActions } from './trip-log-actions';

/** งานขับของฉัน, mobile first: the driver's เที่ยวรถ today and ahead, who to pick up and call, and the odometer log. */
export default async function FleetDrivingPage() {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetDriving" reason={context.reason} />;
  const { queries, session } = context;
  // The section shows to everyone; only an active พนักงานขับรถ has work here.
  if (!(await queries.isActiveDriver(session.personId))) return <section><h2>{t('fleetDriving')}</h2><p className="permission-notice">{t('fleetDrivingNotDriver')}</p></section>;
  const trips = await queries.driving(session.personId);
  return <section className="fleet-driving">
    <h2>{t('fleetDriving')}</h2>
    {trips.length === 0 ? <p>{t('fleetDrivingEmpty')}</p> : trips.map((trip) => {
      const label = `${trip.registration} ${formatFleetRange(trip.startsAt, trip.endsAt)}`;
      return <article key={trip.id} className="fleet-drive-card" aria-label={`${t('fleetTrip')} ${label}`}>
        <header><strong>{formatFleetRange(trip.startsAt, trip.endsAt)}</strong><TripStatusPill status={trip.status} /></header>
        <p><Link href={`/fleet/trips/${trip.id}`}>{trip.registration}</Link> · {trip.makeModel}</p>
        {trip.odometerOut !== null && <p>{t('fleetOdometerOut')} {trip.odometerOut.toLocaleString('th-TH')}{trip.odometerIn !== null ? ` · ${t('fleetOdometerIn')} ${trip.odometerIn.toLocaleString('th-TH')}` : ''}</p>}
        <ul className="fleet-drive-requests">{trip.requests.map((request) => <li key={request.id}>
          <strong>{request.destination}</strong> · {request.passengerCount} {t('fleetPeopleUnit')}<br />
          {request.requesterName ?? '—'}{request.contactPhone && <> · <a className="fleet-call" href={`tel:${request.contactPhone}`}>{t('fleetCall')} {request.contactPhone}</a></>}
        </li>)}</ul>
        <TripLogActions tripId={trip.id} status={trip.status} label={trip.registration} />
      </article>;
    })}
  </section>;
}
