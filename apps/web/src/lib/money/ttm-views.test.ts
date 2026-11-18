import { describe, expect, it } from 'vitest';
import { ttmBaht, ttmDefaultPeriod, ttmExport, ttmExportFileName, ttmMatrixRows, ttmPeriodLabel, ttmSearchVisits, ttmVisibleGroups } from './ttm-views';
import type { TtmSummary, TtmVisitRow } from '@backoffice/core';

const cell = (patients = 0, amount = 0) => ({ patients, amount });
const kinds = (over: Partial<Record<string, ReturnType<typeof cell>>> = {}) => ({ thai_massage: cell(), compress: cell(), steam: cell(), knee: cell(), postpartum: cell(), other_proc: cell(), herb: cell(), opd_fee: cell(), ...over });

describe('ttm formatting', () => {
  it('shows money without decimals when whole (legacy ttm_baht)', () => {
    expect(ttmBaht(54003)).toBe('54,003');
    expect(ttmBaht(120.5)).toBe('120.50');
    expect(ttmBaht(0.004)).toBe('0');
    expect(ttmBaht(-10)).toBe('-10');
  });

  it('labels periods like dashboard.js', () => {
    expect(ttmPeriodLabel('day', '2026-11-05')).toBe('5 พ.ย. 69');
    expect(ttmPeriodLabel('month', '2026-11')).toBe('พ.ย. 2569');
    expect(ttmPeriodLabel('fy', '2570')).toBe('ปีงบ 2570');
  });

  it('picks the period view from the span', () => {
    expect(ttmDefaultPeriod('2026-11-01', '2027-01-02')).toBe('day');
    expect(ttmDefaultPeriod('2026-11-01', '2027-01-03')).toBe('month');
    expect(ttmDefaultPeriod('2024-11-01', '2026-11-01')).toBe('month');
    expect(ttmDefaultPeriod('2024-11-01', '2026-11-02')).toBe('month');
    expect(ttmDefaultPeriod('2024-11-01', '2026-11-03')).toBe('fy');
  });
});

const visit = (o: Partial<TtmVisitRow>): TtmVisitRow => ({ vn: 'v1', hn: '000001', date: '2026-11-05', time: '09:30:00', patientName: 'นายสมมติ ทดสอบ', pttype: '10', pttypeName: 'ข้าราชการ', right: 'ofc', rightName: 'สิทธิข้าราชการ', ipd: false, afterHours: false, services: 'ในหน่วยบริการ', doctors: 'แพทย์ ก', treatments: 'นวด', massage: 250, herb: 0, opdFee: 50, kinds: { thai_massage: 250, compress: 0, steam: 0, knee: 0, postpartum: 0, other_proc: 0, herb: 0, opd_fee: 50 }, total: 300, ...o });

describe('ttm lists', () => {
  const groups = [
    { key: 'ofc', name: 'สิทธิข้าราชการ', patients: 1, massage: 250, herb: 0, opdFee: 50, total: 250 },
    { key: 'other', name: 'สิทธิอื่น ๆ', patients: 0, massage: 0, herb: 0, opdFee: 0, total: 0 }
  ] as TtmSummary['groups'];

  it('hides สิทธิอื่น ๆ when nobody used it', () => {
    expect(ttmVisibleGroups(groups).map((g) => g.key)).toEqual(['ofc']);
    expect(ttmVisibleGroups([groups[0]!, { ...groups[1]!, patients: 1 }]).map((g) => g.key)).toEqual(['ofc', 'other']);
  });

  it('lists matrix rows, สิทธิอื่น ๆ only with money', () => {
    const matrix = { ofc: kinds(), lgo: kinds(), uc: kinds(), cash: kinds(), sss: kinds(), receipt: kinds(), other: kinds() } as TtmSummary['matrix'];
    expect(ttmMatrixRows(matrix)).toEqual(['ofc', 'lgo', 'uc', 'cash', 'sss', 'receipt']);
    expect(ttmMatrixRows({ ...matrix, other: kinds({ herb: cell(1, 30) }) } as TtmSummary['matrix'])).toContain('other');
  });

  it('searches HN, name, สิทธิ, service, provider and amounts', () => {
    const rows = [visit({}), visit({ vn: 'v2', hn: '000777', patientName: 'นางทดลอง', rightName: 'บัตรทอง (UC)', doctors: 'แพทย์ ข', total: 1250.5 })];
    expect(ttmSearchVisits(rows, '')).toHaveLength(2);
    expect(ttmSearchVisits(rows, '000777').map((r) => r.vn)).toEqual(['v2']);
    expect(ttmSearchVisits(rows, 'บัตรทอง').map((r) => r.vn)).toEqual(['v2']);
    expect(ttmSearchVisits(rows, 'แพทย์ ก').map((r) => r.vn)).toEqual(['v1']);
    expect(ttmSearchVisits(rows, '1,250.50').map((r) => r.vn)).toEqual(['v2']);
    expect(ttmSearchVisits(rows, '5 พ.ย. 2569')).toHaveLength(2);
  });
});

