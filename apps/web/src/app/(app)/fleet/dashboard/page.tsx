import Link from 'next/link';
import type { BoardTrip, FleetDashboard } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { formatBangkokTime } from '../../../../lib/bangkok-time';
import { formatFleetRange, toBangkokLocal, tripStatusLabel, vehicleStatusLabel } from '../../../../lib/fleet-labels';
import { fleetContext, FleetPageMessage, TripStatusPill } from '../fleet-page';
import { DispatchActions } from './assign-dialog';

const BOARD_START = 6 * 60;
const BOARD_END = 22 * 60;
const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

/** Minutes after Bangkok midnight of `today`, clamped to the 06:00–22:00 board. */
function boardMinute(iso: string, today: string): number {
  const local = toBangkokLocal(iso);
  const day = local.slice(0, 10);
  if (day < today) return BOARD_START;
  if (day > today) return BOARD_END;
  const minute = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  return Math.min(BOARD_END, Math.max(BOARD_START, minute));
}

function BoardBar({ trip, today }: { trip: BoardTrip; today: string }) {
  const start = boardMinute(trip.startsAt, today);
  const end = Math.max(boardMinute(trip.endsAt, today), start + 15);
  const span = BOARD_END - BOARD_START;
  const label = `${formatBangkokTime(trip.startsAt)}–${formatBangkokTime(trip.endsAt)} · ${trip.driverName ?? '—'} · ${tripStatusLabel(trip.status)}`;
  return <Link href={`/fleet/trips/${trip.id}`} className={`fleet-bar fleet-bar-${trip.status.toLowerCase()}`} style={{ left: `${((start - BOARD_START) / span) * 100}%`, width: `${((end - start) / span) * 100}%` }} title={label}>{label}</Link>;
}

const counts: Array<[keyof FleetDashboard['counts'], MessageKey]> = [['waiting', 'fleetCountWaiting'], ['tripsToday', 'fleetCountTripsToday'], ['out', 'fleetCountOut'], ['inRepair', 'fleetCountInRepair']];

/** The หัวหน้าหมวดยานพาหนะ's dispatch centre: counts, the รอจัดรถ queue, today's board and เที่ยวรถ to reassign. */
export default async function FleetDashboardPage() {
  const context = await fleetContext({ manager: true });
  if (!context.ok) return <FleetPageMessage titleKey="fleetDashboard" reason={context.reason} />;
  const view = await context.queries.dashboard();
  const today = toBangkokLocal(new Date().toISOString()).slice(0, 10);
  return <section className="fleet-dashboard">
    <h2>{t('fleetDashboard')}</h2>
    <ul className="fleet-counts" aria-label={t('fleetDashboard')}>
      {counts.map(([key, label]) => <li key={key}><span>{t(label)}</span><strong>{view.counts[key]}</strong></li>)}
    </ul>

    <h3>{t('fleetQueue')}</h3>
    {view.queue.length === 0 ? <p>{t('fleetQueueEmpty')}</p> : <div className="leave-table-scroll fleet-queue"><table>
      <thead><tr><th>{t('fleetReference')}</th><th>{t('fleetRequester')}</th><th>{t('fleetDestination')}</th><th>{t('fleetTimes')}</th><th>{t('fleetPassengers')}</th><th></th></tr></thead>
      <tbody>{view.queue.map((item) => <tr key={item.id} className={item.overdue ? 'fleet-queue-overdue' : item.soon ? 'fleet-queue-soon' : undefined}>
        <td className="fleet-queue-reference"><Link href={`/fleet/requests/${item.id}`}>{item.reference}</Link>{(item.overdue || item.soon) && <><br /><span className="fleet-flag">{t(item.overdue ? 'fleetOverdue' : 'fleetSoon')}</span></>}</td>
        <td data-label={t('fleetRequester')}>{item.requesterName ?? '—'}<br /><small>{item.organizationName ?? ''}</small></td>
        <td data-label={t('fleetDestination')}>{item.destination} · {item.province}<br /><small>{item.purpose}</small></td>
        <td data-label={t('fleetTimes')}>{formatFleetRange(item.departAt, item.returnAt)}</td>
        <td data-label={t('fleetPassengers')}>{item.passengerCount} {t('fleetPeopleUnit')}</td>
        <td className="fleet-queue-actions"><DispatchActions request={{ id: item.id, reference: item.reference, departAt: item.departAt, returnAt: item.returnAt }} /></td>
      </tr>)}</tbody>
    </table></div>}

    <h3>{t('fleetBoard')}</h3>
    {view.board.length === 0 ? <p>{t('fleetBoardEmpty')}</p> : <div className="fleet-board" role="table" aria-label={t('fleetBoard')}>
      <div className="fleet-board-row fleet-board-head" role="row"><span role="columnheader">{t('fleetVehicle')}</span><div className="fleet-board-track" role="columnheader">{HOURS.map((hour) => <span key={hour} style={{ left: `${((hour * 60 - BOARD_START) / (BOARD_END - BOARD_START)) * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</div></div>
      {view.board.map(({ vehicle, trips }) => <div key={vehicle.id} className="fleet-board-row" role="row">
        <span role="rowheader"><strong>{vehicle.registration}</strong><br /><small>{vehicle.makeModel}{vehicle.status !== 'ACTIVE' ? ` · ${vehicleStatusLabel(vehicle.status)}` : ''}</small></span>
        <div className="fleet-board-track" role="cell">{trips.length === 0 ? <small className="fleet-board-free">{t('fleetBoardFree')}</small> : trips.map((trip) => <BoardBar key={trip.id} trip={trip} today={today} />)}</div>
      </div>)}
    </div>}

    {view.flagged.length > 0 && <>
      <h3>{t('fleetFlagged')}</h3>
      <p className="permission-notice">{t('fleetFlaggedHelp')}</p>
      <ul className="fleet-flagged">{view.flagged.map((trip) => <li key={trip.id}>
        <Link href={`/fleet/trips/${trip.id}`}>{trip.registration}</Link> · {vehicleStatusLabel(trip.vehicleStatus)} · {formatFleetRange(trip.startsAt, trip.endsAt)} · {trip.driverName ?? '—'} <TripStatusPill status={trip.status} />
      </li>)}</ul>
    </>}
  </section>;
}
