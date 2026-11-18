// @vitest-environment node
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { addDpAnswer, dpFileProblem, fixZipName, dpParts, dpUploadLine, readDpFile, DP_ACCEPT, DP_PART_ROWS, type DpSum } from './dp-sheet';

const HEADER = ['วันที่รับบริการ', 'ชื่อบริการฟื้นฟู', 'รวมราคาที่ขอเบิก', 'รวมราคาที่พึงเบิกได้', 'เลขที่อ้างอิง', 'รหัสบัตรประชาชน'];
const workbook = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
};
const file = (name: string, data: Uint8Array) => ({ name, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
/** TIS-620: Thai letters U+0E01–U+0E5B are bytes 0xA1–0xFB. */
const tis620 = (text: string) => Uint8Array.from([...text].map((c) => { const code = c.codePointAt(0)!; return code >= 0x0e01 && code <= 0x0e5b ? code - 0x0e00 + 0xa0 : code; }));
const zipOf = (entries: Record<string, Uint8Array>) => {
  const zip = XLSX.CFB.utils.cfb_new();
  for (const [path, bytes] of Object.entries(entries)) XLSX.CFB.utils.cfb_add(zip, path, bytes);
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' }) as Uint8Array);
};
const csv = (rows: string[][]) => rows.map((row) => row.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')).join('\r\n');

describe('readDpFile', () => {
  it('reads a TIS-620 CSV as text, keeping เลขบัตร as written, below a title row', async () => {
    const text = csv([['รายงานบริการฟื้นฟู'], HEADER, ['2/10/2566', 'กายภาพบำบัด', '1,250', '150', '10000001', '0011111111111'], ['', '', '', '', '', '']]);
    expect(await readDpFile(file('ฟื้นฟู.csv', tis620(text)))).toEqual([{ name: 'ฟื้นฟู.csv', header: HEADER, data: [['2/10/2566', 'กายภาพบำบัด', '1,250', '150', '10000001', '0011111111111']] }]);
  });

  it('reads a UTF-8 CSV with a BOM', async () => {
    const bytes = new TextEncoder().encode(`﻿${csv([HEADER, ['2025-01-05', 'จิตบำบัด', '300', '300', 'R1', '1']])}`);
    const [read] = await readDpFile(file('a.csv', bytes));
    expect(read!.header).toEqual(HEADER);
    expect(read!.data).toEqual([['2025-01-05', 'จิตบำบัด', '300', '300', 'R1', '1']]);
  });

  it('reads Excel, finding the sheet with the header and turning date cells into d/m/yyyy พ.ศ.', async () => {
    const data = workbook({ Cover: [['สรุป']], Data: [HEADER, [new Date(2025, 9, 2), 'กายภาพบำบัด', 160, 150, 10000001, null]] });
    expect(await readDpFile(file('a.xlsx', data))).toEqual([{ name: 'a.xlsx', header: HEADER, data: [['2/10/2568', 'กายภาพบำบัด', 160, 150, 10000001]] }]);
  });

  it('says a file without the header is not a DP file, and one with only the header has no rows', async () => {
    expect(await readDpFile(file('x.xlsx', workbook({ Sheet1: [['REP No.']] })))).toEqual([{ name: 'x.xlsx', header: [], data: [], problem: 'ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")' }]);
    expect(await readDpFile(file('y.csv', new TextEncoder().encode(csv([HEADER]))))).toEqual([{ name: 'y.csv', header: [], data: [], problem: 'ไม่มีแถวข้อมูล' }]);
  });

  it('opens a .zip and reads each .csv/.xls/.xlsx inside, skipping temp and other files', async () => {
    const zip = zipOf({ 'd/a.csv': new TextEncoder().encode(csv([HEADER, ['1/10/2568', 'ก', '1', '1', 'R', '']])), 'd/~$a.xlsx': new Uint8Array([1]), 'd/readme.txt': new Uint8Array([1]) });
    const read = await readDpFile(file('d.zip', zip));
    expect(read.map((item) => [item.name, item.data.length])).toEqual([['a.csv', 1]]);
  });

  it('decodes a Thai name that the zip stored as TIS-620 and leaves other names alone', () => {
    expect(fixZipName(String.fromCharCode(...tis620('ฟื้นฟู.csv')))).toBe('ฟื้นฟู.csv');
    expect(fixZipName('ฟื้นฟู.csv')).toBe('ฟื้นฟู.csv');
    expect(fixZipName('a.csv')).toBe('a.csv');
  });
});

describe('dp upload helpers', () => {
  it('accepts .csv .xls .xlsx and .zip and skips temp files', () => {
    expect(DP_ACCEPT).toBe('.csv,.xls,.xlsx,.zip');
    expect(dpFileProblem({ name: '~$a.xlsx', size: 1 })).toBe('ข้ามไฟล์ชั่วคราวของ Excel');
    expect(dpFileProblem({ name: 'a.pdf', size: 1 })).toBe('รับเฉพาะไฟล์ .csv .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)');
    expect(dpFileProblem({ name: 'a.CSV', size: 1 })).toBeNull();
    expect(dpFileProblem({ name: 'a.csv', size: 50 * 1024 * 1024 + 1 })).toBe('ไฟล์ใหญ่เกิน 50 MB');
    expect(dpFileProblem({ name: 'a.zip', size: 200 * 1024 * 1024 + 1 })).toBe('ไฟล์ .zip ใหญ่เกิน 200 MB');
  });

  it('sends the header with at most 1,500 data rows per part', () => {
    const data = Array.from({ length: 3001 }, (_, at) => [String(at)]);
    const parts = dpParts(['h'], data);
    expect(DP_PART_ROWS).toBe(1500);
    expect(parts.map((part) => [part[0], part.length])).toEqual([[['h'], 1501], [['h'], 1501], [['h'], 2]]);
  });

  it('adds the parts and writes the legacy result line', () => {
    let sum: DpSum = { rows: 0, added: 0, updated: 0, skipped: 0, years: {} };
    sum = addDpAnswer(sum, { ok: true, rows: 1500, added: 1400, updated: 100, skipped: 0, years: { 2568: 500, 2569: 1000 } });
    sum = addDpAnswer(sum, { ok: true, rows: 34, added: 34, updated: 0, skipped: 2, years: { 2569: 34 } });
    expect(dpUploadLine('ฟื้นฟู.csv', sum)).toBe('✓ ฟื้นฟู.csv: 1,534 ครั้ง (ปีงบ 2568: 500, ปีงบ 2569: 1,034) · ใหม่ 1,434 · แทนที่ของเดิม 100 · ข้าม 2 แถว (ไม่มีเลขที่อ้างอิง/วันที่)');
    expect(dpUploadLine('a.csv', { rows: 1, added: 1, updated: 0, skipped: 0, years: { 2569: 1 } })).toBe('✓ a.csv: 1 ครั้ง (ปีงบ 2569: 1) · ใหม่ 1 · แทนที่ของเดิม 0');
  });
});
