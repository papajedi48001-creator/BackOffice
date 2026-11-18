import type { NhsoCell } from '@backoffice/contracts';

/** คอลัมน์ที่ต้องมีในรายงานเอกสารการโอนเงินแยกตามหน่วยงาน; without one the file is not a transfer report. */
export const NHSO_REQUIRED_COLUMNS = ['วันที่โอน', 'กองทุน', 'คงเหลือ', 'เงินโอนเข้าบัญชี'] as const;

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** One report as stored: the header fields plus the whole sheet (rows of cells) as the browser read it. */
export type NhsoReport = {
  hcode: string; name: string; region: string; dateFrom: string | null; dateTo: string | null; fy: number;
  rowCount: number; transferTotal: number; fileName: string; rows: NhsoCell[][];
};

export type NhsoReportResult = { ok: true; report: NhsoReport } | { ok: false; message: string };

/** PHP `(string)` of a cell: blank for null and false, '1' for true. */
const text = (value: NhsoCell | undefined): string => (value === null || value === undefined || value === false ? '' : value === true ? '1' : String(value));
const filled = (row: NhsoCell[]) => row.filter((value) => text(value).trim() !== '').length;

/** ปี พ.ศ. or ค.ศ. → `YYYY-MM-DD` (ค.ศ.), or null for a date that does not exist. */
function isoDate(year: number, month: number, day: number): string | null {
  const y = year > 2400 ? year - 543 : year;
  const date = new Date(Date.UTC(y, month - 1, day));
  if (month < 1 || month > 12 || day < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "25 ก.ย. 2569" or "25/09/2569" → "2026-09-25". */
function parseThaiDate(value: string): string | null {
  const s = value.trim();
  const thai = /(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/u.exec(s);
  if (thai) {
    const month = TH_MONTHS.indexOf(thai[2]!.replace(/ /g, ''));
    return month < 0 ? null : isoDate(Number(thai[3]), month + 1, Number(thai[1]));
  }
  const slash = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return slash ? isoDate(Number(slash[3]), Number(slash[2]), Number(slash[1])) : null;
}

/** A cell as a number like PHP `is_numeric` after removing commas; anything else counts as 0. */
function num(value: NhsoCell | undefined): number {
  if (typeof value === 'number') return value;
  const s = text(value).trim().replace(/,/g, '');
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : 0;
}

/** ปีงบประมาณ (พ.ศ.) of a ค.ศ. `YYYY-MM-DD`: ต.ค.–ธ.ค. count as the next ปีงบ. */
export function fiscalYearOf(isoDateValue: string): number {
  const [year, month] = isoDateValue.split('-').map(Number) as [number, number];
  return year + 543 + (month >= 10 ? 1 : 0);
}

/**
 * Reads รายงานเอกสารการโอนเงินแยกตามหน่วยงาน the way the legacy `NhsoReport::parse` did: the header row is the first row with at
 * least 3 filled cells, หน่วยบริการ and ปีงบ come from the lines above it (never the file name), and empty and รวม rows are not counted.
 */
export function parseNhsoReport(table: readonly (readonly NhsoCell[] | null | undefined)[], fileName: string): NhsoReportResult {
  const aoa: NhsoCell[][] = table.map((row) => (Array.isArray(row) ? [...row] : []));
  const headerIndex = aoa.findIndex((row) => filled(row) >= 3);
  if (headerIndex < 0) return { ok: false, message: 'ไฟล์นี้ไม่ใช่รายงานโอนเงิน สปสช. (ไม่พบตารางข้อมูล)' };
  const head = aoa[headerIndex]!.map((cell) => text(cell).trim());
  const missing = NHSO_REQUIRED_COLUMNS.filter((column) => !head.includes(column));
  if (missing.length > 0) return { ok: false, message: `ไฟล์นี้ไม่ใช่รายงานโอนเงิน สปสช. ขาดคอลัมน์: ${missing.join(', ')}` };

  let hcode: string | null = null;
  let name = '';
  let region = '';
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  for (const row of aoa.slice(0, headerIndex)) {
    const line = row.map(text).filter((value) => value.trim() !== '').join(' ').trim();
    const unit = /หน่วยบริการ\s*(\d{5})\s*(.*)$/u.exec(line);
    const range = /(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(line);
    if (hcode === null && unit) {
      hcode = unit[1]!;
      name = unit[2]!.replace(/\s+/gu, ' ').trim();
    } else if (region === '' && /^เขต/u.test(line)) {
      region = line;
    } else if (dateFrom === null && range) {
      dateFrom = isoDate(Number(range[3]), Number(range[2]), Number(range[1]));
      dateTo = isoDate(Number(range[6]), Number(range[5]), Number(range[4]));
    }
  }
  if (hcode === null) return { ok: false, message: 'ไม่พบรหัสหน่วยบริการในหัวรายงาน (แถว "หน่วยบริการ 11093 ...")' };

  // array_flip: a repeated column name points at its last position.
  const column = new Map(head.map((value, index) => [value, index]));
  const transferAt = column.get('เงินโอนเข้าบัญชี')!;
  const dateAt = column.get('วันที่โอน')!;
  let rowCount = 0;
  let total = 0;
  let firstDate: string | null = null;
  for (const row of aoa.slice(headerIndex + 1)) {
    if (!filled(row) || /^(รวม|ยอดรวม|total)/iu.test(text(row[0]).trim())) continue;
    rowCount += 1;
    total += num(row[transferAt]);
    if (firstDate === null) firstDate = parseThaiDate(text(row[dateAt]));
  }
  if (rowCount === 0) return { ok: false, message: 'ไฟล์นี้ไม่มีรายการโอน' };
  const reference = dateFrom ?? firstDate;
  if (reference === null) return { ok: false, message: 'ไม่พบช่วงวันที่โอนในหัวรายงาน และอ่านวันที่โอนในตารางไม่ได้' };
  return { ok: true, report: { hcode, name, region, dateFrom, dateTo, fy: fiscalYearOf(reference), rowCount, transferTotal: Math.round(total * 100) / 100, fileName, rows: aoa } };
}
