import { formatBangkokDate } from './bangkok-time';

export interface HolidayView { date: string; name: string }

/** ห้ามจองในวันหยุด: `จองไม่ได้ เพราะ จันทร์ 7 ธ.ค. 2569 เป็นวันหยุด (…)`. */
export function holidayBlockedMessage(holidays: readonly HolidayView[]): string {
  return `จองไม่ได้ เพราะ ${holidays.map((holiday) => `${formatBangkokDate(holiday.date)} เป็นวันหยุด (${holiday.name})`).join(', ')}`;
}

/** The holidays an API error body carries, or null when it is not a holiday refusal. */
export function holidaysOf(body: unknown): HolidayView[] | null {
  if (!body || typeof body !== 'object') return null;
  const { error, holidays } = body as { error?: unknown; holidays?: unknown };
  if (error !== 'BOOKING_ON_HOLIDAY' || !Array.isArray(holidays)) return null;
  return holidays.filter((entry): entry is HolidayView => typeof entry?.date === 'string' && typeof entry?.name === 'string');
}
