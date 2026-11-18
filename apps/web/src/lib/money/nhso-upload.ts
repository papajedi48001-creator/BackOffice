/** เงินโอน สปสช. upload: browser-side checks and messages, the same as the legacy upload page. */
import { moneyErrorMessage } from '../money-client';

export const NHSO_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** A whole Google Drive folder as one .zip; each Excel file inside still has the 10 MB limit. */
export const NHSO_MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const NHSO_ACCEPT = '.xlsx,.xls,.xlsm,.csv,.zip';

/** An Excel date cell → "dd/mm/yyyy" พ.ศ., like the date text in the NHSO report; blanks become null. */
export function excelCell(value: unknown): string | number | boolean | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(value.getDate())}/${two(value.getMonth() + 1)}/${value.getFullYear() + 543}`;
  }
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  return String(value).slice(0, 1000);
}

/** Why a picked file is skipped before it is read, or null. */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (file.name.startsWith('~$')) return 'ข้ามไฟล์ชั่วคราวของ Excel';
  if (!/\.(xlsx|xls|xlsm|csv|zip)$/i.test(file.name)) return 'รองรับเฉพาะไฟล์ .xlsx .xls .xlsm .csv หรือ .zip';
  if (/\.zip$/i.test(file.name)) return file.size > NHSO_MAX_ZIP_BYTES ? 'ไฟล์ .zip ใหญ่เกิน 200 MB' : null;
  if (file.size > NHSO_MAX_FILE_BYTES) return 'ไฟล์ใหญ่เกิน 10 MB';
  return null;
}

export type NhsoUploadAnswer = { ok: true; hcode: string; name: string; fy: number; rows: number; replaced: boolean } | { error?: string; message?: string };

/** One line of the result list: "✓ ไฟล์: นำเข้าแล้ว … — แทนที่ข้อมูลเดิม" or "✗ ไฟล์: เหตุผล". */
export function uploadLine(fileName: string, answer: NhsoUploadAnswer): { ok: boolean; text: string } {
  if ('ok' in answer && answer.ok) {
    return { ok: true, text: `✓ ${fileName}: นำเข้าแล้ว ${answer.hcode} ${answer.name} ปีงบ ${answer.fy} (${answer.rows.toLocaleString('en-US')} แถว)${answer.replaced ? ' — แทนที่ข้อมูลเดิม' : ''}` };
  }
  const failed = answer as { error?: string; message?: string };
  return { ok: false, text: `✗ ${fileName}: ${failed.message ?? moneyErrorMessage(failed.error ?? null)}` };
}
