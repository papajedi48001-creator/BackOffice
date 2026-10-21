import { roomBookingPolicy } from '@backoffice/contracts';

export interface TimeRange { startsAt: Date; endsAt: Date; }
export interface BookingRange extends TimeRange { date: string; }

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const offsetMs = roomBookingPolicy.utcOffsetMinutes * minuteMs;

export function bangkokDate(instant: Date): string {
  return new Date(instant.getTime() + offsetMs).toISOString().slice(0, 10);
}

export function buddhistYear(instant: Date): number {
  return Number(bangkokDate(instant).slice(0, 4)) + 543;
}

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

function bangkokMidnightUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const midnight = Date.UTC(year, month - 1, day);
  if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) throw new Error('INVALID_DATES');
  return midnight - offsetMs;
}

export function toBookingRanges(input: { dates: string[]; startMinute: number; endMinute: number }, now: Date): BookingRange[] {
  const { openMinute, closeMinute, slotMinutes, maxAdvanceDays } = roomBookingPolicy;
  const { startMinute, endMinute } = input;
  if (startMinute < openMinute || endMinute > closeMinute || startMinute >= endMinute || startMinute % slotMinutes !== 0 || endMinute % slotMinutes !== 0) throw new Error('INVALID_TIME_RANGE');
  if (new Set(input.dates).size !== input.dates.length) throw new Error('INVALID_DATES');
  const lastAllowedMidnight = bangkokMidnightUtc(bangkokDate(now)) + maxAdvanceDays * dayMs;
  const ranges = [...input.dates].sort().map((date) => {
    const midnight = bangkokMidnightUtc(date);
    return { date, midnight, startsAt: new Date(midnight + startMinute * minuteMs), endsAt: new Date(midnight + endMinute * minuteMs) };
  });
  if (ranges.some((range) => range.startsAt <= now || range.midnight > lastAllowedMidnight)) throw new Error('OUTSIDE_BOOKING_WINDOW');
  return ranges.map(({ date, startsAt, endsAt }) => ({ date, startsAt, endsAt }));
}
