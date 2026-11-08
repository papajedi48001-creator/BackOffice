import type { RoomBookingDayStatus, RoomBookingStatus } from '@backoffice/contracts';

export interface BookingViewInput {
  status: RoomBookingStatus;
  viewerIsBooker: boolean;
  viewerCanDecide: boolean;
  /** The viewer works in the admin or manager tier, which may decide their own booking (with a reason). */
  viewerMayDecideOwn?: boolean;
  days: { startsAt: Date; endsAt: Date; status: RoomBookingDayStatus }[];
}

export interface BookingViewState {
  /** A booking still waiting on the head or a manager whose active days have all ended: nobody can decide it any more. */
  expired: boolean;
  canDecide: boolean;
  /** `cancel` before the booking starts, `release` while days remain to give back, `null` when the viewer may not cancel. */
  cancelAction: 'cancel' | 'release' | null;
}

/** Mirrors RoomBookingService.decide and cancel so the page only offers what the server would accept; the server re-checks every rule. */
export function bookingViewState(booking: BookingViewInput, now: Date): BookingViewState {
  const activeDays = booking.days.filter((day) => day.status === 'ACTIVE');
  const started = activeDays.some((day) => day.startsAt <= now);
  const ended = !activeDays.some((day) => day.endsAt > now);
  const hasFutureDays = activeDays.some((day) => day.startsAt > now);
  const waiting = booking.status === 'HEAD_REVIEW' || booking.status === 'PENDING';
  const open = waiting || booking.status === 'APPROVED';
  const mayRelease = booking.viewerCanDecide || (booking.viewerIsBooker && booking.status === 'APPROVED');
  const cancelAction = !open || ended ? null
    : !started ? (booking.viewerCanDecide || booking.viewerIsBooker ? 'cancel' : null)
    : mayRelease && hasFutureDays ? 'release' : null;
  return {
    expired: waiting && ended,
    canDecide: booking.viewerCanDecide && (!booking.viewerIsBooker || booking.viewerMayDecideOwn === true) && waiting && !ended,
    cancelAction
  };
}
