// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { readFdhFile } from './fdh-sheet';

const workbook = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};
const file = (name: string, data: ArrayBuffer | Uint8Array) => ({ name, arrayBuffer: async () => (data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data) as ArrayBuffer });
const zipOf = (entries: Record<string, Uint8Array>) => {
  const zip = XLSX.CFB.utils.cfb_new();
  for (const [path, bytes] of Object.entries(entries)) XLSX.CFB.utils.cfb_add(zip, path, bytes);
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' }) as Uint8Array);
};

describe('readFdhFile', () => {
  it('keeps only the REP/STM sheets, with Excel dates as dd/mm/yyyy พ.ศ. and empty cells at the end of rows removed', async () => {
    const data = workbook({ Detail: [['REP No.', 'TRAN_ID', null, ''], [new Date(2026, 9, 28), 905, 'x', null]], Summary: [['skip']], 'Data DENY': [['a']], ' รายงานสรุป OP': [['งวด']], ' รายละเอียด(ข้อมูลปกติ) 1 OP': [['REP']] });
    expect(await readFdhFile(file('eclaim_11093_OP_1.xls', data))).toEqual([{ name: 'eclaim_11093_OP_1.xls', sheets: {
      Detail: [['REP No.', 'TRAN_ID'], ['28/10/2569', 905, 'x']], 'Data DENY': [['a']], ' รายงานสรุป OP': [['งวด']], ' รายละเอียด(ข้อมูลปกติ) 1 OP': [['REP']]
    } }]);
  });

  it('says a workbook without REP/STM sheets is not REP or STM, as the legacy page did', async () => {
    expect(await readFdhFile(file('other.xlsx', workbook({ Sheet1: [['x']] })))).toEqual([{ name: 'other.xlsx', sheets: {}, problem: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' }]);
  });

  it('opens a .zip and reads each .xls/.xlsx inside, skipping other and temp files, and reports one over 10 MB', async () => {
    const zip = zipOf({ 'oct/a.xlsx': new Uint8Array(workbook({ Detail: [['REP No.']] })), 'oct/~$a.xlsx': new Uint8Array([1]), 'oct/b.csv': new Uint8Array([1]), 'oct/big.xls': new Uint8Array(10 * 1024 * 1024 + 1) });
    expect(await readFdhFile(file('oct.zip', zip))).toEqual([{ name: 'a.xlsx', sheets: { Detail: [['REP No.']] } }, { name: 'big.xls', sheets: {}, problem: 'ไฟล์ใหญ่เกิน 10 MB' }]);
  });
});
