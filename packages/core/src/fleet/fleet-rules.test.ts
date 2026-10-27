import { describe, expect, it } from 'vitest';
import { checkDeparture, checkFleetRange, checkReturn, checkTripRange, tripCovers } from './fleet-rules';

const now = new Date('2026-10-27T03:00:00Z');
const at = (iso: string) => new Date(iso);

describe('checkFleetRange', () => {
  const depart = at('2026-11-03T01:00:00Z');
  it('accepts a normal range', () => expect(checkFleetRange(depart, at('2026-11-03T09:00:00Z'), now)).toBeNull());
  it('refuses a return that is not after the departure', () => {
    expect(checkFleetRange(depart, at('2026-11-03T00:45:00Z'), now)).toBe('INVALID_RANGE');
    expect(checkFleetRange(depart, depart, now)).toBe('INVALID_RANGE');
  });
  it('refuses a departure in the past but accepts exactly now', () => {
    expect(checkFleetRange(at('2026-10-27T02:59:00Z'), at('2026-10-27T05:00:00Z'), now)).toBe('IN_PAST');
    expect(checkFleetRange(now, at('2026-10-27T05:00:00Z'), now)).toBeNull();
  });
  it('uses the Bangkok day for the 90 day limit', () => {
    const lateNight = at('2026-10-27T16:30:00Z'); // 23:30 on 27 Oct in Bangkok
    expect(checkFleetRange(at('2027-01-25T01:00:00Z'), at('2027-01-25T09:00:00Z'), lateNight)).toBeNull();
    expect(checkFleetRange(at('2027-01-26T01:00:00Z'), at('2027-01-26T09:00:00Z'), lateNight)).toBe('TOO_FAR_AHEAD');
  });
  it('allows exactly 30 days and refuses 15 minutes more', () => {
    expect(checkFleetRange(depart, new Date(depart.getTime() + 30 * 86_400_000), now)).toBeNull();
    expect(checkFleetRange(depart, new Date(depart.getTime() + 30 * 86_400_000 + 15 * 60_000), now)).toBe('TOO_LONG');
  });
  it('wants 15 minute steps with no seconds', () => {
    expect(checkFleetRange(at('2026-11-03T01:10:00Z'), at('2026-11-03T09:00:00Z'), now)).toBe('NOT_QUARTER_HOUR');
    expect(checkFleetRange(depart, at('2026-11-03T09:00:30Z'), now)).toBe('NOT_QUARTER_HOUR');
    expect(checkFleetRange(at('2026-11-03T01:45:00Z'), at('2026-11-03T09:15:00Z'), now)).toBeNull();
  });
  it('reports the first broken rule in order', () => {
    expect(checkFleetRange(at('2026-10-20T01:10:00Z'), at('2026-10-19T01:10:00Z'), now)).toBe('INVALID_RANGE');
    expect(checkFleetRange(at('2026-10-20T01:10:00Z'), at('2026-10-21T01:10:00Z'), now)).toBe('IN_PAST');
  });
});

describe('checkDeparture and checkReturn', () => {
  const trip = { startsAt: at('2026-11-03T01:00:00Z') };
  it('allows departure from two hours before the start', () => {
    expect(checkDeparture(trip, 1000, 1000, at('2026-11-02T23:00:00Z'))).toBeNull();
    expect(checkDeparture(trip, 1000, 1000, at('2026-11-02T22:59:00Z'))).toBe('DEPARTURE_TOO_EARLY');
  });
  it('refuses an odometer below the last reading', () => {
    expect(checkDeparture(trip, 999, 1000, at('2026-11-03T01:00:00Z'))).toBe('ODOMETER_BELOW_LAST');
    expect(checkDeparture(trip, 0, null, at('2026-11-03T01:00:00Z'))).toBeNull();
  });
  it('refuses a return odometer below the departure one', () => {
    expect(checkReturn(1000, 999)).toBe('ODOMETER_BELOW_OUT');
    expect(checkReturn(1000, 1000)).toBeNull();
  });
});

describe('checkTripRange and tripCovers', () => {
  it('wants a start before the end, both on 15 minute steps, and nothing else', () => {
    expect(checkTripRange(at('2026-11-03T01:00:00Z'), at('2026-11-03T01:00:00Z'))).toBe('INVALID_RANGE');
    expect(checkTripRange(at('2026-11-03T02:00:00Z'), at('2026-11-03T01:00:00Z'))).toBe('INVALID_RANGE');
    expect(checkTripRange(at('2026-11-03T01:05:00Z'), at('2026-11-03T02:00:00Z'))).toBe('NOT_QUARTER_HOUR');
    expect(checkTripRange(at('2026-10-01T01:00:00Z'), at('2026-10-01T01:15:00Z'))).toBeNull();
  });
  it('covers a ใบ whose times sit inside the เที่ยวรถ, edges included', () => {
    const trip = { startsAt: at('2026-11-03T01:00:00Z'), endsAt: at('2026-11-03T09:00:00Z') };
    expect(tripCovers(trip, { departAt: trip.startsAt, returnAt: trip.endsAt })).toBe(true);
    expect(tripCovers(trip, { departAt: at('2026-11-03T00:45:00Z'), returnAt: trip.endsAt })).toBe(false);
    expect(tripCovers(trip, { departAt: trip.startsAt, returnAt: at('2026-11-03T09:15:00Z') })).toBe(false);
  });
});
