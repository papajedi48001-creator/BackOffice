import { labDateSchema } from '@backoffice/contracts';
import { parseCsvRecords } from '../hr/csv';

const BOM = '﻿';
export const ITEM_CSV_HEADER = ['รหัส', 'ชื่อ', 'หน่วยรับ', 'หน่วยใช้', 'อัตราแปลง', 'จุดสั่งซื้อคลังหลัก'] as const;
export const OPENING_CSV_HEADER = ['คลัง', 'รหัสวัสดุ', 'เลขล็อต', 'วันหมดอายุ', 'จำนวนหน่วยใช้', 'ต้นทุนต่อหน่วยใช้'] as const;
/** The คลัง cell that names คลังหลัก; any other value is a งาน code. */
export const MAIN_STORE_CODE = 'คลังหลัก';

export type CsvError = { row: number; message: string };
export type ItemCsvRow = { code: string; name: string; receiveUnit: string; useUnit: string; unitsPerReceive: number; mainReorderPoint: number };
export type OpeningCsvRow = { row: number; storeId: string; itemId: string; lotNo: string; expiryDate: string | null; quantity: number; unitCost: number };
export type CsvResult<T> = { ok: true; rows: T[] } | { ok: false; errors: CsvError[] };

/** Templates open in Excel with Thai intact: UTF-8 with a byte-order mark and CRLF lines. */
export const itemTemplateCsv = () => `${BOM}${ITEM_CSV_HEADER.join(',')}\r\n`;
export const openingTemplateCsv = () => `${BOM}${OPENING_CSV_HEADER.join(',')}\r\n`;

const wholeNumber = (value: string, min: number) => (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= 1_000_000 ? Number(value) : null);

/** `YYYY-MM-DD`, or `DD/MM/YYYY` in ค.ศ. or พ.ศ. (a year above 2400 is พ.ศ.). */
export function parseCsvDate(value: string): string | null {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = slash ? `${Number(slash[3]) > 2400 ? Number(slash[3]) - 543 : slash[3]}-${slash[2]!.padStart(2, '0')}-${slash[1]!.padStart(2, '0')}` : value;
  return labDateSchema.safeParse(iso).success ? iso : null;
}

function read(text: string, header: readonly string[]): { errors: CsvError[]; records: { row: number; cells: string[] }[] } {
  let records;
  try { records = parseCsvRecords(text); } catch { return { errors: [{ row: 1, message: 'ไฟล์ CSV ไม่ถูกต้อง' }], records: [] }; }
  const first = records[0];
  if (!first || first.cells.map((cell) => cell.trim()).join(',') !== header.join(',')) return { errors: [{ row: 1, message: `หัวตารางต้องเป็น ${header.join(',')}` }], records: [] };
  return { errors: [], records: records.slice(1).map((record) => ({ row: record.line, cells: record.cells.map((cell) => cell.trim()) })).filter((record) => record.cells.some(Boolean)) };
}

export function parseItemCsv(text: string): CsvResult<ItemCsvRow> {
  const { errors, records } = read(text, ITEM_CSV_HEADER);
  const rows: ItemCsvRow[] = [];
  const seen = new Set<string>();
  for (const { row, cells } of records) {
    const [code = '', name = '', receiveUnit = '', useUnit = '', factor = '', reorder = ''] = cells;
    const unitsPerReceive = wholeNumber(factor, 1);
    const mainReorderPoint = reorder === '' ? 0 : wholeNumber(reorder, 0);
    const problem = !/^[A-Za-z0-9-]{1,30}$/.test(code) ? 'รหัสต้องเป็นตัวอักษรอังกฤษ ตัวเลข หรือ - ไม่เกิน 30 ตัว'
      : !name || name.length > 200 ? 'ชื่อต้องมี 1–200 ตัวอักษร'
      : !receiveUnit || !useUnit || receiveUnit.length > 30 || useUnit.length > 30 ? 'หน่วยรับและหน่วยใช้ต้องมี 1–30 ตัวอักษร'
      : unitsPerReceive === null ? 'อัตราแปลงต้องเป็นจำนวนเต็มตั้งแต่ 1'
      : mainReorderPoint === null ? 'จุดสั่งซื้อต้องเป็นจำนวนเต็มตั้งแต่ 0'
      : seen.has(code.toUpperCase()) ? 'รหัสซ้ำในไฟล์' : null;
    if (problem) { errors.push({ row, message: problem }); continue; }
    seen.add(code.toUpperCase());
    rows.push({ code, name, receiveUnit, useUnit, unitsPerReceive: unitsPerReceive!, mainReorderPoint: mainReorderPoint! });
  }
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}

export function parseOpeningCsv(text: string, lookup: { storeIdByCode(code: string): string | null; itemIdByCode(code: string): string | null }): CsvResult<OpeningCsvRow> {
  const { errors, records } = read(text, OPENING_CSV_HEADER);
  const rows: OpeningCsvRow[] = [];
  const seen = new Set<string>();
  for (const { row, cells } of records) {
    const [store = '', item = '', lotNo = '', expiry = '', quantityText = '', costText = ''] = cells;
    const storeId = lookup.storeIdByCode(store);
    const itemId = lookup.itemIdByCode(item);
    const expiryDate = expiry === '' ? null : parseCsvDate(expiry);
    const quantity = wholeNumber(quantityText, 1);
    const unitCost = /^\d+(\.\d{1,4})?$/.test(costText) ? Number(costText) : null;
    const key = `${storeId}|${itemId}|${lotNo}|${expiryDate}`;
    const problem = !storeId ? `ไม่พบคลัง "${store}" (ใช้ ${MAIN_STORE_CODE} หรือรหัสงาน)`
      : !itemId ? `ไม่พบรหัสวัสดุ "${item}"`
      : !lotNo || lotNo.length > 60 ? 'เลขล็อตต้องมี 1–60 ตัวอักษร'
      : expiry !== '' && !expiryDate ? 'วันหมดอายุต้องเป็น YYYY-MM-DD หรือ วว/ดด/ปปปป'
      : quantity === null ? 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1'
      : unitCost === null ? 'ต้นทุนต่อหน่วยใช้ต้องเป็นตัวเลข ทศนิยมไม่เกิน 4 ตำแหน่ง'
      : seen.has(key) ? 'ล็อตนี้ซ้ำในไฟล์' : null;
    if (problem) { errors.push({ row, message: problem }); continue; }
    seen.add(key);
    rows.push({ row, storeId: storeId!, itemId: itemId!, lotNo, expiryDate, quantity: quantity!, unitCost: unitCost! });
  }
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}
