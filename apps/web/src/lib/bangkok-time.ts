import { roomBookingPolicy } from '@backoffice/contracts';

const dayMs = 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'long' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** `2026-11-05` → `5 พ.ย. 2569`. Booking dates are already Bangkok calendar dates. */
export function formatBangkokDate(date: string): string { return dateFormatter.format(utcDate(date)); }
export function formatWeekday(date: string): string { return weekdayFormatter.format(utcDate(date)); }
export function formatBangkokTime(instant: Date | string): string { return timeFormatter.format(new Date(instant)); }
/** An instant shown as `26 ต.ค. 2569 10:00` in Bangkok time. */
export function formatBangkokDateTime(instant: Date | string): string { return `${formatBangkokDate(bangkokToday(new Date(instant)))} ${formatBangkokTime(instant)}`; }
export function formatMinutes(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
export function addDays(date: string, days: number): string { return new Date(utcDate(date).getTime() + days * dayMs).toISOString().slice(0, 10); }
export function datesBetween(first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= last && dates.length <= 366; date = addDays(date, 1)) dates.push(date);
  return dates;
}
export function mondayOf(date: string): string { return addDays(date, -((utcDate(date).getUTCDay() + 6) % 7)); }
export function bangkokToday(now = new Date()): string { return new Date(now.getTime() + roomBookingPolicy.utcOffsetMinutes * 60_000).toISOString().slice(0, 10); }
export function timeOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let minute = roomBookingPolicy.openMinute; minute <= roomBookingPolicy.closeMinute; minute += roomBookingPolicy.slotMinutes) options.push({ value: minute, label: formatMinutes(minute) });
  return options;
}
