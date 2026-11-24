// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { readOfcFile } from './ofc-sheet';

const workbook = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};
const file = (name: string, data: ArrayBuffer) => ({ name, arrayBuffer: async () => data });

describe('readOfcFile', () => {
  it('keeps only Detail, Data Instrument and พึงรับ, blanks national IDs, and trims empty cells at the end of rows', async () => {
    const data = workbook({ Detail: [['REP', 'TRAN_ID', 'PID', null], ['691000117', '9001', '1111111111111', ''], ['691000117', '9002', 2222222222222]], Summary: [['skip']], 'Data Instrument': [['TRAN_ID']], 'Data Drug': [['x']] });
    expect(await readOfcFile(file('eclaim.xls', data))).toEqual({ name: 'eclaim.xls', sheets: { Detail: [['REP', 'TRAN_ID', 'PID'], ['691000117', '9001'], ['691000117', '9002']], 'Data Instrument': [['TRAN_ID']] } });
    expect(await readOfcFile(file('STM.xls', workbook({ 'พึงรับ': [['เลขที่เอกสาร 11093_OP202609_02']], 'สรุป(พึงรับ)': [['งวด']] })))).toEqual({ name: 'STM.xls', sheets: { 'พึงรับ': [['เลขที่เอกสาร 11093_OP202609_02']] } });
  });

  it('says a workbook without those sheets is not an OFC REP or Statement', async () => {
    expect(await readOfcFile(file('other.xlsx', workbook({ Sheet1: [['x']] })))).toEqual({ name: 'other.xlsx', sheets: {}, problem: 'ไฟล์นี้ไม่ใช่ REP หรือ Statement ของ OFC' });
  });
});
