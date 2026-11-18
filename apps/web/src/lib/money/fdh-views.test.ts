import { describe, expect, it } from 'vitest';
import { buildCases, byFundVisit, byPersonFund, filterCases, type FdhPayload } from './fdh-core';
import { activeFilterTags, dateBounds, fdhExportFileName, fdhExportSheets, fdhStatusLine, filterArgs, filterOptions, initialFilters, personMatches, fundRowMatches } from './fdh-views';
import { fdhStored } from './fixtures/fdh-stored';

const all = buildCases(fdhStored as FdhPayload);

describe('fdh-views', () => {
  it('builds the status line with REP/STM counts, the งวด and the latest upload in Bangkok time', () => {
    expect(fdhStatusLine(fdhStored)).toBe('ข้อมูล REP 2 ไฟล์ · STM 1 ไฟล์ (งวด 6910_OP_02) · อัปโหลดล่าสุด 18 พ.ย. 2569 11:30');
    expect(fdhStatusLine({ reps: [], stms: [] })).toBe('ข้อมูล REP 0 ไฟล์ · STM 0 ไฟล์');
  });

  it('starts with the data date bounds and does not filter by an unchanged bound', () => {
    const bounds = dateBounds(all);
    expect(bounds).toEqual({ from: '2026-10-01', to: '2026-10-12' });
    const filters = initialFilters(bounds);
    expect(filterArgs(filters, bounds, false)).toMatchObject({ from: '', to: '', periods: [], rights: [], status: '' });
    expect(filterArgs({ ...filters, from: '2026-10-05', status: 'error', fixedC: true }, bounds, false)).toMatchObject({ from: '2026-10-05', to: '', status: 'error', fixedC: true });
    expect(filterArgs({ ...filters, status: 'error', fixedC: true }, bounds, true)).toMatchObject({ status: '', fixedC: false });
    expect(activeFilterTags(filters, bounds)).toEqual([]);
    expect(activeFilterTags({ ...filters, from: '2026-10-05', period: '6910_OP_02', right: 'UCS', subFund: 'TELEMED', status: 'error', errorCode: '237', fixedC: true, q: 'H1' }, bounds))
      .toEqual(['5 ต.ค. 2569 – 12 ต.ค. 2569', 'งวด 6910_OP_02', 'สิทธิ UCS', 'TELEMED', 'ติด C / DENY', 'Error 237', 'แก้ไขแล้ว ผ่านแล้ว', 'ค้นหา "H1"']);
  });

  it('lists the filter choices with counts: งวด newest first, สิทธิ and กองทุนย่อย by count', () => {
    expect(filterOptions(all)).toEqual({
      periods: [['6910_OP_02', 2]],
      rights: [['UCS', 3], ['OFC', 1]],
      subs: [['TELEMED', 2], ['ไม่ระบุ', 1], ['HERB_FS', 1]]
    });
  });

  it('matches people and fund rows by HN, name, PID (and VN)', () => {
    const people = byPersonFund(all);
    expect(people.filter((p) => personMatches(p, 'สมหญิง')).map((p) => p.key).sort()).toEqual(['H2|TELEMED', 'H2|ไม่ระบุ']);
    expect(people.filter((p) => personMatches(p, '3100000000001')).map((p) => p.hn)).toEqual(['H1', 'H1']);
    expect(people.filter((p) => personMatches(p, '')).length).toBe(people.length);
    const rows = byFundVisit(all).find((g) => g.subFund === 'TELEMED')!.rows;
    expect(rows.filter((row) => fundRowMatches(row, 'd')).map((row) => row.case.seq)).toEqual(['D']);
  });

  it('builds the export sheets with the legacy sheet and column names', () => {
    const view = filterCases(all, {});
    const sheets = fdhExportSheets({ view, base: all, people: byPersonFund(all), funds: byFundVisit(all) });
    expect(Object.keys(sheets)).toEqual(['รายเคส', 'รายกองทุนย่อย', 'รายบุคคลแยกกองทุน', 'รายกองทุน-HN-VN', 'แยกกองทุนต่อ VN']);
    const d = sheets['รายเคส'].find((row) => row.VN === 'D')!;
    expect(Object.keys(d)).toEqual(['สถานะ', 'วันรับบริการ', 'VN', 'เคยติด C แก้แล้ว', 'TRAN_ID', 'HN', 'PID', 'ชื่อ - สกุล', 'สิทธิหลัก', 'กองทุนย่อย', 'เรียกเก็บ', 'ชดเชยตาม REP', 'ได้รับตาม STM', 'ส่วนต่าง', 'Error Code', 'REP No.', 'ส่ง REP (ครั้ง)', 'งวด STM']);
    expect(d).toMatchObject({ 'สถานะ': 'ได้รับเงินแล้ว', 'เคยติด C แก้แล้ว': 'ใช่', 'REP No.': '691000009', 'ส่ง REP (ครั้ง)': 2, 'งวด STM': '6910_OP_02' });
    expect(Object.keys(sheets['รายกองทุนย่อย'][0]!)).toEqual(['กองทุนย่อย', 'เคส', 'เรียกเก็บ', 'ชดเชยตาม REP', 'ได้รับตาม STM', 'รอ STM', 'ติด C (เคส)', '% ได้รับ']);
    expect(Object.keys(sheets['รายบุคคลแยกกองทุน'][0]!)).toEqual(['HN', 'PID', 'ชื่อ - สกุล', 'สิทธิล่าสุด', 'กองทุนย่อย (REP)', 'จำนวนครั้ง', 'visit ที่เบิกร่วมกองทุนอื่น', 'เรียกเก็บ', 'ชดเชยตาม REP', 'ได้รับ STM กองทุนนี้', 'ยอดรวมกับกองทุนอื่น', 'รอ STM (ครั้ง)', 'VN']);
    expect(Object.keys(sheets['รายกองทุน-HN-VN'][0]!)).toEqual(['กองทุนย่อย (REP)', 'HN', 'ชื่อ - สกุล', 'VN', 'วันรับบริการ', 'สถานะ', 'กองทุนย่อยใน VN', 'ชดเชยตาม REP (ทั้ง VN)', 'ได้รับ STM กองทุนนี้', 'ยอดรวมกับกองทุนอื่น', 'งวด STM']);
    expect(sheets['แยกกองทุนต่อ VN'].map((row) => row.VN)).toEqual(['D', 'A']);
    expect(Object.keys(sheets['แยกกองทุนต่อ VN'][0]!)).toEqual(['VN', 'วันรับบริการ', 'HN', 'ชื่อ - สกุล', 'กองทุนย่อย (REP)', 'แยกได้', 'คอลัมน์ STM', 'ได้รับ']);
  });

  it('names the file fdh-monitor-YYYYMMDD.xlsx', () => {
    expect(fdhExportFileName(new Date(2026, 10, 8))).toBe('fdh-monitor-20261108.xlsx');
  });
});
