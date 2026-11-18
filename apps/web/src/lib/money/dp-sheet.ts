/**
 * Point ฟื้นฟูผู้พิการ upload in the browser, as the legacy upload page: CSV from the NHSO program (TIS-620, or UTF-8), Excel with
 * the same header, or a .zip of these (Thai names inside decoded from TIS-620); the header row is found in the first 10 rows of
 * the first sheet that has one, Excel date cells become d/m/yyyy พ.ศ., and the rows go up in parts of 1,500 with the header.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { excelFilesInZip } from './excel-zip';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
/** `problem` is set, with no rows, for a file that is skipped. */
export type DpSheetFile = { name: string; header: NhsoCell[]; data: NhsoCell[][]; problem?: string };
export type DpSum = { rows: number; added: number; updated: number; skipped: number; years: Record<string, number> };
export type DpAnswer = { ok: true; rows: number; added: number; updated: number; skipped: number; years: Record<string, number> };

export const DP_ACCEPT = '.csv,.xls,.xlsx,.zip';
export const DP_PART_ROWS = 1500;
const MAX_FILE = 50 * 1024 * 1024;
const MAX_ZIP = 200 * 1024 * 1024;
const MAX_CELLS = 80;
const NOT_DP = 'ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")';
const int = (n: number) => n.toLocaleString('en-US');

/** Why a picked file is skipped before it is read, or null. */
export function dpFileProblem(file: { name: string; size: number }): string | null {
  if (file.name.startsWith('~$')) return 'ข้ามไฟล์ชั่วคราวของ Excel';
  if (!/\.(csv|xls|xlsx|zip)$/i.test(file.name)) return 'รับเฉพาะไฟล์ .csv .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)';
  if (/\.zip$/i.test(file.name)) return file.size > MAX_ZIP ? 'ไฟล์ .zip ใหญ่เกิน 200 MB' : null;
  return file.size > MAX_FILE ? 'ไฟล์ใหญ่เกิน 50 MB' : null;
}

/** An Excel date → "d/m/yyyy" พ.ศ. like the CSV; text cut at 1,000 characters; anything else blank. */
function dpCell(value: unknown): NhsoCell {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear() + 543}`;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return null;
  return String(value).slice(0, 1000);
}
const blank = (value: NhsoCell) => value === null || value === '';
function trimRow(row: NhsoCell[]): NhsoCell[] {
  let n = Math.min(row.length, MAX_CELLS);
  while (n && blank(row[n - 1]!)) n--;
  return row.slice(0, n);
}
/** CSV from the NHSO program is TIS-620 (windows-874); UTF-8 is read as it is. */
function decode(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-874').decode(bytes); }
}
/** A Thai name inside a .zip made on Windows is TIS-620 without the UTF-8 flag, so it arrives as latin1. */
export const fixZipName = (name: string) => (/[\u0080-ÿ]/.test(name) && !/[฀-๿]/.test(name)
  ? new TextDecoder('windows-874').decode(Uint8Array.from([...name].map((c) => c.charCodeAt(0) & 0xff))) : name);
const isHeader = (row: NhsoCell[]) => row.some((v) => String(v ?? '').trim() === 'เลขที่อ้างอิง') && row.some((v) => String(v ?? '').trim() === 'ชื่อบริการฟื้นฟู');

export async function readDpFile(file: Picked): Promise<DpSheetFile[]> {
  const XLSX = await import('@e965/xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    const files: DpSheetFile[] = [];
    for (const entry of await excelFilesInZip(bytes, /\.(csv|xlsx|xls)$/i)) {
      const name = fixZipName(entry.name);
      if (entry.bytes.length > MAX_FILE) { files.push({ name, header: [], data: [], problem: 'ไฟล์ใหญ่เกิน 50 MB' }); continue; }
      files.push(...await readDpFile({ name, arrayBuffer: async () => entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength) as ArrayBuffer }));
    }
    return files;
  }
  const book = /\.csv$/i.test(file.name)
    ? XLSX.read(decode(bytes).replace(/^\uFEFF/, ''), { type: 'string', raw: true })
    : XLSX.read(bytes, { type: 'array', cellDates: true });
  for (const sheetName of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName]!, { header: 1, defval: null, raw: true }).map((row) => trimRow((row ?? []).map(dpCell)));
    const at = rows.slice(0, 10).findIndex(isHeader);
    if (at < 0) continue;
    const data = rows.slice(at + 1).filter((row) => row.some((v) => !blank(v)));
    if (!data.length) return [{ name: file.name, header: [], data: [], problem: 'ไม่มีแถวข้อมูล' }];
    return [{ name: file.name, header: rows[at]!, data }];
  }
  return [{ name: file.name, header: [], data: [], problem: NOT_DP }];
}

/** The header with each run of at most 1,500 data rows. */
export function dpParts(header: NhsoCell[], data: NhsoCell[][]): NhsoCell[][][] {
  const parts: NhsoCell[][][] = [];
  for (let at = 0; at < data.length; at += DP_PART_ROWS) parts.push([header, ...data.slice(at, at + DP_PART_ROWS)]);
  return parts;
}

export function addDpAnswer(sum: DpSum, answer: DpAnswer): DpSum {
  const years = { ...sum.years };
  for (const [fy, n] of Object.entries(answer.years)) years[fy] = (years[fy] ?? 0) + n;
  return { rows: sum.rows + answer.rows, added: sum.added + answer.added, updated: sum.updated + answer.updated, skipped: sum.skipped + answer.skipped, years };
}

/** "✓ ไฟล์: N ครั้ง (ปีงบ 2569: n) · ใหม่ a · แทนที่ของเดิม u[ · ข้าม s แถว (ไม่มีเลขที่อ้างอิง/วันที่)]". */
export function dpUploadLine(fileName: string, sum: DpSum): string {
  const years = Object.entries(sum.years).map(([fy, n]) => `ปีงบ ${fy}: ${int(n)}`).join(', ');
  return `✓ ${fileName}: ${int(sum.rows)} ครั้ง (${years}) · ใหม่ ${int(sum.added)} · แทนที่ของเดิม ${int(sum.updated)}`
    + (sum.skipped ? ` · ข้าม ${int(sum.skipped)} แถว (ไม่มีเลขที่อ้างอิง/วันที่)` : '');
}
