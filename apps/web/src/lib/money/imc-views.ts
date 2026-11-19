/**
 * Monitor IMC in the browser: days left to วันที่ครบกำหนดการให้บริการ (counted from today in Asia/Bangkok), Thai dates, and the
 * chart buckets (รายวัน / รายเดือน / รายปีงบ) of the claims, one value per รหัสบริการ.
 */
import type { ChartGroup } from '../../components/grouped-bar-chart';

export type ImcTone = 'ok' | 'warn' | 'bad' | 'mute';
export type ImcGroup = 'soon' | 'mid' | 'ok' | 'done';
export type ImcRemain = { days: number; text: string; tone: ImcTone; group: ImcGroup };
export type ImcUnit = 'day' | 'month' | 'year';
type Line = { date: string; code: string; claim: number };

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const IMC_DISCHARGED = 'จำหน่ายจาก IMC แล้ว';
const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
/** The same day `months` later, or the month's last day when it has fewer days. */
function addMonths(day: string, months: number): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return Date.UTC(y, m - 1 + months, Math.min(d, last));
}

/** How long a person has left: "x เดือน y วัน" in calendar months, tone ok > 60 วัน, warn 31–60, bad ≤ 30, mute when done. */
export function imcRemain(person: { due: string; status: string }, today: string): ImcRemain {
  if (person.status === IMC_DISCHARGED) return { days: 0, text: IMC_DISCHARGED, tone: 'mute', group: 'done' };
  if (!person.due) return { days: 0, text: 'ไม่มีวันครบกำหนด', tone: 'mute', group: 'done' };
  const days = Math.round((utc(person.due) - utc(today)) / DAY);
  if (days < 0) return { days, text: `ครบกำหนดแล้ว ${-days} วัน`, tone: 'mute', group: 'done' };
  const tone: ImcTone = days > 60 ? 'ok' : days > 30 ? 'warn' : 'bad';
  const group: ImcGroup = days > 60 ? 'ok' : days > 30 ? 'mid' : 'soon';
  if (days === 0) return { days, text: 'ครบกำหนดวันนี้', tone, group };
  let months = 0;
  while (addMonths(today, months + 1) <= utc(person.due)) months++;
  const rest = Math.round((utc(person.due) - addMonths(today, months)) / DAY);
  const text = months === 0 ? `${rest} วัน` : rest === 0 ? `${months} เดือน` : `${months} เดือน ${rest} วัน`;
  return { days, text, tone, group };
}

/** "13/4/2569"; "-" for no date. */
export const imcDate = (day: string) => (day ? `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}/${Number(day.slice(0, 4)) + 543}` : '-');
const fiscalYear = (day: string) => Number(day.slice(0, 4)) + 543 + (Number(day.slice(5, 7)) >= 10 ? 1 : 0);
const monthName = (key: string) => TH_MONTHS[Number(key.slice(5, 7)) - 1]!;
const buddhist = (key: string) => Number(key.slice(0, 4)) + 543;

/** Claims per bucket and service, oldest first; months and days in between are shown empty. */
export function imcBuckets(lines: readonly Line[], services: readonly { code: string }[], unit: ImcUnit): ChartGroup[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].map((line) => line.date).sort();
  const keyOf = (day: string) => (unit === 'day' ? day : unit === 'month' ? day.slice(0, 7) : String(fiscalYear(day)));
  const keys: string[] = [];
  if (unit === 'day') { const end = utc(sorted.at(-1)!); for (let at = end - 30 * DAY; at <= end; at += DAY) keys.push(iso(at)); }
  else if (unit === 'month') { for (let at = utc(`${sorted[0]!.slice(0, 7)}-01`); at <= utc(`${sorted.at(-1)!.slice(0, 7)}-01`); at = addMonths(iso(at), 1)) keys.push(iso(at).slice(0, 7)); }
  else { for (let fy = fiscalYear(sorted[0]!); fy <= fiscalYear(sorted.at(-1)!); fy++) keys.push(String(fy)); }
  const at = new Map(keys.map((key, index) => [key, index]));
  const column = new Map(services.map((service, index) => [service.code, index]));
  const values = keys.map(() => services.map(() => 0));
  for (const line of lines) {
    const row = at.get(keyOf(line.date));
    const col = column.get(line.code);
    if (row !== undefined && col !== undefined) values[row]![col] = Math.round((values[row]![col]! + line.claim) * 100) / 100;
  }
  return keys.map((key, index) => ({
    label: unit === 'day' ? `${Number(key.slice(8, 10))} ${monthName(key)}` : unit === 'month' ? `${monthName(key)} ${String(buddhist(key)).slice(-2)}` : `ปีงบ ${key}`,
    title: unit === 'day' ? `${Number(key.slice(8, 10))} ${monthName(key)} ${buddhist(key)}` : unit === 'month' ? `${monthName(key)} ${buddhist(key)}` : `ปีงบ ${key}`,
    values: values[index]!
  }));
}
