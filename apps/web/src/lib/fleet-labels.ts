import type { FleetRequestStatus, TripStatus, VehicleKind, VehicleStatus } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { formatBangkokDate, formatBangkokTime } from './bangkok-time';

const BANGKOK_MS = 7 * 3_600_000;

const statusKeys: Record<FleetRequestStatus, MessageKey> = {
  HEAD_REVIEW: 'fleetStatusHeadReview', RETURNED: 'fleetStatusReturned', HEAD_REJECTED: 'fleetStatusHeadRejected', WAITING: 'fleetStatusWaiting', ASSIGNED: 'fleetStatusAssigned',
  DEPARTED: 'fleetStatusDeparted', DONE: 'fleetStatusDone', DECLINED: 'fleetStatusDeclined', CANCELLED: 'fleetStatusCancelled'
};
/** Each status reuses one of the shared pill colours, so a status never reads by the module colour. */
const statusTones: Record<FleetRequestStatus | TripStatus, string> = {
  HEAD_REVIEW: 'in_review', RETURNED: 'returned', HEAD_REJECTED: 'rejected', WAITING: 'pending', ASSIGNED: 'approved', DEPARTED: 'approved', DONE: 'approved', DECLINED: 'rejected', CANCELLED: 'cancelled',
  PLANNED: 'pending'
};
const tripKeys: Record<TripStatus, MessageKey> = { PLANNED: 'fleetTripPlanned', DEPARTED: 'fleetTripDeparted', RETURNED: 'fleetTripReturned', CANCELLED: 'fleetTripCancelled' };
const kindKeys: Record<VehicleKind, MessageKey> = { SEDAN: 'fleetKindSedan', PICKUP: 'fleetKindPickup', VAN: 'fleetKindVan', AMBULANCE: 'fleetKindAmbulance', OTHER: 'fleetKindOther' };
const vehicleStatusKeys: Record<VehicleStatus, MessageKey> = { ACTIVE: 'fleetVehicleActive', IN_REPAIR: 'fleetVehicleInRepair', RETIRED: 'fleetVehicleRetired' };
const historyKeys: Record<string, MessageKey> = { SUBMITTED: 'fleetHistorySubmitted', FILED_FROM_TRAVEL: 'fleetHistoryFiledFromTravel', RESUBMITTED: 'fleetHistoryResubmitted', CANCELLED: 'fleetHistoryCancelled', ASSIGNED: 'fleetHistoryAssigned', UNASSIGNED: 'fleetHistoryUnassigned', DECLINED: 'fleetHistoryDeclined',
  HEAD_APPROVE: 'fleetHeadApprove', HEAD_RETURN: 'fleetHeadReturn', HEAD_REJECT: 'fleetHeadReject' };
const errorKeys: Record<string, MessageKey> = {
  INVALID_RANGE: 'fleetErrorInvalidRange', IN_PAST: 'fleetErrorInPast', TOO_FAR_AHEAD: 'fleetErrorTooFarAhead', TOO_LONG: 'fleetErrorTooLong', NOT_QUARTER_HOUR: 'fleetErrorNotQuarterHour',
  NO_ORGANIZATION: 'fleetErrorNoOrganization', NO_APPROVER: 'fleetErrorNoApprover', TRAVEL_NOT_ELIGIBLE: 'fleetErrorTravelNotEligible', TRAVEL_ALREADY_HAS_CAR: 'fleetErrorTravelAlreadyHasCar',
  NOT_FOUND: 'fleetErrorNotFound', NOT_PENDING: 'fleetErrorNotPending', NOT_RETURNED: 'fleetErrorNotReturned',
  VEHICLE_BUSY: 'fleetErrorVehicleBusy', DRIVER_BUSY: 'fleetErrorDriverBusy', VEHICLE_UNAVAILABLE: 'fleetErrorVehicleUnavailable', DRIVER_INACTIVE: 'fleetErrorDriverInactive', TRIP_DOES_NOT_COVER: 'fleetErrorTripDoesNotCover',
  DEPARTURE_TOO_EARLY: 'fleetErrorDepartureTooEarly', ODOMETER_BELOW_LAST: 'fleetErrorOdometerBelowLast', ODOMETER_BELOW_OUT: 'fleetErrorOdometerBelowOut',
  DRIVER_HAS_TRIPS: 'fleetErrorDriverHasTrips', DUPLICATE_REGISTRATION: 'fleetErrorDuplicateRegistration', fleet_request_route: 'fleetErrorRequestRoute', invalid_input: 'leaveErrorInvalid', decision_not_accepted: 'actionNotAccepted'
};

export const VEHICLE_KINDS: readonly VehicleKind[] = ['SEDAN', 'PICKUP', 'VAN', 'AMBULANCE', 'OTHER'];
export const VEHICLE_STATUSES: readonly VehicleStatus[] = ['ACTIVE', 'IN_REPAIR', 'RETIRED'];

export const fleetStatusLabel = (status: FleetRequestStatus) => t(statusKeys[status]);
export const tripStatusLabel = (status: TripStatus) => t(tripKeys[status]);
export const fleetStatusTone = (status: FleetRequestStatus | TripStatus) => statusTones[status];
export const vehicleKindLabel = (kind: VehicleKind) => t(kindKeys[kind]);
export const vehicleStatusLabel = (status: VehicleStatus) => t(vehicleStatusKeys[status]);
export const fleetHistoryLabel = (action: string) => (historyKeys[action] ? t(historyKeys[action]) : action);
/** Thai text for a fleet error code from the API; anything unknown is the generic failure. */
export const fleetErrorMessage = (code: string | null | undefined) => t(code && errorKeys[code] ? errorKeys[code] : 'leaveErrorFailed');

/** `2026-11-10T01:00:00.000Z` → `2026-11-10T08:00`, the value of a datetime-local field in Bangkok time. */
export const toBangkokLocal = (iso: string) => new Date(Date.parse(iso) + BANGKOK_MS).toISOString().slice(0, 16);
/** A Bangkok datetime-local value as an ISO UTC instant; null when it is not a real time. */
export function fromBangkokLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}:00+07:00`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
/** `10 พ.ย. 2569 08:00 – 16:00`, or with both dates when the range crosses a Bangkok day. */
export function formatFleetRange(startsAt: string, endsAt: string): string {
  const startDay = toBangkokLocal(startsAt).slice(0, 10);
  const endDay = toBangkokLocal(endsAt).slice(0, 10);
  const start = `${formatBangkokDate(startDay)} ${formatBangkokTime(startsAt)}`;
  return startDay === endDay ? `${start} – ${formatBangkokTime(endsAt)}` : `${start} – ${formatBangkokDate(endDay)} ${formatBangkokTime(endsAt)}`;
}

/** Sends JSON to a fleet (or central decisions) route; the Thai error text, or null when it worked. Reasons travel in the body only. */
export async function sendFleet(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<{ error: string | null; result: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: response.ok ? null : fleetErrorMessage(typeof result.error === 'string' ? result.error : null), result };
  } catch { return { error: fleetErrorMessage(null), result: {} }; }
}
