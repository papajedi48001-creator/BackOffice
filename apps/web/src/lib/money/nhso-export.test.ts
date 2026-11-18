// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { expect, it } from 'vitest';
import { nhsoReportFileName, nhsoReportWorkbook } from './nhso-export';

it('puts each report tab on its own sheet with the columns in order and blanks for missing cells', () => {
  const book = nhsoReportWorkbook(XLSX, { 'สรุป': { columns: ['ไฟล์', 'จำนวนแถว'], rows: [{ 'ไฟล์': 'ก', 'จำนวนแถว': 2, _odd: [] }] }, 'เทียบยอด คงเหลือ ที่ยาวมากเกินสามสิบเอ็ดตัวอักษร': { columns: ['key'], rows: [{}] } });
  expect(book.SheetNames).toEqual(['สรุป', 'เทียบยอด คงเหลือ ที่ยาวมากเกินสามสิบเอ็ดตัวอักษร'.slice(0, 31)]);
  expect(XLSX.utils.sheet_to_json(book.Sheets['สรุป']!, { header: 1 })).toEqual([['ไฟล์', 'จำนวนแถว'], ['ก', 2]]);
});

it('names the file with the date and time', () => {
  expect(nhsoReportFileName(new Date(2026, 10, 18, 9, 5))).toBe('NHSO_transfer_report_20261118_0905.xlsx');
});
