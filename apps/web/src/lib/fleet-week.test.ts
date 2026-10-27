import { describe, expect, it } from 'vitest';
import { parseWeekStart } from './fleet-week';

const now = new Date('2026-10-27T18:00:00Z'); // Wed 28 Oct 01:00 in Bangkok

describe('parseWeekStart', () => {
  it('defaults to this Bangkok week, a Monday', () => {
    expect(parseWeekStart(undefined, now)).toBe('2026-10-26');
  });
  it('snaps any day to its Monday', () => {
    expect(parseWeekStart('2026-11-01', now)).toBe('2026-10-26');
    expect(parseWeekStart('2026-11-02', now)).toBe('2026-11-02');
  });
  it('falls back to this week for malformed or impossible dates', () => {
    for (const bad of ['', 'x', '2026-13-01', '2026-02-30', '2026-1-1', '2026-11-02T00:00']) expect(parseWeekStart(bad, now)).toBe('2026-10-26');
  });
});
