import { addDays, datesBetween, formatBangkokDateOnly, mondayOf } from './bangkok-time';

const monthFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/**
 * `2026-11-13` → `13 พ.ย. 2569`: every date field in the system shows its date this way (CLAUDE.md, "วันที่").
 * People may still type `13/11/2569`; the field shows it this way once they leave it.
 */
export function formatThaiDateInput(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return formatBangkokDateOnly(iso);
}

const thaiMonths: ReadonlyArray<readonly string[]> = [
  ['ม.ค.', 'มกราคม'], ['ก.พ.', 'กุมภาพันธ์'], ['มี.ค.', 'มีนาคม'], ['เม.ย.', 'เมษายน'], ['พ.ค.', 'พฤษภาคม'], ['มิ.ย.', 'มิถุนายน'],
  ['ก.ค.', 'กรกฎาคม'], ['ส.ค.', 'สิงหาคม'], ['ก.ย.', 'กันยายน'], ['ต.ค.', 'ตุลาคม'], ['พ.ย.', 'พฤศจิกายน'], ['ธ.ค.', 'ธันวาคม']
];
/** Short and full Thai month names, with or without the dots (`พ.ย.`, `พย`, `พฤศจิกายน`) → 1–12. */
const monthNumber = new Map<string, number>(thaiMonths.flatMap((names, index) => names.flatMap((name) => [[name, index + 1], [name.replace(/\./g, ''), index + 1]] as Array<[string, number]>)));

function realDate(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** What a person types: `13 พ.ย. 2569` (what the field shows), `13 พฤศจิกายน 2569`, `9/11/2569`, `09-11-2569`, `09/11/2026` (ค.ศ. by habit) or ISO `2026-11-09`. Null when it is not a real date. */
export function parseThaiDateInput(text: string): string | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /^(\d{1,2})\s*([฀-๿.]+)\s*(\d{4})$/.exec(value);
  if (named) {
    const month = monthNumber.get(named[2]!);
    const year = Number(named[3]);
    return month ? realDate(year > 2400 ? year - 543 : year, month, Number(named[1])) : null;
  }
  const thai = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (!thai) return null;
  const year = Number(thai[3]);
  return realDate(year > 2400 ? year - 543 : year, Number(thai[2]), Number(thai[1]));
}

/** `2026-11` → `พฤศจิกายน 2569`. */
export function thaiMonthTitle(month: string): string { return monthFormatter.format(new Date(`${month}-01T00:00:00Z`)); }
export function shiftMonth(month: string, by: number): string { return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7); }

/** Six Monday-first weeks covering `month` (`YYYY-MM`). */
export function monthCells(month: string): Array<{ date: string; inMonth: boolean }> {
  const first = mondayOf(`${month}-01`);
  return datesBetween(first, addDays(first, 41)).map((date) => ({ date, inMonth: date.startsWith(month) }));
}
