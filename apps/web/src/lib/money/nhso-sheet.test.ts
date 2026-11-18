// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { readNhsoFile } from './nhso-sheet';

const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), 'Sheet1');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['อื่น']]), 'Sheet2');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};
const file = (name: string, data: ArrayBuffer | Uint8Array) => ({ name, arrayBuffer: async () => (data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data) as ArrayBuffer });

describe('readNhsoFile', () => {
  it('reads the first sheet as rows, with date cells as dd/mm/yyyy พ.ศ. and blanks as null', async () => {
    const result = await readNhsoFile(file('a.xlsx', workbook([['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ'], ['วันที่โอน', 'กองทุน', 'คงเหลือ'], [new Date(2026, 8, 25), 'ก', 1.5]])));
    expect(result).toEqual([{ name: 'a.xlsx', aoa: [['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ', null, null], ['วันที่โอน', 'กองทุน', 'คงเหลือ'], ['25/09/2569', 'ก', 1.5]] }]);
  });

  it('reads a UTF-8 .csv with Thai text, as the legacy page did with codepage 65001', async () => {
    const csv = new TextEncoder().encode('หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ\nวันที่โอน,กองทุน,คงเหลือ\n');
    expect((await readNhsoFile(file('a.csv', csv)))[0]!.aoa[0]![0]).toBe('หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ');
  });

  it('opens a .zip and reads each Excel file inside, skipping temp and Mac files', async () => {
    const zip = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(zip, 'folder/one.xlsx', new Uint8Array(workbook([['x', 'y', 'z']])));
    XLSX.CFB.utils.cfb_add(zip, 'folder/~$one.xlsx', new Uint8Array([1]));
    XLSX.CFB.utils.cfb_add(zip, '__MACOSX/folder/._one.xlsx', new Uint8Array([1]));
    XLSX.CFB.utils.cfb_add(zip, 'folder/readme.txt', new Uint8Array([1]));
    const data = XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' }) as Uint8Array;
    const result = await readNhsoFile(file('all.zip', new Uint8Array(data)));
    expect(result).toEqual([{ name: 'one.xlsx', aoa: [['x', 'y', 'z']] }]);
  });
});
