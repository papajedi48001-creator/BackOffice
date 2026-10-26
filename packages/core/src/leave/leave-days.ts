import type { DayRange, LeaveCounting, LeaveWarning } from '@backoffice/contracts';

const dayMs = 24 * 60 * 60 * 1000;
// Dates are handled as UTC midnights so the host time zone never moves a day.
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const isWeekend = (date: string) => { const weekday = new Date(toTime(date)).getUTCDay(); return weekday === 0 || weekday === 6; };
const isWorkingDay = (date: string, holidays: ReadonlySet<string>) => !isWeekend(date) && !holidays.has(date);

/** The ปีงบประมาณ (Buddhist era) a date falls in: 1 October starts the next year. */
export function fiscalYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return (Number(date.slice(5, 7)) >= 10 ? year + 1 : year) + 543;
}

export function fiscalYearRange(fiscalYear: number): { start: string; end: string } {
  const endYear = fiscalYear - 543;
  return { start: `${endYear - 1}-10-01`, end: `${endYear}-09-30` };
}

/**
 * Half-day units (`YYYY-MM-DD:AM` / `:PM`) a range takes. Working-day leave skips weekends and holidays;
 * a start in the afternoon drops the first morning and an end in the morning drops the last afternoon.
 */
export function leaveUnits(range: DayRange, counting: LeaveCounting, holidays: ReadonlySet<string>): string[] {
  const units: string[] = [];
  for (let time = toTime(range.startDate); time <= toTime(range.endDate); time += dayMs) {
    const date = toDate(time);
    if (counting === 'WORKING_DAYS' && !isWorkingDay(date, holidays)) continue;
    if (!(date === range.startDate && range.startHalf === 'AFTERNOON')) units.push(`${date}:AM`);
    if (!(date === range.endDate && range.endHalf === 'MORNING')) units.push(`${date}:PM`);
  }
  return units;
}

export function countLeaveDays(range: DayRange, counting: LeaveCounting, holidays: ReadonlySet<string>): number {
  return leaveUnits(range, counting, holidays).length / 2;
}

export function subtractUnits(units: readonly string[], removed: readonly string[]): string[] {
  const gone = new Set(removed);
  return units.filter((unit) => !gone.has(unit));
}

export function workingDaysInMonth(month: string, holidays: ReadonlySet<string>): number {
  const start = toTime(`${month}-01`);
  let count = 0;
  for (let time = start; toDate(time).slice(0, 7) === month; time += dayMs) if (isWorkingDay(toDate(time), holidays)) count += 1;
  return count;
}

/** Months this leave touches where working days, after all the person's leave, fall below the minimum. Never blocks. */
export function monthWarnings(input: { units: readonly string[]; otherUnits: readonly string[]; holidays: ReadonlySet<string>; minimum: number }): LeaveWarning[] {
  const months = [...new Set(input.units.map((unit) => unit.slice(0, 7)))].sort();
  const all = new Set([...input.units, ...input.otherUnits]);
  return months.flatMap((month) => {
    const leaveDays = [...all].filter((unit) => unit.startsWith(month) && isWorkingDay(unit.slice(0, 10), input.holidays)).length / 2;
    const workingDays = workingDaysInMonth(month, input.holidays) - leaveDays;
    return workingDays < input.minimum ? [{ month, workingDays, minimum: input.minimum }] : [];
  });
}
