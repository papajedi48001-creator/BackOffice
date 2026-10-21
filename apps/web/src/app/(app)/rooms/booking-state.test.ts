import { describe, expect, it } from 'vitest';
import { bookingViewState } from './booking-state';

const now = new Date('2026-11-06T05:00:00Z');
const day = (startsAt: string, endsAt: string, status: 'ACTIVE' | 'RELEASED' = 'ACTIVE') => ({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), status });
const past = day('2026-11-05T02:00:00Z', '2026-11-05T09:00:00Z');
const today = day('2026-11-06T02:00:00Z', '2026-11-06T09:00:00Z');
const future = day('2026-11-07T02:00:00Z', '2026-11-07T09:00:00Z');
const booking = (overrides: Partial<Parameters<typeof bookingViewState>[0]>) => ({ status: 'APPROVED' as const, viewerIsBooker: false, viewerCanDecide: true, days: [future], ...overrides });

describe('bookingViewState', () => {
  it('lets an approver cancel a booking that has not started', () => {
    expect(bookingViewState(booking({}), now).cancelAction).toBe('cancel');
  });

  it('lets an approver release the remaining days once a booking is under way', () => {
    expect(bookingViewState(booking({ days: [today, future] }), now).cancelAction).toBe('release');
  });

  it('offers an approver nothing on the last running day, because no day is left to release', () => {
    expect(bookingViewState(booking({ days: [past, today] }), now).cancelAction).toBeNull();
  });

  it('lets the booker release remaining days only on an approved booking', () => {
    const asBooker = { viewerIsBooker: true, viewerCanDecide: false, days: [today, future] };
    expect(bookingViewState(booking(asBooker), now).cancelAction).toBe('release');
    expect(bookingViewState(booking({ ...asBooker, status: 'PENDING' }), now).cancelAction).toBeNull();
  });

  it('marks a pending booking whose days have all ended as expired with nothing to do', () => {
    const state = bookingViewState(booking({ status: 'PENDING', days: [past] }), now);
    expect(state).toEqual({ expired: true, canDecide: false, cancelAction: null });
  });

  it('lets an approver decide a pending booking that is not their own', () => {
    expect(bookingViewState(booking({ status: 'PENDING' }), now).canDecide).toBe(true);
    expect(bookingViewState(booking({ status: 'PENDING', viewerIsBooker: true }), now).canDecide).toBe(false);
  });

  it('ignores released days', () => {
    expect(bookingViewState(booking({ days: [today, day('2026-11-07T02:00:00Z', '2026-11-07T09:00:00Z', 'RELEASED')] }), now).cancelAction).toBeNull();
  });
});
