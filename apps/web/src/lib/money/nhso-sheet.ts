/**
 * Reads NHSO report files in the browser with SheetJS (loaded only when a file is picked): the first sheet of each workbook as
 * rows of cells, and every Excel file inside a .zip, as the legacy upload page did.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { excelFilesInZip } from './excel-zip';
import { excelCell, NHSO_MAX_FILE_BYTES } from './nhso-upload';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
/** `problem` is set, with an empty table, for a file inside a .zip that was skipped. */
export type NhsoSheet = { name: string; aoa: NhsoCell[][]; problem?: string };

const INSIDE_ZIP = /\.(xlsx|xlsm|xls|csv)$/i;

export async function readNhsoFile(file: Picked): Promise<NhsoSheet[]> {
  const XLSX = await import('@e965/xlsx');
  const data = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    const sheets: NhsoSheet[] = [];
    for (const { name, bytes } of await excelFilesInZip(data, INSIDE_ZIP)) {
      if (bytes.length > NHSO_MAX_FILE_BYTES) { sheets.push({ name, aoa: [], problem: 'ไฟล์ใหญ่เกิน 10 MB' }); continue; }
      sheets.push(...await readNhsoFile({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }));
    }
    return sheets;
  }
  const book = XLSX.read(data, { type: 'array', cellDates: true, codepage: 65001 });
  const sheet = book.Sheets[book.SheetNames[0]!];
  const rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) : [];
  return [{ name: file.name, aoa: rows.map((row) => (row ?? []).map(excelCell)) }];
}
