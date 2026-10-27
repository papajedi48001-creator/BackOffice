import type { FleetRequestStatus, Session, TripStatus } from '@backoffice/contracts';
import { canManageFleet, FleetQueries, type TravelDetail } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../lib/database';
import { fleetStatusLabel, fleetStatusTone, tripStatusLabel } from '../../../lib/fleet-labels';
import { leaveSession } from '../leave/leave-page';
import type { FleetFormValues } from './new/fleet-form';

type FleetSession = Session & { personId: string };
export type FleetContext = { ok: true; session: FleetSession; queries: FleetQueries } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

/** The signed-in session for a fleet page; a visitor without one is sent to sign in. */
export const fleetSession = leaveSession;

/** The session and the reads for a fleet page, or why it cannot show. `manager` pages also need `fleet.manage`, checked here on the server. */
export async function fleetContext({ manager = false } = {}): Promise<FleetContext> {
  const session = await fleetSession();
  if (!session) return { ok: false, reason: 'none' };
  if (manager && !canManageFleet(session)) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  return database ? { ok: true, session, queries: new FleetQueries(database) } : { ok: false, reason: 'unavailable' };
}

/** The page title and why it cannot show: nothing for a visitor being sent to sign in, otherwise a no-access or load-error notice. */
export function FleetPageMessage({ titleKey, reason }: { titleKey: MessageKey; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{t(titleKey)}</h2><p role="alert">{t(reason === 'forbidden' ? 'hrNoAccess' : 'fleetLoadError')}</p></section>;
}

export function FleetStatus({ status }: { status: FleetRequestStatus }) {
  return <span className={`status status-${fleetStatusTone(status)}`}>{fleetStatusLabel(status)}</span>;
}
export function TripStatusPill({ status }: { status: TripStatus }) {
  return <span className={`status status-${fleetStatusTone(status)}`}>{tripStatusLabel(status)}</span>;
}

type TravelForPrefill = Pick<TravelDetail, 'subject' | 'place' | 'province' | 'startDate' | 'endDate' | 'startHalf' | 'endHalf' | 'members'>;

/** ขอใช้รถ from ไปราชการ: subject, place and province; out at 08:00 (13:00 after a morning off) and back at 17:00 (12:00 for a morning-only last day), Bangkok; the approved people. */
export function travelPrefill(travel: TravelForPrefill): FleetFormValues {
  const going = travel.members.filter((member) => member.status === 'APPROVED');
  return {
    purpose: travel.subject, destination: travel.place, province: travel.province,
    departAt: `${travel.startDate}T${travel.startHalf === 'AFTERNOON' ? '13:00' : '08:00'}`,
    returnAt: `${travel.endDate}T${travel.endHalf === 'MORNING' ? '12:00' : '17:00'}`,
    passengerCount: String(Math.max(1, going.length)),
    passengerNames: going.map((member) => member.displayName ?? '').filter(Boolean).join(', ')
  };
}
