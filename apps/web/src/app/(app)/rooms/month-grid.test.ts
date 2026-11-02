import { describe, expect, it } from 'vitest';
import { monthGrid } from './month-grid';

describe('monthGrid', () => {
  it('lays a month out in whole Monday-to-Sunday weeks', () => {
    const grid = monthGrid({ month: '2026-11' }, '2026-11-02');
    expect(grid.month).toBe('2026-11');
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0]![0]).toMatchObject({ date: '2026-10-26', inMonth: false });
    expect(grid.weeks[0]![6]).toMatchObject({ date: '2026-11-01', inMonth: true });
    expect(grid.weeks[5]![6]).toMatchObject({ date: '2026-12-06', inMonth: false });
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.first).toBe('2026-10-26');
    expect(grid.last).toBe('2026-12-06');
  });

  it('marks today and the days before it', () => {
    const days = monthGrid({ month: '2026-11' }, '2026-11-02').weeks.flat();
    expect(days.find((day) => day.date === '2026-11-02')).toMatchObject({ isToday: true, isPast: false });
    expect(days.find((day) => day.date === '2026-11-01')).toMatchObject({ isToday: false, isPast: true });
    expect(days.find((day) => day.date === '2026-11-03')).toMatchObject({ isToday: false, isPast: false });
  });

  it('moves to the months either side, across years', () => {
    expect(monthGrid({ month: '2027-01' }, '2026-11-02')).toMatchObject({ previous: '2026-12', next: '2027-02' });
  });

  it('keeps a month that already starts on Monday to its own weeks', () => {
    const grid = monthGrid({ month: '2027-02' }, '2026-11-02');
    expect(grid.weeks).toHaveLength(4);
    expect(grid.first).toBe('2027-02-01');
    expect(grid.last).toBe('2027-02-28');
  });

  it.each(['2026-13', '2026-1', 'november', undefined])('shows the current month for an unusable month %s', (month) => {
    expect(monthGrid({ month }, '2026-11-02').month).toBe('2026-11');
  });
});
