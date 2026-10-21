import { describe, expect, it } from 'vitest';
import { addDays, datesBetween, formatBangkokDate, formatBangkokTime, formatMinutes, mondayOf, timeOptions } from './bangkok-time';

describe('Bangkok time display', () => {
  it('formats a booking date in Thai with the Buddhist year', () => {
    expect(formatBangkokDate('2026-11-05')).toBe('5 พ.ย. 2569');
  });
  it('formats minutes after midnight as a 24-hour clock', () => {
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1230)).toBe('20:30');
  });
  it('shows a UTC instant in Bangkok time', () => {
    expect(formatBangkokTime(new Date('2026-11-05T02:30:00Z'))).toBe('09:30');
  });
  it('steps dates across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(datesBetween('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(datesBetween('2026-12-02', '2026-11-29')).toEqual([]);
  });
  it('finds the Monday that starts the week', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
  });
  it('offers half-hour times within opening hours', () => {
    const options = timeOptions();
    expect(options[0]).toEqual({ value: 420, label: '07:00' });
    expect(options.at(-1)).toEqual({ value: 1200, label: '20:00' });
    expect(options).toHaveLength(27);
  });
});
