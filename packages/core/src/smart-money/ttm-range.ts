/** Up to 5 years, so ปีงบ can be compared (legacy `date_range_from_request(1830)`). */
export const TTM_MAX_DAYS = 1830;

export type TtmPreset = { label: 'วันนี้' | 'เมื่อวาน' | 'เดือนนี้' | 'เดือนที่แล้ว' | 'ปีงบประมาณนี้' | 'ปีงบที่แล้ว' | '3 ปีงบย้อนหลัง'; start: string; end: string };

const DAY = 86_400_000;
const iso = /^\d{4}-\d{2}-\d{2}$/;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (time: number) => new Date(time).toISOString().slice(0, 10);
/** A real Gregorian date `YYYY-MM-DD`; a Buddhist-era year (2400 or later) is not, since HOSxP stores ค.ศ. */
const isDate = (value: string | undefined): value is string => !!value && iso.test(value) && Number(value.slice(0, 4)) < 2400 && !Number.isNaN(toTime(value)) && format(toTime(value)) === value;

/**
 * The ช่วงวันที่ from the query string, fixed the legacy way instead of refused: no start → `today` (Bangkok), no end → the start,
 * a reversed range swapped, longer than 1,830 days cut to start + 1,830 days.
 */
export function ttmRange(input: { start?: string; end?: string }, today: string): { start: string; end: string } {
  let start = isDate(input.start) ? input.start : today;
  let end = isDate(input.end) ? input.end : start;
  if (start > end) [start, end] = [end, start];
  if ((toTime(end) - toTime(start)) / DAY > TTM_MAX_DAYS) end = format(toTime(start) + TTM_MAX_DAYS * DAY);
  return { start, end };
}

/** ปุ่มลัดช่วงวันที่ of the legacy page; ปีงบ runs 1 ต.ค. – 30 ก.ย. */
export function ttmPresets(today: string): TtmPreset[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const fy = month >= 10 ? year : year - 1;
  const yesterday = format(toTime(today) - DAY);
  const min = (a: string, b: string) => (a < b ? a : b);
  return [
    { label: 'วันนี้', start: today, end: today },
    { label: 'เมื่อวาน', start: yesterday, end: yesterday },
    { label: 'เดือนนี้', start: `${today.slice(0, 7)}-01`, end: today },
    { label: 'เดือนที่แล้ว', start: format(Date.UTC(year, month - 2, 1)), end: format(Date.UTC(year, month - 1, 0)) },
    { label: 'ปีงบประมาณนี้', start: `${fy}-10-01`, end: min(today, `${fy + 1}-09-30`) },
    { label: 'ปีงบที่แล้ว', start: `${fy - 1}-10-01`, end: `${fy}-09-30` },
    { label: '3 ปีงบย้อนหลัง', start: `${fy - 2}-10-01`, end: today }
  ];
}

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
/** `5 พฤศจิกายน 2569` (legacy `thai_date($d, false)`). */
const longDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(0, 4)) + 543}`;
/** `วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569` (legacy `ttm_day_label`). */
export const ttmDayLabel = (date: string): string => `${DAYS[new Date(toTime(date)).getUTCDay()]} ที่ ${longDate(date)}`;
/** The banner date: the day label for one day, else `from – to`. */
export const ttmPeriodText = (start: string, end: string): string => (start === end ? ttmDayLabel(start) : `${longDate(start)} – ${longDate(end)}`);
