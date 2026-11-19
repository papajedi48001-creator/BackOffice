// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { imcParts, imcUploadLine, readImcFile } from './imc-sheet';

const file = (name: string, data: Uint8Array) => ({ name, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
const tis620 = (text: string) => Uint8Array.from([...text].map((c) => { const code = c.codePointAt(0)!; return code >= 0x0e01 && code <= 0x0e5b ? code - 0x0e00 + 0xa0 : code; }));
const REGISTER = ['ชื่อ', 'นามสกุล', 'HN', 'วันที่ครบกำหนดการให้บริการ', 'วันที่ให้บริการ', 'รหัสบริการ', 'รวมราคาที่ขอเบิก'];
const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'REP_individual');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
};

describe('readImcFile', () => {
  it('reads the TIS-620 register CSV with its one header row', async () => {
    const text = [REGISTER.join(','), 'ก,ข,1,4/4/2569,27/10/2568,H9339.1,450', ',,,,,,'].join('\r\n');
    expect(await readImcFile(file('ทะเบียน IMC.csv', tis620(text)))).toEqual({ name: 'ทะเบียน IMC.csv', kind: 'register', head: [REGISTER], data: [['ก', 'ข', '1', '4/4/2569', '27/10/2568', 'H9339.1', '450']] });
  });

  it('reads the REP sheet with its two header rows below the report lines', async () => {
    const rows = [[null, 'รายงาน : ', 'REP แบบ INDIVIDUAL'], [], ['ลำดับที่', 'REP No.', 'Trans ID', 'ชดเชย'], [null, null, null, 'ชดเชย'], ['1', 'DDSA1', '69', 450]];
    expect(await readImcFile(file('REP.xlsx', workbook(rows)))).toEqual({ name: 'REP.xlsx', kind: 'rep', head: [['ลำดับที่', 'REP No.', 'Trans ID', 'ชดเชย'], [null, null, null, 'ชดเชย']], data: [['1', 'DDSA1', '69', 450]] });
  });

  it('says the IMC service file is not needed, and refuses other files', async () => {
    const service = new TextEncoder().encode('รหัสบัตรประชาชน,ชื่อ,นามสกุล,วันที่รับบริการ,รหัสบริการ,ชื่อบริการ,จำนวนเงิน\r\n1,ก,ข,1/1/2569,H9340,x,200');
    expect(await readImcFile(file('บริการ.csv', service))).toEqual({ name: 'บริการ.csv', kind: null, head: [], data: [], problem: 'ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว' });
    expect(await readImcFile(file('a.csv', new TextEncoder().encode('a,b\r\n1,2')))).toMatchObject({ kind: null, problem: 'ไม่ใช่ไฟล์ทะเบียนคนไข้ IMC หรือ REP individual' });
    expect(await readImcFile(file('a.pdf', new Uint8Array()))).toMatchObject({ kind: null, problem: 'รับเฉพาะไฟล์ .csv .xls .xlsx' });
  });
});

describe('imcParts and imcUploadLine', () => {
  it('puts the header rows before each run of at most 1,500 rows', () => {
    const parts = imcParts([['h1'], ['h2']], Array.from({ length: 1501 }, (_, i) => [i]));
    expect(parts.map((part) => part.length)).toEqual([1502, 3]);
    expect(parts[1]).toEqual([['h1'], ['h2'], [1500]]);
  });
  it('sums the answers of every part into one line', () => {
    expect(imcUploadLine('ทะเบียน.csv', 'register', { rows: 837, added: 800, updated: 37, skipped: 2 })).toBe('✓ ทะเบียน.csv (ทะเบียนคนไข้ IMC): 837 แถว · ใหม่ 800 · แทนที่ของเดิม 37 · ข้าม 2 แถว');
    expect(imcUploadLine('REP.xlsx', 'rep', { rows: 64, added: 64, updated: 0, skipped: 0 })).toBe('✓ REP.xlsx (REP): 64 แถว · ใหม่ 64 · แทนที่ของเดิม 0');
  });
});
