import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canManageFleet } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../../../../../lib/bangkok-time';
import { fleetHistoryLabel, formatFleetRange, toBangkokLocal } from '../../../../../lib/fleet-labels';
import { DispatchActions } from '../../dashboard/assign-dialog';
import { fleetContext, FleetPageMessage, FleetStatus } from '../../fleet-page';
import { FleetForm } from '../../new/fleet-form';
import { FleetCancel, FleetUnassign, HeadDecision } from './fleet-actions';

/** รายละเอียดใบ: who may see it, and which actions they get, is decided by the query on the server. */
export default async function FleetRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetRequest" reason={context.reason} />;
  const view = await context.queries.detail((await params).id, context.session);
  if (!view) { notFound(); return null; }
  const manager = canManageFleet(context.session);
  return <section className="leave-detail fleet-detail">
    <div className="page-heading"><h2>{t('fleetRequest')} {view.reference}</h2><FleetStatus status={view.status} /></div>
    <div className="detail-list">
      <div><strong>{t('fleetRequester')}</strong><span>{view.requesterName ?? '—'}{view.organizationName ? ` · ${view.organizationName}` : ''}</span></div>
      <div><strong>{t('fleetPurpose')}</strong><span>{view.purpose}</span></div>
      <div><strong>{t('fleetDestination')}</strong><span>{view.destination} · {view.province}</span></div>
      <div><strong>{t('fleetTimes')}</strong><span>{formatFleetRange(view.departAt, view.returnAt)}</span></div>
      <div><strong>{t('fleetPassengers')}</strong><span>{view.passengerCount} {t('fleetPeopleUnit')}{view.passengerNames ? ` · ${view.passengerNames}` : ''}</span></div>
      {view.contactPhone && <div><strong>{t('fleetContactPhoneShort')}</strong><span><a href={`tel:${view.contactPhone}`}>{view.contactPhone}</a></span></div>}
      {view.officialTravelId && <div><strong>{t('moduleTravel')}</strong><span><Link href={`/travel/${view.officialTravelId}`}>{t('fleetOpenTravel')}</Link></span></div>}
      {view.trip && <>
        <div><strong>{t('fleetVehicle')}</strong><span>{view.trip.registration} · {view.trip.makeModel}</span></div>
        <div><strong>{t('fleetDriver')}</strong><span>{view.trip.driverName ?? '—'}</span></div>
        <div><strong>{t('fleetDriverPhone')}</strong><span>{view.trip.driverPhone ? <a href={`tel:${view.trip.driverPhone}`}>{view.trip.driverPhone}</a> : '—'}</span></div>
      </>}
    </div>
    <div className="request-actions">
      {view.canDecide && view.requestId && <HeadDecision requestId={view.requestId} />}
      {view.canCancel && <FleetCancel fleetRequestId={view.id} />}
      {manager && view.trip?.status === 'PLANNED' && <FleetUnassign fleetRequestId={view.id} />}
      {manager && view.trip && <Link className="button-link" href={`/fleet/trips/${view.trip.id}`}>{t('fleetOpenTrip')}</Link>}
    </div>
    {view.canDispatch && <DispatchActions request={{ id: view.id, reference: view.reference, departAt: view.departAt, returnAt: view.returnAt }} />}
    <h3>{t('fleetHistory')}</h3>
    <ol className="fleet-history" aria-label={t('fleetHistory')}>{view.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
      {formatBangkokDateTime(entry.createdAt)} · {fleetHistoryLabel(entry.action)} · {entry.actorName ?? '—'}{entry.reason ? ` · ${entry.reason}` : ''}
    </li>)}</ol>
    {view.canResubmit && <><h3>{t('fleetEditReturned')}</h3><FleetForm fleetRequestId={view.id} initial={{
      purpose: view.purpose, destination: view.destination, province: view.province, departAt: toBangkokLocal(view.departAt), returnAt: toBangkokLocal(view.returnAt),
      passengerCount: String(view.passengerCount), passengerNames: view.passengerNames, contactPhone: view.contactPhone
    }} /></>}
    <p><Link href="/fleet/mine">{t('fleetBack')}</Link></p>
  </section>;
}
