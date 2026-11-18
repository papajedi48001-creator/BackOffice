import { describe, expect, it } from 'vitest';
import { dentalCsv } from './dental-csv';
import type { DentalRow } from './dental-summary';

const row: DentalRow = { vn: '681002080001', vstdate: '2026-11-03', hn: '000123', patientName: 'นาย "ทดสอบ", ใจดี', diagCode: 'K021', diagName: 'ฟันผุที่เนื้อฟัน', doctorName: 'ทพ.สมหมาย', helperName: 'นางสาวช่วย', isDenture: false, pttypeCode: '89', pttypeName: 'บัตรทอง', paccountName: null, totalAmount: 1200.5, paidMoney: 0, claimAmount: 1200.5 };

describe('dentalCsv', () => {
  it('starts with a BOM and the legacy header', () => {
    const csv = dentalCsv([]);
    expect(csv.startsWith('﻿VN,วันที่รับบริการ,HN,ชื่อ-สกุล,Diag หลัก,ชื่อโรค,ทันตแพทย์,ผู้ช่วย,รหัสสิทธิ,ชื่อสิทธิ,ผังบัญชี,ค่ารักษารวม,ชำระแล้ว,ลูกหนี้ (ค่ารักษารวม-ชำระแล้ว)\r\n')).toBe(true);
  });
  it('writes one line per row and quotes commas and quotes', () => {
    const lines = dentalCsv([row]).replace('﻿', '').trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('681002080001,2026-11-03,000123,"นาย ""ทดสอบ"", ใจดี",K021,ฟันผุที่เนื้อฟัน,ทพ.สมหมาย,นางสาวช่วย,89,บัตรทอง,,1200.5,0,1200.5');
  });
  it('neutralises a cell that Excel would run as a formula', () => {
    const lines = dentalCsv([{ ...row, patientName: '=HYPERLINK("x")' }]).trimEnd().split('\r\n');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