describe('ttmExport', () => {
  const summary = {
    all: { patients: 2, massage: 1, herb: 1, massageAmount: 250, herbAmount: 60, total: 310 },
    ipd: { patients: 1, massage: 0, herb: 1, massageAmount: 0, herbAmount: 60, total: 60 },
    afterHours: { patients: 0, massage: 0, herb: 0, massageAmount: 0, herbAmount: 0, total: 0 },
    groups: [{ key: 'ofc', name: 'สิทธิข้าราชการ', patients: 1, massage: 250, herb: 0, opdFee: 50, total: 250 }],
    totals: { massage: 250, herb: 60, opdFee: 50, grand: 360 },
    matrix: { ofc: kinds({ thai_massage: cell(1, 250), opd_fee: cell(1, 50) }) },
    periods: { day: [{ key: '2026-11-05', patients: 2, visits: 2, total: 360, kinds: kinds({ thai_massage: cell(1, 250) }) }], month: [], fy: [] },
    visitList: [visit({ ipd: true })]
  } as unknown as TtmSummary;

  it('builds the legacy sheets and columns', () => {
    const book = ttmExport(summary, { start: '2026-11-05', end: '2026-11-05', period: 'วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569', afterFrom: '16:00', matrixRows: ['ofc'] });
    expect(book.head).toEqual([['สรุปผลการดำเนินงาน กลุ่มงานแพทย์แผนไทยและการแพทย์ทางเลือก'], ['วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569'], []]);
    expect(book.summary.map((row) => row['สิทธิการรักษา'])).toEqual(['ผู้รับบริการทั้งหมด', 'บริการผู้ป่วยใน (IPD)', 'บริการนอกเวลา (หลัง 16:00 น.)', 'สิทธิข้าราชการ', 'ค่าบริการผู้ป่วยนอก (ในเวลา 50 บาท)', 'รวมทั้งสิ้น']);
    expect(book.summary[4]).toEqual({ 'สิทธิการรักษา': 'ค่าบริการผู้ป่วยนอก (ในเวลา 50 บาท)', 'รวมค่าบริการทั้งหมด (บาท)': 50 });
    expect(Object.keys(book.sheets)).toEqual(['คนรายบริการตามสิทธิ', 'รายได้รายบริการตามสิทธิ', 'รายวัน', 'รายเดือน', 'รายปีงบ', 'รายชื่อผู้รับบริการ']);
    expect(book.sheets['รายได้รายบริการตามสิทธิ']![0]).toMatchObject({ 'สิทธิการรักษา': 'สิทธิข้าราชการ', 'นวด': 250, 'ค่าบริการผู้ป่วยนอก': 50, 'รวมรายได้': 300 });
    expect(book.sheets['คนรายบริการตามสิทธิ']![0]).not.toHaveProperty('รวมรายได้');
    expect(book.sheets['รายวัน']![0]).toMatchObject({ 'ช่วงเวลา': '5 พ.ย. 69', 'ผู้รับบริการ (คน)': 2, 'นวด (คน)': 1, 'นวด (บาท)': 250, 'รวมรายได้ (บาท)': 360 });
    expect(book.sheets['รายชื่อผู้รับบริการ']![0]).toEqual({ 'วันที่': '5 พ.ย. 69', 'เวลา': '09:30', VN: 'v1', HN: '000001', 'ชื่อ-สกุล': 'นายสมมติ ทดสอบ', 'รหัสสิทธิ': '10', 'ชื่อสิทธิ': 'ข้าราชการ', 'กลุ่มสิทธิ': 'สิทธิข้าราชการ', IPD: 'ใช่', 'นอกเวลา': '', 'ประเภทบริการ': 'ในหน่วยบริการ', 'การรักษา': 'นวด', 'ผู้ให้บริการ': 'แพทย์ ก', 'ค่านวด/หัตถการ': 250, 'ค่ายาสมุนไพร': 0, 'ค่าบริการผู้ป่วยนอก': 50, 'รวม': 300 });
  });

  it('names the file by its range', () => {
    expect(ttmExportFileName('2026-11-05', '2026-11-05')).toBe('ttm-2026-11-05.xlsx');
    expect(ttmExportFileName('2026-11-01', '2026-11-05')).toBe('ttm-2026-11-01_2026-11-05.xlsx');
  });
});
