import { TTM_KINDS, TTM_RIGHT_GROUPS, type TtmKind, type TtmRightGroup } from '@backoffice/contracts';
import type { TtmPeriodRow, TtmPeriodType, TtmSummary, TtmVisitRow } from '@backoffice/core';
import { formatBangkokDateOnly } from '../bangkok-time';

const KIND_KEYS = Object.keys(TTM_KINDS) as TtmKind[];
const RIGHT_KEYS = Object.keys(TTM_RIGHT_GROUPS) as TtmRightGroup[];
const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const whole = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upTo2 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

/** Money as the legacy report showed it (`ttm_baht`): no decimals when whole, else 2. */
export const ttmBaht = (value: number): string => { const rounded = Math.round(value * 100) / 100; return Number.isInteger(rounded) ? whole.format(rounded) : two.format(rounded); };
/** Counts and the period table (dashboard.js `num`). */
export const ttmNum = (value: number): string => upTo2.format(value);

/** `5 พ.ย. 69` (dashboard.js `thaiShort`). */
const thaiShort = (date: string) => `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${String(Number(date.slice(0, 4)) + 543).slice(2)}`;
/** A period key as dashboard.js labels it: day `5 พ.ย. 69`, month `พ.ย. 2569`, ปีงบ `ปีงบ 2570`. */
export function ttmPeriodLabel(type: TtmPeriodType, key: string): string {
  if (type === 'day') return thaiShort(key);
  if (type === 'month') return `${SHORT_MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543}`;
  return `ปีงบ ${key}`;
}
/** The period view first shown: ≤ 62 days by day, ≤ 731 by month, else by ปีงบ. */
export function ttmDefaultPeriod(start: string, end: string): TtmPeriodType {
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return days <= 62 ? 'day' : days <= 731 ? 'month' : 'fy';
}

/** The report's สิทธิ rows: สิทธิอื่น ๆ only when someone used it. */
export const ttmVisibleGroups = (groups: TtmSummary['groups']): TtmSummary['groups'] => groups.filter((group) => group.key !== 'other' || group.patients > 0);
/** The matrix rows: สิทธิอื่น ๆ only when it has money. */
export const ttmMatrixRows = (matrix: TtmSummary['matrix']): TtmRightGroup[] => RIGHT_KEYS.filter((key) => key !== 'other' || KIND_KEYS.some((kind) => matrix.other[kind].amount > 0));

/** รายชื่อผู้รับบริการ search over what each row shows (legacy table-search.js). */
export function ttmSearchVisits(rows: readonly TtmVisitRow[], query: string): TtmVisitRow[] {
  const words = query.trim().toLowerCase();
  if (!words) return [...rows];
  return rows.filter((row) => [formatBangkokDateOnly(row.date), row.time.slice(0, 5), row.hn, row.patientName, row.ipd ? 'IPD' : '', row.afterHours ? 'นอกเวลา' : '', row.rightName, row.pttype, row.pttypeName, row.services, row.treatments, row.doctors,
    ttmBaht(row.massage), ttmBaht(row.herb), ttmBaht(row.opdFee), ttmBaht(row.total)].join(' ').toLowerCase().includes(words));
}

type Row = Record<string, string | number>;
export type TtmExportBook = { head: string[][]; summary: Row[]; sheets: Record<string, Row[]> };

const periodRows = (type: TtmPeriodType, list: readonly TtmPeriodRow[]): Row[] => list.map((period) => {
  const row: Row = { 'ช่วงเวลา': ttmPeriodLabel(type, period.key), 'ผู้รับบริการ (คน)': period.patients };
  for (const kind of KIND_KEYS) { row[`${TTM_KINDS[kind]} (คน)`] = period.kinds[kind].patients; row[`${TTM_KINDS[kind]} (บาท)`] = period.kinds[kind].amount; }
  row['รวมรายได้ (บาท)'] = period.total;
  return row;
});

