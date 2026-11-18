import { describe, expect, it } from 'vitest';
import { mappingCsv } from './mapping-csv';

describe('mappingCsv', () => {
  it('writes one row per สิทธิ with codes, names and the last stamp, BOM first', () => {
    const csv = mappingCsv([
      { code: '89', name: 'UC, ในเขต', opd: { code: 'P1', name: 'ลูกหนี้ UC-OP', modifiedAt: '2026-11-01 09:00:00' }, ipd: null },
      { code: '34', name: '=SUM(A1)', opd: null, ipd: { code: 'GONE', name: null, modifiedAt: null } }
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'รหัสสิทธิ,สิทธิการรักษา,รหัสผังบัญชี OPD,ผังบัญชี OPD,แก้ไข OPD ล่าสุด,รหัสผังบัญชี IPD,ผังบัญชี IPD,แก้ไข IPD ล่าสุด',
      '89,"UC, ในเขต",P1,ลูกหนี้ UC-OP,2026-11-01 09:00:00,,,',
      `34,"'=SUM(A1)",,,,GONE,,`,
      ''
    ]);
  });
});
