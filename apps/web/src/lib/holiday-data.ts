import { loadHolidayNames } from '@backoffice/core';
import type { Database } from '@backoffice/db';

/** วันหยุด between two dates as `{ date: name }` for calendars. A failed read still shows the calendar, without holidays. */
export async function holidayMap(database: Pick<Database, 'query'>, from: string, to: string): Promise<Record<string, string>> {
  try { return Object.fromEntries(await loadHolidayNames(database, from, to)); }
  catch (error) { console.error('backoffice.holidays.load_failed', { code: error instanceof Error ? error.name : 'unknown' }); return {}; }
}
