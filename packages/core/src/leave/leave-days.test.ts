import { describe, expect, it } from 'vitest';
import type { DayRange } from '@backoffice/contracts';
import { countLeaveDays, fiscalYearOf, fiscalYearRange, leaveUnits, monthWarnings, subtractUnits, workingDaysInMonth } from './leave-days';

const range = (startDate: string, endDate: string, startHalf: DayRange['startHalf'] = 'FULL', endHalf: DayRange['endHalf'] = 'FULL'): DayRange => ({ startDate, endDate, startHalf, endHalf });
const none = new Set<string>();

describe('countLeaveDays', () => {
  it('counts working days around weekends and holidays', () => {
    expect(countLeaveDays(range('2026-11-02', '2026-11-06'), 'WORKING_DAYS', none)).toBe(5);
    expect(countLeaveDays(range('2026-11-05', '2026-11-10'), 'WORKING_DAYS', none)).toBe(4);
    expect(countLeaveDays(range('2026-11-05', '2026-11-10'), 'WORKING_DAYS', new Set(['2026-11-09']))).toBe(3);
  });

  it('counts calendar days for maternity', () => {
    expect(countLeaveDays(range('2026-11-01', '2027-01-29'), 'CALENDAR_DAYS', new Set(['2026-12-05']))).toBe(90);
  });

  it('takes half days off the ends', () => {
    expect(countLeaveDays(range('2026-11-02', '2026-11-04', 'AFTERNOON', 'MORNING'), 'WORKING_DAYS', none)).toBe(2);
    expect(countLeaveDays(range('2026-11-02', '2026-11-02', 'FULL', 'MORNING'), 'WORKING_DAYS', none)).toBe(0.5);
    expect(countLeaveDays(range('2026-11-02', '2026-11-02', 'AFTERNOON'), 'WORKING_DAYS', none)).toBe(0.5);
  });

  it('counts zero for a range of holidays only', () => {
    expect(countLeaveDays(range('2026-11-07', '2026-11-08'), 'WORKING_DAYS', none)).toBe(0);
  });

  it('ignores the host time zone', () => {
    expect(leaveUnits(range('2026-11-02', '2026-11-02'), 'WORKING_DAYS', none)).toEqual(['2026-11-02:AM', '2026-11-02:PM']);
  });
});

describe('fiscal years', () => {
  it('places dates in Buddhist-era fiscal years', () => {
    expect(fiscalYearOf('2026-10-01')).toBe(2570);
    expect(fiscalYearOf('2026-09-30')).toBe(2569);
    expect(fiscalYearOf('2027-09-30')).toBe(2570);
    expect(fiscalYearRange(2570)).toEqual({ start: '2026-10-01', end: '2027-09-30' });
  });
});

describe('overlap units', () => {
  it('treats morning and afternoon of one date as separate units', () => {
    const morning = leaveUnits(range('2026-11-02', '2026-11-02', 'FULL', 'MORNING'), 'WORKING_DAYS', none);
    const afternoon = leaveUnits(range('2026-11-02', '2026-11-02', 'AFTERNOON'), 'WORKING_DAYS', none);
    expect(morning.filter((unit) => afternoon.includes(unit))).toEqual([]);
    expect(morning.filter((unit) => morning.includes(unit))).toEqual(['2026-11-02:AM']);
  });

  it('subtracts cancelled units', () => {
    const leave = leaveUnits(range('2026-11-02', '2026-11-04'), 'WORKING_DAYS', none);
    expect(subtractUnits(leave, leaveUnits(range('2026-11-03', '2026-11-03'), 'WORKING_DAYS', none))).toEqual(['2026-11-02:AM', '2026-11-02:PM', '2026-11-04:AM', '2026-11-04:PM']);
  });
});

describe('monthWarnings', () => {
  it('counts the working days in a month', () => {
    expect(workingDaysInMonth('2026-11', none)).toBe(21);
    expect(workingDaysInMonth('2026-12', new Set(['2026-12-05', '2026-12-07']))).toBe(22);
  });

  it('warns per month when working days fall below the minimum', () => {
    const seven = leaveUnits(range('2026-11-02', '2026-11-10'), 'WORKING_DAYS', none);
    const six = leaveUnits(range('2026-11-02', '2026-11-09'), 'WORKING_DAYS', none);
    expect(monthWarnings({ units: seven, otherUnits: [], holidays: none, minimum: 15 })).toEqual([{ month: '2026-11', workingDays: 14, minimum: 15 }]);
    expect(monthWarnings({ units: six, otherUnits: [], holidays: none, minimum: 15 })).toEqual([]);
    const spanning = leaveUnits(range('2026-11-30', '2026-12-01'), 'WORKING_DAYS', none);
    const others = leaveUnits(range('2026-11-02', '2026-11-09'), 'WORKING_DAYS', none);
    expect(monthWarnings({ units: spanning, otherUnits: others, holidays: none, minimum: 15 })).toEqual([{ month: '2026-11', workingDays: 14, minimum: 15 }]);
  });

  it('does not let weekend days of calendar-day leave reduce working days', () => {
    const maternityWeekend = leaveUnits(range('2026-11-07', '2026-11-08'), 'CALENDAR_DAYS', none);
    expect(monthWarnings({ units: maternityWeekend, otherUnits: [], holidays: none, minimum: 21 })).toEqual([]);
  });
});
