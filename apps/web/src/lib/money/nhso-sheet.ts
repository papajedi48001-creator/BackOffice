/**
 * Reads NHSO report files in the browser with SheetJS (loaded only when a file is picked): the first sheet of each workbook as
 * rows of cells, and every Excel file inside a .zip, as the legacy upload page did.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { excelCell } from './nhso-upload';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
export type NhsoSheet = { name: string; aoa: NhsoCell[][] };

const INSIDE_ZIP = /\.(xlsx|xlsm|xls|csv)$/i;
const SKIPPED = /(^|\/)(~\$|__MACOSX\/|\._)/;

export async function readNhsoFile(file: Picked): Promise<NhsoSheet[]> {
  const XLSX = await import('@e965/xlsx');
  const data = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    const zip = XLSX.CFB.read(data, { type: 'array' }) as { FullPaths: string[]; FileIndex: { type: number; content?: ArrayLike<number> }[] };
    const inner = zip.FullPaths.map((path: string, index: number) => [path, zip.FileIndex[index]!] as const)
      .filter(([path, entry]) => entry.type === 2 && entry.content && INSIDE_ZIP.test(path) && !SKIPPED.test(path));
    const sheets: NhsoSheet[] = [];
    for (const [path, entry] of inner) sheets.push(...await readNhsoFile({ name: path.split('/').pop()!, arrayBuffer: async () => new Uint8Array(entry.content as ArrayLike<number>).buffer }));
    return sheets;
  }
  const book = XLSX.read(data, { type: 'array', cellDates: true, codepage: 65001 });
  const sheet = book.Sheets[book.SheetNames[0]!];
  const rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) : [];
  return [{ name: file.name, aoa: rows.map((row) => (row ?? []).map(excelCell)) }];
}
