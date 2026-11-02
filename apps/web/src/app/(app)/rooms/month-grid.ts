import { addDays, datesBetween, mondayOf } from '../../../lib/bangkok-time';

export interface MonthGridDay { date: string; inMonth: boolean; isToday: boolean; isPast: boolean; }
export interface MonthGrid { month: string; weeks: MonthGridDay[][]; first: string; last: string; previous: string; next: string; }

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
const lastOfMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Whole Monday-to-Sunday weeks covering `month` (`YYYY-MM`, Bangkok dates); an unusable month shows today's. */
export function monthGrid(params: { month?: string }, today: string): MonthGrid {
  const month = params.month && monthPattern.test(params.month) ? params.month : today.slice(0, 7);
  const first = mondayOf(`${month}-01`);
  const last = addDays(mondayOf(lastOfMonth(month)), 6);
  const days = datesBetween(first, last).map((date) => ({ date, inMonth: date.startsWith(month), isToday: date === today, isPast: date < today }));
  const weeks: MonthGridDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return { month, weeks, first, last, previous: shiftMonth(month, -1), next: shiftMonth(month, 1) };
}
