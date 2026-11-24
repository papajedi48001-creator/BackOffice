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
/** The รหัสบริการ that counts as one IMC visit (ให้บริการ IMC ที่บ้าน); kept in step with `IMC_VISIT_CODE` in core. */
export const IMC_VISIT_CODE = 'H9340';
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

/** "13 เม.ย. 2569" (the system's date format); "-" for no date. */
export const imcDate = (day: string) => (day ? `${Number(day.slice(8, 10))} ${TH_MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(0, 4)) + 543}` : '-');
const fiscalYear = (day: string) => Number(day.slice(0, 4)) + 543 + (Number(day.slice(5, 7)) >= 10 ? 1 : 0);
const monthName = (key: string) => TH_MONTHS[Number(key.slice(5, 7)) - 1]!;
const buddhist = (key: string) => Number(key.slice(0, 4)) + 543;

/** Claims per bucket and service, oldest first; months and days in between are shown empty. */
export function imcBuckets(lines: readonly Line[], services: readonly { code: string }[], unit: ImcUnit, range?: { from: string; to: string }): ChartGroup[] {
  if (range) lines = lines.filter((line) => line.date >= range.from && line.date <= range.to);
  else if (lines.length === 0) return [];
  const sorted = range ? [range.from, range.to] : [...lines].map((line) => line.date).sort();
  const keyOf = (day: string) => (unit === 'day' ? day : unit === 'month' ? day.slice(0, 7) : String(fiscalYear(day)));
  const keys: string[] = [];
  if (unit === 'day') { const end = utc(sorted.at(-1)!); for (let at = range ? utc(range.from) : end - 30 * DAY; at <= end; at += DAY) keys.push(iso(at)); }
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

/** อัตโนมัติ for the chart: รายวัน for a range of up to 62 days, else รายเดือน. */
export const imcAutoUnit = (from: string, to: string): ImcUnit => ((utc(to) - utc(from)) / DAY + 1 <= 62 ? 'day' : 'month');

export type ImcPreset = { key: string; label: string; from: string; to: string };
/** The แถบช่วงวันที่ shortcuts. ทั้งหมด runs from the first service date (today when there is none) to today or the latest one. */
export function imcPresets(today: string, first: string, last: string): ImcPreset[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = iso(utc(monthStart) - DAY);
  const fyStartYear = m >= 10 ? y : y - 1;
  const fy = fyStartYear + 544;
  return [
    { key: 'all', label: 'ทั้งหมด', from: first && first < today ? first : today, to: last > today ? last : today },
    { key: 'today', label: 'วันนี้', from: today, to: today },
    { key: 'week', label: '7 วันล่าสุด', from: iso(utc(today) - 6 * DAY), to: today },
    { key: 'month', label: 'เดือนนี้', from: monthStart, to: today },
    { key: 'lastMonth', label: 'เดือนก่อน', from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
    { key: 'fy', label: `ปีงบนี้ (${fy})`, from: `${fyStartYear}-10-01`, to: today },
    { key: 'lastFy', label: `ปีงบ ${fy - 1}`, from: `${fyStartYear - 1}-10-01`, to: `${fyStartYear}-09-30` }
  ];
}

export type ImcRangeLine = { person: number; date: string; code: string; claim: number; pending: boolean; repNo: string };
export type ImcRangePerson = { visits: number; claim: number; paid: number; repNos: string[]; lines: ImcRangeLine[] };
const round2 = (value: number) => Math.round(value * 100) / 100;
/** What happened between `from` and `to` (วันที่รับบริการ, both included): totals for the summary cards and each person's claims. */
export function imcInRange(data: { lines: readonly ImcRangeLine[]; reps: readonly { person: number | null; date: string; repNo: string; paid: number }[] }, from: string, to: string) {
  const inside = (day: string) => day >= from && day <= to;
  const lines = data.lines.filter((line) => inside(line.date));
  const reps = data.reps.filter((rep) => inside(rep.date));
  const people = new Map<number, ImcRangePerson>();
  const own = (id: number) => people.get(id) ?? people.set(id, { visits: 0, claim: 0, paid: 0, repNos: [], lines: [] }).get(id)!;
  for (const line of lines) { const person = own(line.person); if (line.code === IMC_VISIT_CODE) person.visits++; person.claim = round2(person.claim + line.claim); person.lines.push(line); }
  for (const rep of reps) {
    if (rep.person === null) continue;
    const person = own(rep.person);
    person.paid = round2(person.paid + rep.paid);
    if (!person.repNos.includes(rep.repNo)) person.repNos = [...person.repNos, rep.repNo].sort();
  }
  return {
    lines, people, visits: lines.filter((line) => line.code === IMC_VISIT_CODE).length, claim: round2(lines.reduce((sum, line) => sum + line.claim, 0)), pending: lines.filter((line) => line.pending).length,
    paid: round2(reps.reduce((sum, rep) => sum + rep.paid, 0)), noRep: round2(lines.filter((line) => !line.repNo).reduce((sum, line) => sum + line.claim, 0)),
    repOutside: reps.filter((rep) => rep.person === null).length
  };
}
