import { describe, expect, it } from 'vitest';
import type { DpStoredRecord } from '@backoffice/core';
import { addDays, dpActiveTags, dpCountOptions, dpExportFileName, dpExportSheets, dpInitialState, dpList, dpPeriod, dpPeriodLabel, dpStatusLine, dpTrendLabel, dpTrendRange, dpView, dpYearOptions, monthEnd } from './dp-views';

const rec = (o: Partial<DpStoredRecord>): DpStoredRecord => ({
  ref: 'x', date: '2025-10-05', fy: 2569, visit_no: 1, cid: '1', name: 'ทดสอบ', hn: 'h1', an: '', target: 'กลุ่มที่ 3', dis_type: '', adl: '', right: 'UCS', subright: '',
  svc_type: 'ผู้ป่วยนอก', code: 'H9339', service: 'กายภาพบำบัด', icd10: '', icd9: '', staff: 'เจ้าหน้าที่', status: '', claim: 160, eligible: 150, std_price: 0,
  charge_unit: 0, paid_unit: 0, diff_unit: 0, qty: 1, saved: '', start: '', end: '', ...o
});
const records = [
  rec({ ref: '1', date: '2024-10-02', fy: 2568, right: 'WEL' }),
  rec({ ref: '2', date: '2025-10-01', cid: 'a' }),
  rec({ ref: '3', date: '2025-11-13', cid: 'b', status: 'D24', service: 'จิตบำบัด', code: 'H9449' }),
  rec({ ref: '4', date: '2025-11-13', cid: 'a', target: 'กลุ่มที่ 1' })
];

