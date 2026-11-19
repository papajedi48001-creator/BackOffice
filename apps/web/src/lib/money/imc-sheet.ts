/**
 * Monitor IMC upload in the browser: the ทะเบียนคนไข้ IMC CSV (TIS-620 or UTF-8) or the REP individual Excel from สปสช. The
 * header is found by column title in the first 15 rows (the REP sheet has a second header row under it), and the rows go up in
 * parts of 1,500 with the header rows in front of each.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { decode, dpCell, trimRow } from './dp-sheet';

type Picked = { name: string; arrayBuffer(): Promise<ArrayBuffer> };
export type ImcKind = 'register' | 'rep';
/** `problem` is set, with `kind` null and no rows, for a file that is skipped. */
export type ImcSheetFile = { name: string; kind: ImcKind | null; head: NhsoCell[][]; data: NhsoCell[][]; problem?: string };
export type ImcSum = { rows: number; added: number; updated: number; skipped: number };

export const IMC_ACCEPT = '.csv,.xls,.xlsx';
export const IMC_PART_ROWS = 1500;
const MAX_FILE = 50 * 1024 * 1024;
const SCAN = 15;
const KIND_NAME: Record<ImcKind, string> = { register: 'ทะเบียนคนไข้ IMC', rep: 'REP' };
const int = (n: number) => n.toLocaleString('en-US');
const titles = (row: NhsoCell[]) => row.map((value) => String(value ?? '').replaceAll('\uFEFF', '').replace(/\s+/g, ' ').trim());
const blank = (row: NhsoCell[]) => row.every((value) => value === null || value === '');
const skip = (name: string, problem: string): ImcSheetFile => ({ name, kind: null, head: [], data: [], problem });

export async function readImcFile(file: Picked & { size?: number }): Promise<ImcSheetFile> {
  if (!/\.(csv|xls|xlsx)$/i.test(file.name)) return skip(file.name, 'รับเฉพาะไฟล์ .csv .xls .xlsx');
  if ((file.size ?? 0) > MAX_FILE) return skip(file.name, 'ไฟล์ใหญ่เกิน 50 MB');
  const XLSX = await import('@e965/xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const book = /\.csv$/i.test(file.name)
    ? XLSX.read(decode(bytes).replace(/^\uFEFF/, ''), { type: 'string', raw: true })
    : XLSX.read(bytes, { type: 'array', cellDates: true });
  let service = false;
  for (const sheetName of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName]!, { header: 1, defval: null, raw: true }).map((row) => trimRow((row ?? []).map(dpCell)));
    for (let at = 0; at < Math.min(rows.length, SCAN); at++) {
      const names = titles(rows[at]!);
      const kind: ImcKind | null = names.includes('วันที่ครบกำหนดการให้บริการ') && names.includes('วันที่ให้บริการ') ? 'register'
        : names.includes('REP No.') && names.includes('Trans ID') ? 'rep' : null;
      if (names.includes('วันที่รับบริการ') && names.includes('จำนวนเงิน') && names.includes('รหัสบริการ')) service = true;
      if (!kind) continue;
      const headRows = kind === 'rep' ? 2 : 1;
      const data = rows.slice(at + headRows).filter((row) => !blank(row));
      if (!data.length) return skip(file.name, 'ไม่มีแถวข้อมูล');
      return { name: file.name, kind, head: rows.slice(at, at + headRows), data };
    }
  }
  return skip(file.name, service ? 'ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว' : 'ไม่ใช่ไฟล์ทะเบียนคนไข้ IMC หรือ REP individual');
}

/** The header rows with each run of at most 1,500 data rows. */
export function imcParts(head: NhsoCell[][], data: NhsoCell[][]): NhsoCell[][][] {
  const parts: NhsoCell[][][] = [];
  for (let at = 0; at < data.length; at += IMC_PART_ROWS) parts.push([...head, ...data.slice(at, at + IMC_PART_ROWS)]);
  return parts;
}

/** "✓ ไฟล์ (ทะเบียนคนไข้ IMC): N แถว · ใหม่ a · แทนที่ของเดิม u[ · ข้าม s แถว]". */
export function imcUploadLine(fileName: string, kind: ImcKind, sum: ImcSum): string {
  return `✓ ${fileName} (${KIND_NAME[kind]}): ${int(sum.rows)} แถว · ใหม่ ${int(sum.added)} · แทนที่ของเดิม ${int(sum.updated)}${sum.skipped ? ` · ข้าม ${int(sum.skipped)} แถว` : ''}`;
}
