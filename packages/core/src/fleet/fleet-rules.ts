import type { FleetErrorCode } from '@backoffice/contracts';
import { bangkokToday } from '../official-travel/travel-store';

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_DAYS_AHEAD = 90;
const MAX_SPAN = 30 * DAY;
const EARLIEST_DEPARTURE = 2 * 60 * MINUTE;

/** Add days to a `YYYY-MM-DD` date. */
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Time rules of a ใบขอใช้รถ; `now` is injected. The first broken rule wins. */
export function checkFleetRange(departAt: Date, returnAt: Date, now: Date): FleetErrorCode | null {
  if (!(departAt.getTime() < returnAt.getTime())) return 'INVALID_RANGE';
  if (departAt.getTime() < now.getTime()) return 'IN_PAST';
  if (bangkokToday(departAt) > addDays(bangkokToday(now), MAX_DAYS_AHEAD)) return 'TOO_FAR_AHEAD';
  if (returnAt.getTime() - departAt.getTime() > MAX_SPAN) return 'TOO_LONG';
  if (departAt.getTime() % (15 * MINUTE) !== 0 || returnAt.getTime() % (15 * MINUTE) !== 0) return 'NOT_QUARTER_HOUR';
  return null;
}

/** ออกเดินทาง: from two hours before the เที่ยวรถ starts, with an odometer at least the car's last reading (any value if it has none). */
export function checkDeparture(trip: { startsAt: Date }, odometer: number, lastOdometerIn: number | null, now: Date): FleetErrorCode | null {
  if (now.getTime() < trip.startsAt.getTime() - EARLIEST_DEPARTURE) return 'DEPARTURE_TOO_EARLY';
  if (lastOdometerIn !== null && odometer < lastOdometerIn) return 'ODOMETER_BELOW_LAST';
  return null;
}

/** กลับถึง: the odometer may not be below the one at departure. */
export function checkReturn(odometerOut: number, odometer: number): FleetErrorCode | null {
  return odometer < odometerOut ? 'ODOMETER_BELOW_OUT' : null;
}

/** A เที่ยวรถ's own range: start before end, both on 15-minute steps. Unlike a ใบ, it may lie in the past (a late ใบ still gets a car). */
export function checkTripRange(startsAt: Date, endsAt: Date): FleetErrorCode | null {
  if (!(startsAt.getTime() < endsAt.getTime())) return 'INVALID_RANGE';
  if (startsAt.getTime() % (15 * MINUTE) !== 0 || endsAt.getTime() % (15 * MINUTE) !== 0) return 'NOT_QUARTER_HOUR';
  return null;
}

/** A เที่ยวรถ carries a ใบ only when the ใบ's times sit inside its range, edges included. */
export function tripCovers(trip: { startsAt: Date; endsAt: Date }, request: { departAt: Date; returnAt: Date }): boolean {
  return trip.startsAt.getTime() <= request.departAt.getTime() && trip.endsAt.getTime() >= request.returnAt.getTime();
}
