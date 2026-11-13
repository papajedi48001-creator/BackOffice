export const DENTAL_MAX_DAYS = 366;

export type DentalRange = { ok: true; start: string; end: string } | { ok: false; code: 'INVALID_DATE' | 'END_BEFORE_START' | 'RANGE_TOO_LONG'; start: string; end: string };
export type DentalPreset = { label: 'เดือนนี้' | 'เดือนที่แล้ว' | 'ปีงบประมาณนี้'; start: string; end: string };

const DAY = 86_400_000;
const iso = /^\d{4}-\d{2}-\d{2}$/;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (time: number) => new Date(time).toISOString().slice(0, 10);
/** A real calendar date in `YYYY-MM-DD`. */
const isDate = (value: string) => iso.test(value) && !Number.isNaN(toTime(value)) && format(toTime(value)) === value;

const monthStart = (year: number, month: number) => format(Date.UTC(year, month, 1));
const monthEnd = (year: number, month: number) => format(Date.UTC(year, month + 1, 0));

/**
 * The ช่วงวันที่ from the query string; `today` is the Bangkok calendar date. A missing side falls back to the current month.
 * Longer than 366 days is refused (the legacy page cut it) so a single page load never runs a multi-year query on HOSxP.
 */
export function dentalRange(input: { start?: string; end?: string }, today: string): DentalRange {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const start = input.start || monthStart(year, month - 1);
  const end = input.end || monthEnd(year, month - 1);
  if (!isDate(start) || !isDate(end)) return { ok: false, code: 'INVALID_DATE', start, end };
  if (end < start) return { ok: false, code: 'END_BEFORE_START', start, end };
  if ((toTime(end) - toTime(start)) / DAY > DENTAL_MAX_DAYS) return { ok: false, code: 'RANGE_TOO_LONG', start, end };
  return { ok: true, start, end };
}

/** ปุ่มลัด: เดือนนี้, เดือนที่แล้ว, ปีงบประมาณนี้ (1 ต.ค. – 30 ก.ย.). */
export function dentalPresets(today: string): DentalPreset[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const fiscalStartYear = month >= 10 ? year : year - 1;
  return [
    { label: 'เดือนนี้', start: monthStart(year, month - 1), end: monthEnd(year, month - 1) },
    { label: 'เดือนที่แล้ว', start: monthStart(year, month - 2), end: monthEnd(year, month - 2) },
    { label: 'ปีงบประมาณนี้', start: `${fiscalStartYear}-10-01`, end: `${fiscalStartYear + 1}-09-30` }
  ];
}
