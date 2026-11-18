import { describe, expect, it } from 'vitest';
import { herbRules, summarizeHerb, type HerbRow } from '@backoffice/core';
import { herbCount, herbExport, herbExportFileName, herbOntopPoints, herbRateText, herbSearchDrugs, herbVisibleGroups } from './herb-views';

// Made-up rows only.
const row = (o: Partial<HerbRow> = {}): HerbRow => ({ rxdate: '2026-11-05', vn: 'v1', an: '', hn: 'h1', icode: '1520003', drugName: 'ฟ้าทะลายโจร 400 mg.', units: 'cap', qty: 10, sumPrice: 20, unitcost: 1.5, stdprice: 2, pttype: '89', pttypeName: 'UC', hipdata: 'UCS', ...o });
const rows = [row(), row({ vn: 'v2', hn: 'h2', icode: '1560021', drugName: 'เลือดงาม', qty: 42, unitcost: 0.66, stdprice: 1 }), row({ vn: 'v3', hn: 'h3', pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC', qty: 0.5 })];
const summary = summarizeHerb(rows, herbRules(), new Map([['v1|1520003', 92]]));

describe('herb views', () => {
  it('shows สิทธิอื่น ๆ only when used, as the legacy table and chart did', () => {
    expect(herbVisibleGroups(summary.groups).map((g) => g.key)).toEqual(['ofc', 'lgo', 'uc', 'cash', 'sss', 'receipt']);
    const other = summarizeHerb([row({ pttype: '', pttypeName: '', hipdata: '' })], herbRules(), null);
    expect(herbVisibleGroups(other.groups).map((g) => g.key)).toContain('other');
  });

  it('writes the ontop rate and the unconverted points like the legacy page', () => {
    const [fah, blood] = [summary.drugs.find((d) => d.icode === '1520003')!, summary.drugs.find((d) => d.icode === '1560021')!];
    expect(herbRateText(fah)).toEqual({ text: 'ontop 92 บาท/ครั้ง', title: 'ชดเชยต่อครั้ง (จ่าย 20 แคปซูล)' });
    expect(herbRateText(blood)?.text).toBe('ontop 264.50 point/ครั้ง');
    expect(herbRateText(summary.drugs.find((d) => d.icode === 'none') ?? { ...fah, ontopRate: null })).toBeNull();
    expect(herbOntopPoints(summary.totals, null)).toBe('+ 264.50 point');
    expect(herbOntopPoints(summary.totals, 0.5)).toBeNull();
    expect(herbCount(0.5)).toBe('1');
    expect(herbCount(1234.4)).toBe('1,234');
  });

  it('searches drugs by name or icode', () => {
    expect(herbSearchDrugs(summary.drugs, ' เลือด ').map((d) => d.icode)).toEqual(['1560021']);
    expect(herbSearchDrugs(summary.drugs, '1520003').map((d) => d.icode)).toEqual(['1520003']);
    expect(herbSearchDrugs(summary.drugs, '')).toHaveLength(2);
  });

  it('builds the legacy Excel sheets and columns', () => {
    const book = herbExport(summary, '5 พฤศจิกายน 2569');
    expect(book.head).toEqual([['การจ่ายยาสมุนไพร'], ['5 พฤศจิกายน 2569'], []]);
    expect(book.summary.at(-1)).toEqual({ 'สิทธิ/ยา': 'รวมทั้งสิ้น', 'จำนวนครั้ง': 3, 'ต้นทุน (บาท)': summary.totals.cost, 'มูลค่าจริง (บาท)': summary.totals.value, 'คาดการณ์ ontop (บาท)': 92, 'คาดการณ์ ontop (point)': 264.5, 'รับจริง (บาท)': 92, 'รวม (บาท)': summary.totals.total });
    expect(book.summary).toHaveLength(7);
    expect(Object.keys(book.sheets)).toEqual(['สิทธิ×รายยา', 'รายยา', 'รายวัน']);
    expect(Object.keys(book.sheets['สิทธิ×รายยา']![0]!)).toEqual(['สิทธิ/ยา', 'จำนวนครั้ง', 'ต้นทุน (บาท)', 'มูลค่าจริง (บาท)', 'คาดการณ์ ontop (บาท)', 'คาดการณ์ ontop (point)', 'รับจริง (บาท)', 'รวม (บาท)', 'icode', 'ชื่อยา', 'จำนวนจ่าย', 'หน่วย', 'ชดเชยต่อครั้ง']);
    expect(book.sheets['สิทธิ×รายยา']![0]).toMatchObject({ 'สิทธิ/ยา': 'สิทธิข้าราชการ', icode: '1520003', 'ชดเชยต่อครั้ง': '92 บาท (20 แคปซูล)' });
    expect(book.sheets['รายยา']![0]).toEqual({ icode: '1560021', 'ชื่อยา': 'เลือดงาม', 'จำนวนจ่าย': 42, 'หน่วย': 'cap', 'จำนวนครั้ง': 1, 'คน': 1, 'ต้นทุน (บาท)': 27.72, 'มูลค่าจริง (บาท)': 42, 'ส่วนต่าง (บาท)': 14.28, 'คาดการณ์ ontop (บาท)': 0, 'คาดการณ์ ontop (point)': 264.5, 'ชดเชยต่อครั้ง': '264.5 point (42 แคปซูล)' });
    expect(book.sheets['รายวัน']).toEqual([{ 'วันที่': '2026-11-05', 'จำนวนครั้ง': 3, 'ต้นทุน (บาท)': summary.totals.cost, 'มูลค่าจริง (บาท)': summary.totals.value, 'คาดการณ์ ontop (บาท)': 92, 'คาดการณ์ ontop (point)': 264.5 }]);
    const waiting = herbExport(summarizeHerb(rows, herbRules(), null), 'x');
    expect(waiting.summary[0]?.['รับจริง (บาท)']).toBe('รอ REP');
    expect(herbExportFileName('2026-11-05', '2026-11-06')).toBe('herb-dispense_2026-11-05_2026-11-06.xlsx');
  });
});
