import { describe, expect, it } from 'vitest';
import { ofcFileKind, parseOfcRep, parseOfcStm } from './ofc-report';

const blank = (n: number) => Array.from({ length: n }, () => '');
const at = (cells: Record<number, string | number>, n = 60) => { const row: (string | number)[] = blank(n); for (const [k, v] of Object.entries(cells)) row[Number(k)] = v; return row; };

// Shaped like eclaim_11093_OPCS_…xls (REP of จ่ายตรง OFC); names and IDs are made up.
const detail = [
  at({ 0: 'ออกรายงานวันที่ 24/11/2569 เวลา 09:29' }),
  at({ 0: 'REP', 1: 'ลำดับที่', 2: 'TRAN_ID', 3: 'HN', 4: 'AN', 5: 'PID', 6: 'ชื่อ - สกุล', 7: 'ประเภทผู้ป่วย', 8: 'วันเข้ารักษา', 10: 'ชดเชยสุทธิ', 12: 'Error Code', 56: 'SEQ NO' }),
  at({ 10: 'ค่ารักษา', 44: 'INSTCS' }),
  at({ 0: '691000117', 1: '1', 2: '900000001', 3: '000000001', 5: '1111111111111', 6: 'นาย ทดสอบ หนึ่ง', 7: 'OP', 8: '20/10/2026 14:50:00', 10: '4,300.00', 12: '-', 56: '691020000309' }),
  at({ 0: '691000117', 1: '2', 2: '900000002', 3: '000000002', 5: '2222222222222', 6: 'นาง ทดสอบ สอง', 7: 'OP', 8: '20/10/2026 14:55:00', 10: '0.00', 12: 'C438', 56: '691020000311' })
];
const instrument = [
  at({ 5: 'รายงานการเบิกจ่ายอวัยวะเทียม และอุปกรณ์บำบัดรักษา' }, 16),
  at({}, 16),
  at({ 0: 'ลำดับที่', 1: 'TRAN_ID', 2: 'HN', 3: 'AN', 4: 'วันเข้ารักษา', 5: 'PID', 6: 'ชื่อ - สกุล', 7: 'ลำดับที่', 8: 'เรียกเก็บ', 12: 'จ่ายชดเชย', 14: 'ปฏิเสธ', 15: 'Error Code' }, 16),
  at({ 8: 'อุปกรณ์', 10: 'จำนวนชิ้น', 11: 'จำนวนเงิน', 12: 'จำนวนชิ้น', 13: 'จำนวนเงิน' }, 16),
  at({ 8: 'รหัส', 9: 'ชื่ออุปกรณ์' }, 16),
  at({ 0: '1', 1: '900000001', 2: '000000001', 4: '20/10/2569', 5: '1111111111111', 6: 'นาย ทดสอบ หนึ่ง', 7: '1', 8: '8610', 9: 'อุปกรณ์พยุงส้นเท้า', 10: '2', 11: '4,000.00', 12: '0', 13: '4,000.00', 14: '-' }, 16),
  at({ 0: '2', 1: '900000002', 2: '000000002', 4: '20/10/2569', 5: '2222222222222', 6: 'นาง ทดสอบ สอง', 7: '1', 8: '8610', 9: 'อุปกรณ์พยุงส้นเท้า', 10: '2', 11: '4,000.00', 12: '0', 13: '0.00', 14: 'Y', 15: 'C438' }, 16),
  at({ 0: '3', 1: '900000099', 2: '000000009', 4: '20/10/2569', 7: '1', 8: '8610', 10: '1', 11: '2,000.00', 13: '2,000.00' }, 16)
];
const rep = { Detail: detail, Summary: [at({ 0: 'งวด' })], 'Data Instrument': instrument, 'Data Drug': [] };