describe('dp-views', () => {
  it('starts on the latest ปีงบ, the last day and that month, as the legacy setup', () => {
    expect(dpInitialState(records)).toEqual({ mode: 'year', fy: '2569', day: '2025-11-13', from: '2025-11-01', to: '2025-11-13', right: '', target: '', svcType: '', service: '', statusCode: '', q: '' });
    const kept = { ...dpInitialState(records), fy: '2568', day: '2025-10-01', right: 'UCS' };
    expect(dpInitialState(records, kept)).toEqual(kept);
    expect(dpInitialState(records, { ...kept, fy: '2560' }).fy).toBe('2569');
  });

  it('lists ปีงบ newest first and select values by count, with counts', () => {
    expect(dpYearOptions(records)).toEqual([[2569, 3], [2568, 1]]);
    expect(dpCountOptions(records, 'right')).toEqual([['UCS', 3], ['WEL', 1]]);
    expect(dpCountOptions(records, 'target')).toEqual([['กลุ่มที่ 3', 3], ['กลุ่มที่ 1', 1]]);
  });

  it('turns the time view into a period, its label and the trend range', () => {
    const s = dpInitialState(records);
    expect(dpPeriod(s)).toEqual({ from: '2025-10-01', to: '2026-09-30' });
    expect(dpPeriod({ ...s, fy: '' })).toEqual({ from: '', to: '' });
    expect(dpPeriod({ ...s, mode: 'day' })).toEqual({ from: '2025-11-13', to: '2025-11-13' });
    expect(dpPeriod({ ...s, mode: 'range', from: '2025-11-30', to: '2025-11-01' })).toEqual({ from: '2025-11-01', to: '2025-11-30' });
    expect(dpPeriodLabel(s)).toBe('ปีงบ 2569 (1 ต.ค. 2568 – 30 ก.ย. 2569)');
    expect(dpPeriodLabel({ ...s, fy: '' })).toBe('ทุกปีงบ');
    expect(dpPeriodLabel({ ...s, mode: 'day' })).toBe('วันที่ 13 พ.ย. 2568');
    expect(dpPeriodLabel({ ...s, mode: 'range' })).toBe('1 พ.ย. 2568 – 13 พ.ย. 2568');
    expect(dpTrendRange({ ...s, mode: 'day' })).toEqual({ from: '2025-11-01', to: '2025-11-30' });
    expect(dpTrendRange(s)).toEqual({ from: '2025-10-01', to: '2026-09-30' });
  });

  it('shows what is being shown as tags', () => {
    const s = { ...dpInitialState(records), right: 'UCS', target: 'กลุ่มที่ 3', svcType: 'ผู้ป่วยนอก', service: 'จิตบำบัด', statusCode: 'D24', q: 'h1' };
    expect(dpActiveTags(s)).toEqual(['ปีงบ 2569 (1 ต.ค. 2568 – 30 ก.ย. 2569)', 'สิทธิ UCS', 'กลุ่มที่ 3', 'ผู้ป่วยนอก', 'จิตบำบัด', 'สถานะ D24', 'ค้นหา "h1"']);
  });

  it('computes KPIs, services with a total, the trend, ปีงบ rows and status codes like the legacy page', () => {
    const s = dpInitialState(records);
    const view = dpView(records, s);
    expect([view.kpis.visits, view.kpis.persons, view.kpis.claim, view.kpis.eligible, view.kpis.flagged]).toEqual([3, 2, 480, 300, 1]);
    expect(view.services.map((row) => [row.service, row.visits])).toEqual([['กายภาพบำบัด', 2], ['จิตบำบัด', 1]]);
    expect(view.total.visits).toBe(3);
    expect(view.trend.unit).toBe('month');
    expect(view.trend.buckets.slice(0, 2).map((b) => [b.key, b.visits])).toEqual([['2025-10', 1], ['2025-11', 2]]);
    expect(view.years.map((row) => [row.fy, row.visits])).toEqual([[2569, 3], [2568, 1]]);
    expect(view.flags.map((row) => [row.code, row.visits])).toEqual([['D24', 1]]);
    const picked = dpView(records, { ...s, service: 'จิตบำบัด' });
    expect(picked.kpis.visits).toBe(1);
    expect(picked.services).toHaveLength(2);
    expect(picked.years.map((row) => [row.fy, row.visits])).toEqual([[2569, 1]]);
  });

  it('lists newest first (then เลขที่อ้างอิง), by status code and search', () => {
    const view = dpView(records, dpInitialState(records));
    expect(dpList(view.scoped, '', '').map((x) => x.ref)).toEqual(['4', '3', '2']);
    expect(dpList(view.scoped, 'D24', '').map((x) => x.ref)).toEqual(['3']);
    expect(dpList(view.scoped, '', 'จิต').map((x) => x.ref)).toEqual(['3']);
  });

  it('writes the status line with the latest update in Bangkok time', () => {
    expect(dpStatusLine(records, [{ updatedAt: '2026-11-13T07:05:00.000Z' }, { updatedAt: '2026-11-01T01:00:00.000Z' }]))
      .toBe('ข้อมูล 4 ครั้ง · 2 ปีงบ (2 ต.ค. 2567 – 13 พ.ย. 2568) · ปรับปรุงล่าสุด 13 พ.ย. 2569 14:05');
  });

  it('labels trend buckets, steps days and finds month ends', () => {
    expect(dpTrendLabel('day', '2025-11-03')).toBe('3 พ.ย.');
    expect(dpTrendLabel('month', '2025-11')).toBe('พ.ย. 68');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });

  it('builds the four legacy Excel sheets and file name', () => {
    const s = dpInitialState(records);
    const view = dpView(records, s);
    const sheets = dpExportSheets(s, view, dpList(view.scoped, '', ''));
    expect(Object.keys(sheets)).toEqual(['ช่วงเวลา', 'รายบริการ', 'แนวโน้ม', 'รายการ']);
    expect(sheets['ช่วงเวลา']).toEqual([{ 'ช่วงเวลา': 'ปีงบ 2569 (1 ต.ค. 2568 – 30 ก.ย. 2569)' }]);
    expect(Object.keys(sheets['รายบริการ'][0]!)).toEqual(['ชื่อบริการฟื้นฟู', 'รหัส', 'จำนวนครั้ง', 'จำนวนคน', 'ราคาที่ขอเบิก (AE)', 'ราคาที่พึงเบิก (AF) ไม่รวมติดสถานะ', 'ส่วนต่าง', 'ติดสถานะ (ครั้ง)']);
    expect(sheets['แนวโน้ม'][0]).toEqual({ 'เดือน': '2025-10', 'จำนวนครั้ง': 1, 'ขอเบิก (AE)': 160, 'พึงเบิก (AF)': 150 });
    expect(sheets['รายการ'][0]).toEqual({ 'วันที่รับบริการ': '2025-11-13', 'ปีงบ': 2569, HN: 'h1', 'เลขบัตรประชาชน': 'a', 'ชื่อ - สกุล': 'ทดสอบ', 'สิทธิหลัก': 'UCS', 'กลุ่มเป้าหมาย': 'กลุ่มที่ 1',
      'ประเภทการรับบริการ': 'ผู้ป่วยนอก', 'รหัสบริการฟื้นฟู': 'H9339', 'ชื่อบริการฟื้นฟู': 'กายภาพบำบัด', 'จำนวน': 1, 'ราคาที่ขอเบิก (AE)': 160, 'ราคาที่พึงเบิก (AF)': 150, 'สถานะ': '', 'เลขที่อ้างอิง': '4', 'เจ้าหน้าที่': 'เจ้าหน้าที่' });
    expect(dpExportFileName(new Date(2026, 10, 3))).toBe('point-disability-20261103.xlsx');
  });
});
