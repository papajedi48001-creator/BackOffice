import { describe, expect, it } from 'vitest';
import { bangkokDate, buddhistYear, rangesOverlap, toBookingRanges } from './booking-days';

// 2026-11-01 10:00 Bangkok
const now = new Date('2026-11-01T03:00:00Z');

describe('toBookingRanges', () => {
  it('converts Bangkok dates and minutes into UTC ranges sorted by date', () => {
    expect(toBookingRanges({ dates: ['2026-11-06', '2026-11-05'], startMinute: 420, endMinute: 540 }, now)).toEqual([
      { date: '2026-11-05', startsAt: new Date('2026-11-05T00:00:00Z'), endsAt: new Date('2026-11-05T02:00:00Z') },
      { date: '2026-11-06', startsAt: new Date('2026-11-06T00:00:00Z'), endsAt: new Date('2026-11-06T02:00:00Z') }
    ]);
  });

  it.each([
    ['before opening', 390, 540],
    ['after closing', 540, 1230],
    ['off the half-hour grid', 555, 600],
    ['ending before it starts', 600, 600]
  ])('rejects a time range %s', (_label, startMinute, endMinute) => {
    expect(() => toBookingRanges({ dates: ['2026-11-05'], startMinute, endMinute }, now)).toThrow('INVALID_TIME_RANGE');
  });

  it('accepts the full opening hours', () => {
    expect(toBookingRanges({ dates: ['2026-11-05'], startMinute: 420, endMinute: 1200 }, now)).toHaveLength(1);
  });

  it('rejects a day that has already started', () => {
    expect(() => toBookingRanges({ dates: ['2026-11-01'], startMinute: 540, endMinute: 600 }, now)).toThrow('OUTSIDE_BOOKING_WINDOW');
  });

  it('allows a later slot today', () => {
    expect(toBookingRanges({ dates: ['2026-11-01'], startMinute: 660, endMinute: 720 }, now)).toHaveLength(1);
  });

  it('allows up to 90 days ahead and rejects day 91', () => {
    expect(toBookingRanges({ dates: ['2027-01-30'], startMinute: 540, endMinute: 600 }, now)).toHaveLength(1);
    expect(() => toBookingRanges({ dates: ['2027-01-31'], startMinute: 540, endMinute: 600 }, now)).toThrow('OUTSIDE_BOOKING_WINDOW');
  });

  it.each([[['2026-11-05', '2026-11-05']], [['2026-02-30']], [['2026-13-01']]])('rejects invalid or duplicate dates %j', (dates) => {
    expect(() => toBookingRanges({ dates, startMinute: 540, endMinute: 600 }, now)).toThrow('INVALID_DATES');
  });
});

describe('Bangkok calendar helpers', () => {
  it('uses the Bangkok date across the UTC midnight boundary', () => {
    expect(bangkokDate(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01');
    expect(bangkokDate(new Date('2026-12-31T16:59:59Z'))).toBe('2026-12-31');
  });

  it('returns the Buddhist Era year of the Bangkok date', () => {
    expect(buddhistYear(new Date('2026-12-31T18:00:00Z'))).toBe(2570);
    expect(buddhistYear(now)).toBe(2569);
  });
});

describe('rangesOverlap', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 10, 5, hour));
  it('treats back-to-back ranges as free', () => {
    expect(rangesOverlap({ startsAt: at(2), endsAt: at(5) }, { startsAt: at(5), endsAt: at(8) })).toBe(false);
  });
  it('detects a partial overlap', () => {
    expect(rangesOverlap({ startsAt: at(2), endsAt: at(5) }, { startsAt: at(4), endsAt: at(6) })).toBe(true);
  });
});
