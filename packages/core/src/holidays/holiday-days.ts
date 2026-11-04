import type { Database } from '@backoffice/db';
import type { HolidayEntry } from './holiday-rows';

const BANGKOK_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const bangkokDate = (instant: number) => new Date(instant + BANGKOK_MS).toISOString().slice(0, 10);

/** Every Bangkok calendar date that `[startsAt, endsAt)` touches. */
export function bangkokDatesOfRange(startsAt: Date, endsAt: Date): string[] {
  const last = bangkokDate(Math.max(startsAt.getTime(), endsAt.getTime() - 1));
  const dates: string[] = [];
  for (let date = bangkokDate(startsAt.getTime()); date <= last && dates.length <= 400; date = new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)) dates.push(date);
  return dates;
}

/** The holidays among `dates`, oldest first. */
export function holidayConflicts(dates: string[], holidays: ReadonlyMap<string, string>): HolidayEntry[] {
  return [...new Set(dates)].sort().flatMap((date) => { const name = holidays.get(date); return name ? [{ date, name }] : []; });
}

/** วันหยุด between two dates inclusive, as a date → name map. */
export async function loadHolidayNames(database: Pick<Database, 'query'>, from: string, to: string): Promise<Map<string, string>> {
  const rows = await database.query<{ date: string; name: string }>("SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date, name FROM leave_holiday WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date", [from, to]);
  return new Map(rows.map((row) => [row.date, row.name]));
}

/** Thrown, or returned as a failure, when a booking or a ใบขอใช้รถ falls on a วันหยุด. */
export class HolidayBookingError extends Error {
  constructor(public readonly holidays: HolidayEntry[]) { super('BOOKING_ON_HOLIDAY'); }
}
