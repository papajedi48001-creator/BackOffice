/**
 * Reads an OFC REP (eclaim OPCS: Detail, Data Instrument) or Statement (STM … OP: พึงรับ) in the browser with SheetJS, loaded
 * only when a file is picked. Only those sheets are sent; a 13-digit national ID is blanked before it leaves the browser and
 * empty cells at the end of rows are dropped.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { excelCell } from './nhso-upload';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
/** `problem` is set, with no sheets, for a file that is skipped. */
export type OfcSheetFile = { name: string; sheets: Record<string, NhsoCell[][]>; problem?: string };

export const OFC_ACCEPT = '.xls,.xlsx';
const WANTED = new Set(['Detail', 'Data Instrument', 'พึงรับ']);
const NATIONAL_ID = /^\d{13}$/;
const cellOf = (value: unknown): NhsoCell => {
  const cell = excelCell(value);
  return cell !== null && NATIONAL_ID.test(String(cell)) ? null : cell;
};
const trimRow = (row: NhsoCell[]) => {
  let n = row.length;
  while (n && (row[n - 1] === null || row[n - 1] === '')) n--;
  return row.slice(0, n);
};

export async function readOfcFile(file: Picked): Promise<OfcSheetFile> {
  const XLSX = await import('@e965/xlsx');
  const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true, codepage: 65001 });
  const sheets: Record<string, NhsoCell[][]> = {};
  for (const name of book.SheetNames) {
    if (!WANTED.has(name.trim())) continue;
    sheets[name.trim()] = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, defval: null, raw: true }).map((row) => trimRow((row ?? []).map(cellOf)));
  }
  if (!Object.keys(sheets).length) return { name: file.name, sheets: {}, problem: 'ไฟล์นี้ไม่ใช่ REP หรือ Statement ของ OFC' };
  return { name: file.name, sheets };
}
