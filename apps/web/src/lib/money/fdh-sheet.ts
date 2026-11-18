/**
 * Reads FDH REP/STM workbooks in the browser with SheetJS (loaded only when a file is picked): only the sheets the parsers use
 * (REP: Detail, Data DENY, Data Drug; STM: รายงานสรุป…, รายละเอียด…), Excel dates as dd/mm/yyyy พ.ศ., empty cells at the end
 * of each row removed to keep the upload small; every .xls/.xlsx inside a .zip; as the legacy upload page did.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { excelFilesInZip } from './excel-zip';
import { FDH_MAX_FILE_BYTES } from './fdh-upload';
import { excelCell } from './nhso-upload';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
/** `problem` is set, with no sheets, for a file that is skipped. */
export type FdhSheetFile = { name: string; sheets: Record<string, NhsoCell[][]>; problem?: string };

const WANTED = (name: string) => {
  const n = name.trim();
  return n === 'Detail' || n === 'Data DENY' || n === 'Data Drug' || n.startsWith('รายงานสรุป') || n.startsWith('รายละเอียด');
};
const trimRow = (row: NhsoCell[]) => {
  let n = row.length;
  while (n && (row[n - 1] === null || row[n - 1] === '')) n--;
  return row.slice(0, n);
};

export async function readFdhFile(file: Picked): Promise<FdhSheetFile[]> {
  const XLSX = await import('@e965/xlsx');
  const data = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    const files: FdhSheetFile[] = [];
    for (const { name, bytes } of await excelFilesInZip(data, /\.(xlsx|xls)$/i)) {
      if (bytes.length > FDH_MAX_FILE_BYTES) { files.push({ name, sheets: {}, problem: 'ไฟล์ใหญ่เกิน 10 MB' }); continue; }
      files.push(...await readFdhFile({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }));
    }
    return files;
  }
  const book = XLSX.read(data, { type: 'array', cellDates: true, codepage: 65001 });
  const sheets: Record<string, NhsoCell[][]> = {};
  for (const name of book.SheetNames) {
    if (!WANTED(name)) continue;
    sheets[name] = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, defval: null, raw: true }).map((row) => trimRow((row ?? []).map(excelCell)));
  }
  if (!Object.keys(sheets).length) return [{ name: file.name, sheets: {}, problem: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' }];
  return [{ name: file.name, sheets }];
}
