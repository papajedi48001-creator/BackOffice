import { describe, expect, it } from 'vitest';
import type { NhsoCell } from '@backoffice/contracts';
import { nhsoFiscalYear, parseNhsoReport } from './nhso-report';

// Ported from the legacy tests/nhso/NhsoReportTest.php, case by case.
const HEAD = ['ลำดับ', 'วันที่โอน', 'Batch No.', 'งวด/เลขที่เบิกจ่าย', 'รหัสผังบัญชี สป.สธ.', 'กองทุน', 'กองทุนย่อยเฉพาะด้าน', 'จำนวนเงิน',
  'ชะลอการโอน', 'รายการหักจากยอดโอนเงิน', 'หลักประกันสัญญา', 'ภาษี', 'คงเหลือ', 'จำนวนเงินรอหักกลบ', 'เงินโอนเข้าบัญชี'];
const aoa = (meta: NhsoCell[][], rows: NhsoCell[][]): NhsoCell[][] => [...meta, HEAD, ...rows];
const row = (seq: number, date: string, fund: string, balance: number, transfer: number): NhsoCell[] => [seq, date, '3477', '690100103', '1102050102.801/802', fund, 'ย่อย', balance, 0, 0, 0, 0, balance, 0, transfer];
const meta: NhsoCell[][] = [
  ['รายงานเอกสารการโอนเงินแยกตามหน่วยงาน'],
  ['เขตพื้นที่ เขต 8 อุดรธานี จังหวัด สกลนคร'],
  ['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ '],
  ['วันที่โอนตั้งแต่ 01/10/2568 ถึง 30/09/2569']
];
const rows: NhsoCell[][] = [
  row(1, '25 ก.ย. 2569', 'กองทุนผู้ป่วยใน', 100.5, 150.5),
  row(1, '25 ก.ย. 2569', 'กองทุนผู้ป่วยใน', 50, 0),
  ['รวม', null, null, null, null, null, null, 150.5, 0, 0, 0, 0, 150.5, 0, 150.5]
];
const parsed = (table: NhsoCell[][], fileName = 'x.xlsx') => {
  const result = parseNhsoReport(table, fileName);
  if (!result.ok) throw new Error(result.message);
  return result.report;
};
const refused = (table: NhsoCell[][]) => {
  const result = parseNhsoReport(table, 'x.xlsx');
  if (result.ok) throw new Error('expected a refusal');
  return result.message;
};

describe('parseNhsoReport', () => {
  it('reads the report header of ปีงบ 2569', () => {
    const report = parsed(aoa(meta, rows), 'nhso_1968667640  11093   2569.xlsx');
    expect(report).toMatchObject({ hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', region: 'เขตพื้นที่ เขต 8 อุดรธานี จังหวัด สกลนคร', dateFrom: '2025-10-01', dateTo: '2026-09-30', fy: 2569, rowCount: 2, transferTotal: 150.5, fileName: 'nhso_1968667640  11093   2569.xlsx' });
    expect(report.rows).toHaveLength(meta.length + 1 + rows.length);
  });

  it('takes ปีงบ 2570 from a range that starts in October', () => {
    expect(parsed(aoa([...meta.slice(0, 3), ['วันที่โอนตั้งแต่ 01/10/2569 ถึง 22/10/2569']], rows)).fy).toBe(2570);
  });

  it('takes the hospital from the header, not the file name', () => {
    const report = parsed(aoa([meta[0]!, meta[1]!, ['หน่วยบริการ 11099 โรงพยาบาลพระอาจารย์วัน  อุตฺตโม '], meta[3]!], rows), 'nhso_288580438  11096  2569.xlsx');
    expect(report.hcode).toBe('11099');
    expect(report.name).toBe('โรงพยาบาลพระอาจารย์วัน อุตฺตโม');
  });

  it('takes ปีงบ from the first transfer date when the header has no range, in Thai or dd/mm/yyyy form', () => {
    expect(parsed(aoa(meta.slice(0, 3), [row(1, '21 ต.ค. 2569', 'งบแพทย์แผนไทย', 10, 10)])).fy).toBe(2570);
    expect(parsed(aoa(meta.slice(0, 3), [row(1, '15/03/2569', 'ก', 10, 10)])).fy).toBe(2569);
  });

  it('keeps looking for a transfer date past a row whose date cannot be read', () => {
    expect(parsed(aoa(meta.slice(0, 3), [row(1, '', 'ก', 1, 1), row(2, '21 ต.ค. 2569', 'ก', 1, 1)])).fy).toBe(2570);
  });

  it('refuses a report without a หน่วยบริการ line', () => {
    expect(refused(aoa([meta[0]!, meta[1]!, meta[3]!], rows))).toContain('ไม่พบรหัสหน่วยบริการ');
  });

  it('names a missing column', () => {
    expect(refused([...meta, ['ลำดับ', 'วันที่โอน', 'กองทุน', 'เงินโอนเข้าบัญชี'], [1, '25 ก.ย. 2569', 'ก', 1]])).toBe('ไฟล์นี้ไม่ใช่รายงานโอนเงิน สปสช. ขาดคอลัมน์: คงเหลือ');
  });

  it('refuses an empty file and a report without rows', () => {
    expect(refused([])).toContain('ไม่ใช่รายงานโอนเงิน');
    expect(refused(aoa(meta, []))).toBe('ไฟล์นี้ไม่มีรายการโอน');
  });

  it('reads numbers written as text with commas', () => {
    expect(parsed(aoa(meta, [[1, '25 ก.ย. 2569', 'b', 'p', 'a', 'ก', 'ย่อย', '1,000.25', 0, 0, 0, 0, '1,000.25', 0, '1,000.25']])).transferTotal).toBe(1000.25);
  });

  it('refuses when neither the header nor the rows give a date', () => {
    expect(refused(aoa(meta.slice(0, 3), [row(1, '', 'ก', 1, 1)]))).toBe('ไม่พบช่วงวันที่โอนในหัวรายงาน และอ่านวันที่โอนในตารางไม่ได้');
  });
});

describe('nhsoFiscalYear', () => {
  it('counts ต.ค.–ธ.ค. as the next ปีงบ', () => {
    expect(nhsoFiscalYear('2025-09-30')).toBe(2568);
    expect(nhsoFiscalYear('2025-10-01')).toBe(2569);
  });
});