// Shaped like STM_11093_OP202609_02.xls (Statement OFC ผู้ป่วยนอก).
const stmHead = [
  at({ 0: 'REP', 1: 'ลำดับที่', 2: 'HN', 3: 'AN', 4: 'PID', 5: 'ชื่อ - สกุล', 6: 'วันเข้ารักษา', 7: 'วันจำหน่าย', 8: 'PROJCODE', 9: 'AdjRW', 10: 'เรียกเก็บ', 11: 'พรบ.', 12: 'พึงรับ', 19: 'พึงรับทั้งหมด', 20: 'SEQ NO' }, 21),
  at({ 12: 'ค่าห้อง', 13: 'ค่าอวัยวะฯ', 14: 'ค่ายา', 15: 'ค่ารักษา', 16: 'ค่ารถ', 17: 'กรณีพักรอจำหน่าย', 18: 'ค่าบริการอื่นๆ' }, 21)
];
const stm = {
  'พึงรับ': [
    at({ 0: 'ออกรายงานวันที่ 08/10/2569 เวลา 08:31' }, 21), at({ 0: 'เลขที่เอกสาร 11093_OP202609_02' }, 21), at({ 0: 'REP NO : 690900189' }, 21), ...stmHead,
    at({ 0: '690900189', 1: '1', 2: '000000001', 3: '-', 4: '1111111111111', 5: 'นาย ทดสอบ หนึ่ง', 6: '10/09 /2026 13:11:00', 10: '4,300.00', 13: '4,000.00', 15: '300.00', 19: '4,300.00', 20: '690910000158' }, 21),
    at({ 0: 'REP NO : 690900191' }, 21), ...stmHead,
    at({ 0: '690900191', 1: '1', 2: '000000003', 3: '-', 6: '11/09/2026 09:00:00', 10: '350.00', 14: '310.00', 15: '40.00', 19: '350.00', 20: '690911000001' }, 21),
    at({ 1: 'หมายเหตุ', 2: 'PROJCODE : ' }, 21)
  ],
  'สรุป(พึงรับ)': [at({ 0: 'งวด' }, 16)]
};

describe('ofcFileKind', () => {
  it('tells the REP from the Statement by their sheets', () => {
    expect(ofcFileKind(rep)).toBe('rep');
    expect(ofcFileKind(stm)).toBe('stm');
    expect(ofcFileKind({ Sheet1: [['a']] })).toBeNull();
  });
});

describe('parseOfcRep', () => {
  it('reads every Data Instrument line with its REP and SEQ NO (the HOSxP vn) from Detail, and no name or PID', () => {
    const parsed = parseOfcRep(rep);
    expect(parsed).toEqual({ ok: true, skipped: 1, lines: [
      { repNo: '691000117', tranId: '900000001', itemNo: 1, vn: '691020000309', date: '2026-10-20', adp: '8610', itemName: 'อุปกรณ์พยุงส้นเท้า', qty: 2, claim: 4000, paid: 4000, deny: '', error: '' },
      { repNo: '691000117', tranId: '900000002', itemNo: 1, vn: '691020000311', date: '2026-10-20', adp: '8610', itemName: 'อุปกรณ์พยุงส้นเท้า', qty: 2, claim: 4000, paid: 0, deny: 'Y', error: 'C438' }
    ] });
    expect(JSON.stringify(parsed)).not.toMatch(/1111111111111|ทดสอบ/);
  });

  it('refuses a workbook without Detail or Data Instrument', () => {
    expect(parseOfcRep({ Detail: detail })).toMatchObject({ ok: false });
  });
});

describe('parseOfcStm', () => {
  it('reads every row of each REP block with ค่าอวัยวะฯ and พึงรับทั้งหมด by SEQ NO', () => {
    const parsed = parseOfcStm(stm);
    expect(parsed).toEqual({ ok: true, docNo: '11093_OP202609_02', skipped: 0, lines: [
      { docNo: '11093_OP202609_02', repNo: '690900189', vn: '690910000158', date: '2026-09-10', claim: 4300, inst: 4000, total: 4300 },
      { docNo: '11093_OP202609_02', repNo: '690900191', vn: '690911000001', date: '2026-09-11', claim: 350, inst: 0, total: 350 }
    ] });
    expect(JSON.stringify(parsed)).not.toMatch(/1111111111111|ทดสอบ/);
  });

  it('refuses a Statement without its document number', () => {
    expect(parseOfcStm({ 'พึงรับ': stm['พึงรับ'].filter((row) => !String(row[0]).startsWith('เลขที่เอกสาร')) })).toMatchObject({ ok: false });
  });
});