/** ดาวน์โหลด Excel content, sheet by sheet as the legacy dashboard.js built it. */
export function ttmExport(summary: TtmSummary, info: { start: string; end: string; period: string; afterFrom: string; matrixRows: readonly TtmRightGroup[] }): TtmExportBook {
  const MASSAGE = 'ค่านวด/ประคบ/อบ/หัตถการ (บาท)';
  const top = (label: string, row: TtmSummary['all']): Row => ({ 'สิทธิการรักษา': label, 'จำนวนคน (ราย)': row.patients, [MASSAGE]: row.massageAmount, 'ค่ายาสมุนไพร (บาท)': row.herbAmount, 'รวมค่าบริการทั้งหมด (บาท)': row.total });
  const summaryRows: Row[] = [top('ผู้รับบริการทั้งหมด', summary.all), top('บริการผู้ป่วยใน (IPD)', summary.ipd), top(`บริการนอกเวลา (หลัง ${info.afterFrom} น.)`, summary.afterHours)];
  for (const group of ttmVisibleGroups(summary.groups)) summaryRows.push({ 'สิทธิการรักษา': group.name, 'จำนวนคน (ราย)': group.patients, [MASSAGE]: group.massage, 'ค่ายาสมุนไพร (บาท)': group.herb, 'รวมค่าบริการทั้งหมด (บาท)': group.total });
  summaryRows.push({ 'สิทธิการรักษา': 'ค่าบริการผู้ป่วยนอก (ในเวลา 50 บาท)', 'รวมค่าบริการทั้งหมด (บาท)': summary.totals.opdFee });
  summaryRows.push({ 'สิทธิการรักษา': 'รวมทั้งสิ้น', 'จำนวนคน (ราย)': summary.all.patients, [MASSAGE]: summary.totals.massage, 'ค่ายาสมุนไพร (บาท)': summary.totals.herb, 'รวมค่าบริการทั้งหมด (บาท)': summary.totals.grand });

  const matrixSheet = (field: 'patients' | 'amount'): Row[] => info.matrixRows.map((key) => {
    const row: Row = { 'สิทธิการรักษา': TTM_RIGHT_GROUPS[key] };
    let sum = 0;
    for (const kind of KIND_KEYS) { const value = summary.matrix[key][kind][field]; row[TTM_KINDS[kind]] = value; sum += value; }
    if (field === 'amount') row['รวมรายได้'] = sum;
    return row;
  });
  const visits: Row[] = summary.visitList.map((v) => ({
    'วันที่': thaiShort(v.date), 'เวลา': v.time.slice(0, 5), VN: v.vn, HN: v.hn, 'ชื่อ-สกุล': v.patientName, 'รหัสสิทธิ': v.pttype, 'ชื่อสิทธิ': v.pttypeName, 'กลุ่มสิทธิ': v.rightName,
    IPD: v.ipd ? 'ใช่' : '', 'นอกเวลา': v.afterHours ? 'ใช่' : '', 'ประเภทบริการ': v.services, 'การรักษา': v.treatments, 'ผู้ให้บริการ': v.doctors,
    'ค่านวด/หัตถการ': v.massage, 'ค่ายาสมุนไพร': v.herb, 'ค่าบริการผู้ป่วยนอก': v.opdFee, 'รวม': v.total
  }));
  return {
    head: [['สรุปผลการดำเนินงาน กลุ่มงานแพทย์แผนไทยและการแพทย์ทางเลือก'], [info.period], []],
    summary: summaryRows,
    sheets: {
      'คนรายบริการตามสิทธิ': matrixSheet('patients'), 'รายได้รายบริการตามสิทธิ': matrixSheet('amount'),
      'รายวัน': periodRows('day', summary.periods.day), 'รายเดือน': periodRows('month', summary.periods.month), 'รายปีงบ': periodRows('fy', summary.periods.fy),
      'รายชื่อผู้รับบริการ': visits
    }
  };
}

export const ttmExportFileName = (start: string, end: string): string => `ttm-${start}${end !== start ? `_${end}` : ''}.xlsx`;
