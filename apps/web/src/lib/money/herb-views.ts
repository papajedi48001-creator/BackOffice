import type { HerbDrug, HerbGroup, HerbSummary, HerbTally } from '@backoffice/core';
import { ttmBaht } from './ttm-views';

const whole = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
/** Counts and quantities as the legacy page printed them (`number_format`: whole numbers, halves away from zero). */
export const herbCount = (value: number): string => whole.format(value);

/** The สิทธิ rows the legacy page showed: every group, but สิทธิอื่น ๆ only when it has visits. */
export const herbVisibleGroups = (groups: readonly HerbGroup[]): HerbGroup[] => groups.filter((group) => group.key !== 'other' || group.visits > 0);

/** The "+ n point" line under an ontop cell while points are not converted to baht (`HERB_POINT_BAHT` unset). */
export const herbOntopPoints = (row: Pick<HerbTally, 'ontopPoints'>, pointBaht: number | null): string | null =>
  pointBaht === null && row.ontopPoints > 0 ? `+ ${ttmBaht(row.ontopPoints)} point` : null;

/** The ontop tag after a drug's name: its rate per visit, and the standard amount it stands for. */
export function herbRateText(drug: Pick<HerbDrug, 'ontopRate'>): { text: string; title: string } | null {
  const rate = drug.ontopRate;
  if (!rate) return null;
  const amount = rate.baht !== null ? `${ttmBaht(rate.baht)} บาท` : `${ttmBaht(rate.points ?? 0)} point`;
  return { text: `ontop ${amount}/ครั้ง`, title: `ชดเชยต่อครั้ง (จ่าย ${rate.stdQty} ${rate.unit})` };
}

/** ค้นหาชื่อยา / icode, in the browser as the legacy table search. */
export function herbSearchDrugs(drugs: readonly HerbDrug[], query: string): HerbDrug[] {
  const words = query.trim().toLowerCase();
  if (!words) return [...drugs];
  return drugs.filter((drug) => [drug.icode, drug.name, herbRateText(drug)?.text ?? '', drug.units].join(' ').toLowerCase().includes(words));
}

type Row = Record<string, string | number>;
export type HerbExportBook = { head: string[][]; summary: Row[]; sheets: Record<string, Row[]> };

const received = (value: number | null) => (value === null ? 'รอ REP' : value);
const rateCell = (drug: HerbDrug) => {
  const rate = drug.ontopRate;
  return rate ? `${rate.baht !== null ? `${rate.baht} บาท` : `${rate.points} point`} (${rate.stdQty} ${rate.unit})` : '';
};
const line = (name: string, x: HerbTally): Row => ({
  'สิทธิ/ยา': name, 'จำนวนครั้ง': x.visits, 'ต้นทุน (บาท)': x.cost, 'มูลค่าจริง (บาท)': x.value, 'คาดการณ์ ontop (บาท)': x.ontop,
  'คาดการณ์ ontop (point)': x.ontopPoints, 'รับจริง (บาท)': received(x.received), 'รวม (บาท)': x.total
});

/** The legacy Excel: สรุปตามสิทธิ (title, period, rows), สิทธิ×รายยา, รายยา, รายวัน, with the legacy column names. */
export function herbExport(summary: HerbSummary, period: string): HerbExportBook {
  const groups = herbVisibleGroups(summary.groups);
  return {
    head: [['การจ่ายยาสมุนไพร'], [period], []],
    summary: [...groups.map((group) => line(group.name, group)), line('รวมทั้งสิ้น', summary.totals)],
    sheets: {
      'สิทธิ×รายยา': groups.flatMap((group) => group.drugs.map((drug) => ({ ...line(group.name, drug), icode: drug.icode, 'ชื่อยา': drug.name, 'จำนวนจ่าย': drug.qty, 'หน่วย': drug.units, 'ชดเชยต่อครั้ง': rateCell(drug) }))),
      'รายยา': summary.drugs.map((drug) => ({
        icode: drug.icode, 'ชื่อยา': drug.name, 'จำนวนจ่าย': drug.qty, 'หน่วย': drug.units, 'จำนวนครั้ง': drug.visits, 'คน': drug.patients,
        'ต้นทุน (บาท)': drug.cost, 'มูลค่าจริง (บาท)': drug.value, 'ส่วนต่าง (บาท)': Math.round((drug.value - drug.cost) * 100) / 100,
        'คาดการณ์ ontop (บาท)': drug.ontop, 'คาดการณ์ ontop (point)': drug.ontopPoints, 'ชดเชยต่อครั้ง': rateCell(drug)
      })),
      'รายวัน': summary.days.map((day) => ({ 'วันที่': day.date, 'จำนวนครั้ง': day.visits, 'ต้นทุน (บาท)': day.cost, 'มูลค่าจริง (บาท)': day.value, 'คาดการณ์ ontop (บาท)': day.ontop, 'คาดการณ์ ontop (point)': day.ontopPoints }))
    }
  };
}

export const herbExportFileName = (start: string, end: string): string => `herb-dispense_${start}_${end}.xlsx`;
